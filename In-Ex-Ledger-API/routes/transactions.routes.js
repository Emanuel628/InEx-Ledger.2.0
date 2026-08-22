const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createTransactionLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser, getBusinessScopeForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { encrypt, decrypt } = require("../services/encryptionService.js");
const {
  AccountingPeriodLockedError,
  assertDateUnlocked,
  loadAccountingLockState
} = require("../services/accountingLockService.js");
const {
  archiveTransaction,
  restoreMostRecentArchivedTransaction,
  countRestorableArchivedTransactions
} = require("../services/transactionAuditService.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const { buildFeatureRequiresPlanResponse } = require("../middleware/requirePlanFeature.js");
const {
  BasicPlanLimitError,
  assertCanCreateTransactions,
  assertCanImportCsvRows
} = require("../services/basicPlanUsageService.js");
const { evaluateUsageLimitEmails } = require("../services/usageLimitEmailService.js");
const {
  createImportBatch,
  finalizeImportBatch,
  findDuplicateCandidates,
  listImportBatches,
  getImportBatch,
  revertImportBatch
} = require("../services/transactionImportService.js");
const {
  getPayerSummaryForYear,
  getTaxLineSummaryForYear
} = require("../services/taxSummaryService.js");
const { getQuarterlyReminders } = require("../services/quarterlyTaxReminderService.js");
const { getTaxDashboard } = require("../services/taxDashboardService.js");
const { invalidateSnapshotsForBusiness } = require("../services/exportSnapshotService.js");
const { matchesReviewFilter, buildReviewSummary } = require("../services/transactionReviewFlagService.js");
const { sendBookkeepingActivityEmail } = require("../services/bookkeepingEmailService.js");
const {
  buildBusinessTransactionCategorizer,
  resolveCanonicalCategoryTemplate
} = require("../services/transactionCategorizationService.js");
const {
  learnTransactionMappingRules
} = require("../services/transactionMappingRuleService.js");
const {
  validateManualReceiptStatusChange,
  ReceiptStatusValidationError
} = require("../services/receiptStatusService.js");
const { AUDIT_ACTIONS, recordAuditEventForRequest } = require("../services/auditEventService.js");
const { buildRouteErrorContext } = require("../utils/routeErrorContext.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");
const {
  buildTransactionListFilters,
  buildTransactionListWhereClause,
  buildTransactionReviewSourceQuery,
  buildFinalTransactionWhereClause,
  buildTransactionListQuery,
  buildTransactionSummaryQuery
} = require("../services/transactionListQueryService.js");
const {
  isTransactionReviewStatus,
  transactionReviewStatusList
} = require("../config/transactionReviewStatus.js");
const { FEATURE_KEYS } = require("../config/planCatalog.js");
const {
  parseCsv,
  detectColumns,
  extractRowData,
  parseImportDateRange,
  countImportableCsvRows
} = require("../services/transactionCsvImportService.js");

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);
const VALID_TAX_TREATMENTS = new Set(["income", "operating", "capital", "split_use", "nondeductible"]);
const VALID_TAX_FORMS = new Set(["1099-NEC", "1099-K", "T4A", "none"]);
const MAX_TRANSACTION_AMOUNT = 999999999.99;
const MAX_PERCENT = 100;
const TRANSACTION_UNDO_STACK_LIMIT = 20;
const REFERENCE_RATE_CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "AUD", "JPY"]);
const EXCHANGE_RATE_REFERENCE_TIMEOUT_MS = 5000;
const MAX_TRANSACTION_DESCRIPTION_LENGTH = 500;
const MAX_TRANSACTION_NOTE_LENGTH = 2000;
const MAX_TRANSACTION_REVIEW_NOTES_LENGTH = 1000;
const MAX_TRANSACTION_PAYER_NAME_LENGTH = 200;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Every endpoint that returns a full transaction row (GET single, POST, PUT,
// and the cleared/review-status/receipt-status PATCH routes) must enrich it
// with the same account/category fields, or the frontend shows
// "Uncategorized" until the next list refresh. These two fragments are the
// single source of that shape; every query below references a base row
// aliased `t` (a real table alias for the plain SELECT, or the mutation's
// own CTE named `t` for INSERT/UPDATE) so the fragment never needs its own
// identifier substitution.
const TRANSACTION_JOIN_COLUMNS_SQL = `a.name AS account_name,
              c.name AS category_name,
              c.kind AS category_kind,
              c.color AS category_color,
              c.tax_map_us,
              c.tax_map_ca`;
const TRANSACTION_JOIN_CLAUSE_SQL = `LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id`;

router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createTransactionLimiter());

function isReferenceRateDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function deriveCategoryKindFromSlug(slug) {
  const normalized = String(slug ?? "").trim().toLowerCase();
  const parts = normalized.split("_");
  const candidate = parts[1];
  if (candidate === "income" || candidate === "expense") {
    return candidate;
  }
  return null;
}

function deriveCategoryNameFromSlug(slug) {
  const normalized = String(slug ?? "").trim();
  const parts = normalized.split("_");
  if (parts.length > 2) {
    const name = parts.slice(2).join(" ").replace(/-/g, " ");
    if (name.trim()) {
      return name.trim();
    }
  }
  return normalized;
}

function normalizeRegionCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "CA" ? "CA" : "US";
}

async function resolveBusinessRegionCode(db, businessId) {
  const result = await db.query(
    "SELECT region FROM businesses WHERE id = $1 LIMIT 1",
    [businessId]
  );
  return normalizeRegionCode(result.rows[0]?.region);
}

function getCategoryCacheEntryId(cached) {
  if (!cached) {
    return null;
  }
  return typeof cached === "object" ? cached.id || null : cached;
}

async function ensureCategoryTemplateFields(db, businessId, categoryId, template) {
  if (!categoryId || !template) {
    return;
  }

  await db.query(
    `UPDATE categories
        SET color = COALESCE(NULLIF(BTRIM(color), ''), $3),
            tax_map_us = COALESCE(NULLIF(BTRIM(tax_map_us), ''), $4),
            tax_map_ca = COALESCE(NULLIF(BTRIM(tax_map_ca), ''), $5)
      WHERE id = $1
        AND business_id = $2`,
    [
      categoryId,
      businessId,
      template.color || null,
      template.tax_map_us || null,
      template.tax_map_ca || null
    ]
  );
}

/**
 * Resolves a category reference to a category UUID for the given business.
 *
 * Accepts either a raw UUID (returned as-is) or a name/slug string.
 * When a name is provided:
 *   1. An existing category with a case-insensitive name match is reused.
 *   2. If no match is found, a new category is auto-created with the derived
 *      kind (from a "income:" / "expense:" slug prefix) or `fallbackKind`.
 *   3. An ON CONFLICT DO NOTHING insert handles concurrent creation races.
 *
 * @param {string} businessId    - UUID of the business that owns the category.
 * @param {string|null} categoryRef - UUID, name, or slug of the category.
 * @param {string} [fallbackKind]   - Default kind ('income' | 'expense') used
 *                                    when the slug carries no kind prefix.
 * @returns {Promise<string|null>} Resolved category UUID, or null when
 *                                 categoryRef is empty.
 */
async function resolveCategoryId(businessId, categoryRef, fallbackKind) {
  const raw = String(categoryRef ?? "").trim();
  if (!raw) {
    return null;
  }

  if (UUID_REGEX.test(raw)) {
    return raw;
  }

  const kind = deriveCategoryKindFromSlug(raw) || fallbackKind || "expense";
  const name = deriveCategoryNameFromSlug(raw);
  const region = await resolveBusinessRegionCode(pool, businessId);
  const template = resolveCanonicalCategoryTemplate(name, kind, region);

  const existing = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );

  if (existing.rowCount) {
    await ensureCategoryTemplateFields(pool, businessId, existing.rows[0].id, template);
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
    ON CONFLICT (business_id, lower(name)) DO NOTHING
    RETURNING id`,
    [
      crypto.randomUUID(),
      businessId,
      name,
      kind,
      template.color || null,
      template.tax_map_us || null,
      template.tax_map_ca || null
    ]
  );

  if (inserted.rowCount) {
    return inserted.rows[0].id;
  }

  const existingAfterInsert = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );
  if (existingAfterInsert.rowCount) {
    await ensureCategoryTemplateFields(pool, businessId, existingAfterInsert.rows[0].id, template);
  }
  return existingAfterInsert.rows[0]?.id || null;
}

const VALID_CURRENCY_CODES = new Set(Intl.supportedValuesOf("currency"));

function normalizeCurrencyCode(value, fallbackCurrency) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) {
    return fallbackCurrency;
  }
  if (VALID_CURRENCY_CODES.has(raw)) {
    return raw;
  }
  return fallbackCurrency;
}

function parseOptionalDecimal(value, fieldName, { min = null, max = null } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { valid: true, value: null };
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return { valid: false, message: `${fieldName} must be a number` };
  }
  if (min !== null && parsed < min) {
    return { valid: false, message: `${fieldName} must be at least ${min}` };
  }
  if (max !== null && parsed > max) {
    return { valid: false, message: `${fieldName} must be at most ${max}` };
  }
  return { valid: true, value: parsed };
}

function parseOptionalDate(value, fieldName) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { valid: true, value: null };
  }
  if (Number.isNaN(Date.parse(raw))) {
    return { valid: false, message: `${fieldName} must be a valid ISO date` };
  }
  return { valid: true, value: raw.slice(0, 10) };
}

function normalizeOptionalTextField(value, fieldName, maxLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return { valid: true, value: null };
  }
  if (normalized.length > maxLength) {
    return {
      valid: false,
      message: `${fieldName} must be ${maxLength} characters or fewer`
    };
  }
  return { valid: true, value: normalized };
}

function normalizeTransactionTaxPayload(payload, fallbackCurrency) {
  const currency = normalizeCurrencyCode(payload?.currency, fallbackCurrency);
  const sourceAmountResult = parseOptionalDecimal(payload?.source_amount, "source_amount", {
    min: 0,
    max: MAX_TRANSACTION_AMOUNT
  });
  if (!sourceAmountResult.valid) {
    return sourceAmountResult;
  }

  const exchangeRateResult = parseOptionalDecimal(payload?.exchange_rate, "exchange_rate", {
    min: 0
  });
  if (!exchangeRateResult.valid) {
    return exchangeRateResult;
  }

  const exchangeDateResult = parseOptionalDate(payload?.exchange_date, "exchange_date");
  if (!exchangeDateResult.valid) {
    return exchangeDateResult;
  }

  const convertedAmountResult = parseOptionalDecimal(payload?.converted_amount, "converted_amount", {
    min: 0,
    max: MAX_TRANSACTION_AMOUNT
  });
  if (!convertedAmountResult.valid) {
    return convertedAmountResult;
  }

  const indirectTaxAmountResult = parseOptionalDecimal(payload?.indirect_tax_amount, "indirect_tax_amount", {
    min: 0,
    max: MAX_TRANSACTION_AMOUNT
  });
  if (!indirectTaxAmountResult.valid) {
    return indirectTaxAmountResult;
  }

  const personalUsePctResult = parseOptionalDecimal(payload?.personal_use_pct, "personal_use_pct", {
    min: 0,
    max: MAX_PERCENT
  });
  if (!personalUsePctResult.valid) {
    return personalUsePctResult;
  }

  const reviewNotesResult = normalizeOptionalTextField(
    payload?.review_notes,
    "review_notes",
    MAX_TRANSACTION_REVIEW_NOTES_LENGTH
  );
  if (!reviewNotesResult.valid) {
    return reviewNotesResult;
  }

  const taxTreatmentRaw = String(payload?.tax_treatment || "").trim().toLowerCase();
  const taxTreatment = taxTreatmentRaw || null;
  if (taxTreatment && !VALID_TAX_TREATMENTS.has(taxTreatment)) {
    return {
      valid: false,
      message: "tax_treatment must be one of income, operating, capital, split_use, or nondeductible"
    };
  }

  const reviewStatusRaw = String(payload?.review_status || "").trim().toLowerCase();
  const reviewStatus = reviewStatusRaw || null;
  if (reviewStatus && !isTransactionReviewStatus(reviewStatus)) {
    return {
      valid: false,
      message: `review_status must be one of ${transactionReviewStatusList()}`
    };
  }

  const hasEdgeCaseSignals =
    currency !== fallbackCurrency ||
    sourceAmountResult.value !== null ||
    exchangeRateResult.value !== null ||
    exchangeDateResult.value !== null ||
    convertedAmountResult.value !== null ||
    indirectTaxAmountResult.value !== null ||
    personalUsePctResult.value !== null ||
    taxTreatment === "capital" ||
    taxTreatment === "split_use" ||
    taxTreatment === "nondeductible" ||
    reviewNotesResult.value !== null;

  return {
      valid: true,
      normalized: {
        currency,
        source_amount: sourceAmountResult.value,
        exchange_rate: exchangeRateResult.value,
        exchange_date: exchangeDateResult.value,
        converted_amount:
          convertedAmountResult.value !== null
            ? convertedAmountResult.value
            : sourceAmountResult.value !== null && exchangeRateResult.value !== null
              ? Number((sourceAmountResult.value * exchangeRateResult.value).toFixed(2))
              : null,
        tax_treatment: taxTreatment,
        indirect_tax_amount: indirectTaxAmountResult.value,
        indirect_tax_recoverable: payload?.indirect_tax_recoverable === true,
        personal_use_pct: personalUsePctResult.value,
        review_status: reviewStatus || (hasEdgeCaseSignals ? "needs_review" : "ready"),
        review_notes: reviewNotesResult.value
    }
  };
}

async function getBusinessRegionAndCurrency(businessId) {
  const result = await pool.query(
    "SELECT region, province, fiscal_year_start FROM businesses WHERE id = $1 LIMIT 1",
    [businessId]
  );
  const region = String(result.rows[0]?.region || "US").toUpperCase() === "CA" ? "CA" : "US";
  const province = String(result.rows[0]?.province || "").toUpperCase();
  return {
    region,
    province,
    fiscalYearStart: String(result.rows[0]?.fiscal_year_start || "01-01"),
    currency: region === "CA" ? "CAD" : "USD"
  };
}

function validateTransactionPayload(payload, fallbackCurrency = "USD") {
  const { account_id, category_id, amount, date, type, cleared } = payload ?? {};

  if (!account_id) {
    return { valid: false, message: "account_id is required" };
  }

  if (!category_id) {
    return { valid: false, message: "category_id is required" };
  }

  if (amount === undefined || amount === null || amount === "") {
    return { valid: false, message: "amount is required" };
  }

  const normalizedAmount = Number.parseFloat(amount);
  if (!Number.isFinite(normalizedAmount)) {
    return { valid: false, message: "amount must be a number" };
  }

  if (normalizedAmount <= 0 || normalizedAmount > MAX_TRANSACTION_AMOUNT) {
    return { valid: false, message: `amount must be greater than 0 and at most ${MAX_TRANSACTION_AMOUNT}` };
  }

  if (!type || !VALID_TRANSACTION_TYPES.has(type)) {
    return { valid: false, message: "type must be either 'income' or 'expense'" };
  }

  if (!date || typeof date !== "string" || Number.isNaN(Date.parse(date))) {
    return { valid: false, message: "date must be a valid ISO string" };
  }

  if (cleared !== undefined && typeof cleared !== "boolean") {
    return { valid: false, message: "cleared must be true or false" };
  }

  const taxPayload = normalizeTransactionTaxPayload(payload, fallbackCurrency);
  if (!taxPayload.valid) {
    return taxPayload;
  }

  const descriptionResult = normalizeOptionalTextField(
    payload?.description,
    "description",
    MAX_TRANSACTION_DESCRIPTION_LENGTH
  );
  if (!descriptionResult.valid) {
    return descriptionResult;
  }

  const noteResult = normalizeOptionalTextField(
    payload?.note,
    "note",
    MAX_TRANSACTION_NOTE_LENGTH
  );
  if (!noteResult.valid) {
    return noteResult;
  }

  const payerNameResult = normalizeOptionalTextField(
    payload?.payer_name,
    "payer_name",
    MAX_TRANSACTION_PAYER_NAME_LENGTH
  );
  if (!payerNameResult.valid) {
    return payerNameResult;
  }

  return {
    valid: true,
    normalized: {
      account_id,
      category_id,
      amount: normalizedAmount,
      date,
      type,
      cleared: cleared === true,
      description: descriptionResult.value,
      note: noteResult.value,
      payer_name: type === "income" ? payerNameResult.value : null,
      ...taxPayload.normalized
    }
  };
}

function decryptTransactionRow(row) {
  if (!row) return row;
  // Decrypt the description and strip the raw encrypted column from the API response
  const { description_encrypted, ...rest } = row;
  return {
    ...rest,
    description: description_encrypted
      ? tryDecrypt(description_encrypted)
      : row.description
  };
}

function tryDecrypt(value) {
  try {
    return decrypt(value);
  } catch (err) {
    // Decryption failure falls back to returning the raw value so that
    // legacy plain-text entries remain readable during the migration window.
    logWarn("transaction description decryption failed, returning raw value:", err.message);
    return value;
  }
}

function tryEncryptDescription(description) {
  if (!description) return null;
  if (!String(process.env.FIELD_ENCRYPTION_KEY || "").trim()) {
    throw new Error("FIELD_ENCRYPTION_KEY is required to store transaction descriptions.");
  }
  return encrypt(description);
}

function buildStoredDescriptionColumns(description) {
  const encryptedDescription = tryEncryptDescription(description);
  return {
    description: null,
    descriptionEncrypted: encryptedDescription
  };
}

async function assertUnlockedBusinessDates(businessId, ...dates) {
  const lockState = await loadAccountingLockState(pool, businessId);
  dates.filter(Boolean).forEach((date) => assertDateUnlocked(lockState, date));
  return lockState;
}

function toTransactionMutationApiError(err, fallbackMessage) {
  if (err instanceof AccountingPeriodLockedError) {
    return new ApiError(err.status, err.message, {
      code: err.code,
      responseFields: {
        code: err.code,
        locked_through_date: err.lockedThroughDate,
        transaction_date: err.transactionDate
      }
    });
  }

  if (err instanceof BasicPlanLimitError) {
    return new ApiError(err.statusCode, err.message, {
      code: err.code,
      responseFields: {
        code: err.code,
        ...err.details
      }
    });
  }

  if (err instanceof ReceiptStatusValidationError) {
    return new ApiError(err.status, err.message, {
      code: err.code,
      responseFields: { code: err.code }
    });
  }

  if (err?.status && err.status < 500) {
    return err;
  }

  return new ApiError(500, fallbackMessage, { expose: true });
}

function hasAdvancedTransactionPayload(normalized, fallbackCurrency) {
  if (!normalized) {
    return false;
  }

  return (
    normalized.currency !== fallbackCurrency ||
    normalized.source_amount !== null ||
    normalized.exchange_rate !== null ||
    normalized.exchange_date !== null ||
    normalized.converted_amount !== null ||
    normalized.tax_treatment === "capital" ||
    normalized.tax_treatment === "split_use" ||
    normalized.tax_treatment === "nondeductible" ||
    normalized.indirect_tax_amount !== null ||
    normalized.indirect_tax_recoverable === true ||
    normalized.personal_use_pct !== null ||
    (normalized.review_status && normalized.review_status !== "ready") ||
    String(normalized.review_notes || "").trim().length > 0
  );
}

function getMappingMetadata(result, overrides = {}) {
  return {
    mappingReason: overrides.mappingReason || result?.reason || null,
    mappingConfidence: overrides.mappingConfidence || result?.confidence || null,
    mappingRuleId: overrides.mappingRuleId || result?.ruleId || null
  };
}

router.get("/", asyncRoute(async (req, res) => {
  const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
  const filters = buildTransactionListFilters(req.query);
  if (!filters.valid) {
    throw new ApiError(400, filters.error);
  }

  const { whereSql, params: filterParams } = buildTransactionListWhereClause(scope.businessIds, filters);
  const reviewSourceQuery = buildTransactionReviewSourceQuery(whereSql, filterParams);
  const reviewSourceResult = await pool.query(reviewSourceQuery.sql, reviewSourceQuery.params);

    const reviewSourceRows = reviewSourceResult.rows || [];
    const reviewSummary = buildReviewSummary(reviewSourceRows);
    const reviewFilteredRows = filters.review
      ? reviewSourceRows.filter((row) => matchesReviewFilter(row, filters.review))
      : reviewSourceRows;
    const reviewFilteredIds = reviewFilteredRows.map((row) => row.id);

    const { whereSql: finalWhereSql, params: finalFilterParams } = buildFinalTransactionWhereClause(
      whereSql,
      filterParams,
      filters.review,
      reviewFilteredIds
    );

    const listQuery = buildTransactionListQuery(
      finalWhereSql,
      finalFilterParams,
      filters.limit,
      filters.offset,
      TRANSACTION_JOIN_CLAUSE_SQL
    );
    const result = await pool.query(listQuery.sql, listQuery.params);

    const summaryQuery = buildTransactionSummaryQuery(finalWhereSql, finalFilterParams);
    const summaryResult = await pool.query(summaryQuery.sql, summaryQuery.params);

    const summaryRow = summaryResult.rows[0] || {};
    const total = filters.review
      ? reviewFilteredRows.length
      : Number(summaryRow.transaction_count || 0);

  res.status(200).json({
    data: result.rows.map(decryptTransactionRow),
    total,
    limit: filters.limit,
    offset: filters.offset,
    has_more: filters.offset + result.rows.length < total,
    account_id: filters.accountId || null,
    category_id: filters.categoryId || null,
    type: filters.type || "all",
    search: filters.search || "",
    period: filters.period,
    returned_all: filters.wantsAll,
    review_summary: reviewSummary,
    review_filter: filters.review || "",
    summary: {
      transaction_count: total,
      income_total: Number(summaryRow.income_total || 0),
      expense_total: Number(summaryRow.expense_total || 0),
      current_month_count: Number(summaryRow.current_month_count || 0),
      current_year_income: Number(summaryRow.current_year_income || 0),
      current_year_expenses: Number(summaryRow.current_year_expenses || 0),
      previous_year_income: Number(summaryRow.previous_year_income || 0),
      previous_year_expenses: Number(summaryRow.previous_year_expenses || 0)
    }
  });
}));

router.post("/", asyncRoute(async (req, res) => {
  let client = null;
  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const businessTaxContext = await getBusinessRegionAndCurrency(businessId);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      throw new ApiError(400, validation.message);
    }
    if (
      hasAdvancedTransactionPayload(validation.normalized, businessTaxContext.currency) &&
      !hasFeatureAccess(subscription, FEATURE_KEYS.EDGE_CASE_TOOLS)
    ) {
      throw new ApiError(403, "This feature requires a plan upgrade.", {
        responseFields: buildFeatureRequiresPlanResponse(subscription, FEATURE_KEYS.EDGE_CASE_TOOLS)
      });
    }

    const { account_id, category_id, amount, type, date, cleared, description, note, payer_name: payerName } = validation.normalized;
    const taxFormType = type === "income" && VALID_TAX_FORMS.has(req.body.tax_form_type) ? req.body.tax_form_type : null;
    await assertUnlockedBusinessDates(businessId, date);
    const storedDescription = buildStoredDescriptionColumns(description);

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      throw new ApiError(400, "account_id does not belong to your business");
    }

    const mappedCategoryId = await resolveCategoryId(
      businessId,
      category_id,
      type
    );

    if (!mappedCategoryId) {
      throw new ApiError(400, "category_id is invalid");
    }

    // Acquire a per-business advisory lock so the count check and INSERT are
    // atomic. Two concurrent requests at the free-tier cap cannot both pass
    // the check and both insert — the second one will re-read the updated count
    // while the lock is held by the first.
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [businessId]);
    await assertCanCreateTransactions(client, businessId, 1, { subscription });

    const result = await client.query(
      `WITH t AS (
         INSERT INTO transactions
           (id, business_id, account_id, category_id, amount, type, cleared, description, description_encrypted, date, note,
            currency, source_amount, exchange_rate, exchange_date, converted_amount, tax_treatment,
            indirect_tax_amount, indirect_tax_recoverable, personal_use_pct, review_status, review_notes,
            payer_name, tax_form_type, category_mapping_reason, category_mapping_confidence, category_mapping_rule_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
                 $23, $24, $25, $26, $27)
         RETURNING *
       )
       SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM t
         ${TRANSACTION_JOIN_CLAUSE_SQL}`,
      [
        crypto.randomUUID(),
        businessId,
        account_id,
        mappedCategoryId,
        amount,
        type,
        cleared,
        storedDescription.description,
        storedDescription.descriptionEncrypted,
        date,
        note,
        validation.normalized.currency || businessTaxContext.currency,
        validation.normalized.source_amount,
        validation.normalized.exchange_rate,
        validation.normalized.exchange_date,
        validation.normalized.converted_amount !== null
          ? validation.normalized.converted_amount
          : amount,
        validation.normalized.tax_treatment || (type === "income" ? "income" : "operating"),
        validation.normalized.indirect_tax_amount,
        validation.normalized.indirect_tax_recoverable,
        validation.normalized.personal_use_pct,
        validation.normalized.review_status || "ready",
        validation.normalized.review_notes,
        payerName,
        taxFormType,
        "manual",
        "manual",
        null
      ]
    );
    await client.query("COMMIT");
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));

    // Best-effort: notify Basic businesses as they approach their monthly cap.
    void evaluateUsageLimitEmails({ businessId, resources: ["transactions"], subscription });

    res.status(201).json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    logError("POST /transactions error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to save transaction.");
  } finally {
    if (client) client.release();
  }
}));

router.get("/mapping-rules", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const result = await pool.query(
      `SELECT r.id,
              r.transaction_kind,
              r.match_field,
              r.match_operator,
              r.match_value,
              r.match_value_normalized,
              r.confidence,
              r.created_at,
              r.updated_at,
              c.id AS category_id,
              c.name AS category_name,
              c.kind AS category_kind
         FROM transaction_mapping_rules r
         JOIN categories c ON c.id = r.category_id
        WHERE r.business_id = $1
        ORDER BY r.match_field ASC, r.match_value ASC, r.created_at DESC`,
      [businessId]
    );
  res.json({ rules: result.rows });
}));

router.get("/:id", asyncRoute(async (req, res, next) => {
  if (!UUID_REGEX.test(req.params.id)) {
    // Defined below this handler are static GET routes like
    // /exchange-rate-reference and /undo-delete-status. Express matches
    // `:id` first, so returning 400 here would shadow them and break
    // their tests. Hand off to the next matching route; if none matches,
    // Express will 404, which is the correct response for a non-UUID
    // path that isn't a known static endpoint.
    return next();
  }

  const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM transactions t
         ${TRANSACTION_JOIN_CLAUSE_SQL}
        WHERE t.id = $1
          AND t.business_id = $2
          AND t.deleted_at IS NULL
          AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
          AND (t.is_void = false OR t.is_void IS NULL)
        LIMIT 1`,
      [req.params.id, businessId]
    );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Transaction not found.");
  }

  res.json(decryptTransactionRow(result.rows[0]));
}));

router.delete("/mapping-rules/:ruleId", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.ruleId)) {
    throw new ApiError(400, "Invalid mapping rule ID.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);
  const result = await pool.query(
      `DELETE FROM transaction_mapping_rules
        WHERE id = $1
          AND business_id = $2
      RETURNING id`,
      [req.params.ruleId, businessId]
    );
  if (!result.rowCount) {
    throw new ApiError(404, "Mapping rule not found.");
  }
  res.json({ deleted: true, id: req.params.ruleId });
}));

router.put("/:id", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid transaction ID.");
  }
  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const businessTaxContext = await getBusinessRegionAndCurrency(businessId);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      throw new ApiError(400, validation.message);
    }
    if (
      hasAdvancedTransactionPayload(validation.normalized, businessTaxContext.currency) &&
      !hasFeatureAccess(subscription, FEATURE_KEYS.EDGE_CASE_TOOLS)
    ) {
      throw new ApiError(403, "This feature requires a plan upgrade.", {
        responseFields: buildFeatureRequiresPlanResponse(subscription, FEATURE_KEYS.EDGE_CASE_TOOLS)
      });
    }
    const { account_id, category_id, amount, type, date, cleared, description, note, payer_name: payerName } = validation.normalized;

    // Verify the original transaction exists and belongs to this business
    const originalResult = await pool.query(
      `SELECT id, date, type, category_id, import_source, merchant_name, category_guess,
              COALESCE(description, description_encrypted) AS description
         FROM transactions
        WHERE id = $1 AND business_id = $2 AND is_adjustment = false AND deleted_at IS NULL`,
      [req.params.id, businessId]
    );
    if (originalResult.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    await assertUnlockedBusinessDates(businessId, originalResult.rows[0].date, date);

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      throw new ApiError(400, "account_id does not belong to your business");
    }

    const mappedCategoryId = await resolveCategoryId(businessId, category_id, type);
    if (!mappedCategoryId) {
      throw new ApiError(400, "category_id is invalid");
    }

    const storedDescription = buildStoredDescriptionColumns(description);
    const taxFormType = type === "income" && VALID_TAX_FORMS.has(req.body.tax_form_type) ? req.body.tax_form_type : null;

    const result = await pool.query(
      `WITH t AS (
         UPDATE transactions
            SET account_id              = $1,
                category_id             = $2,
                amount                  = $3,
                type                    = $4,
                cleared                 = $5,
                description             = $6,
                description_encrypted   = $7,
                date                    = $8,
                note                    = $9,
                currency                = $10,
                source_amount           = $11,
                exchange_rate           = $12,
                exchange_date           = $13,
                converted_amount        = $14,
                tax_treatment           = $15,
                indirect_tax_amount     = $16,
                indirect_tax_recoverable= $17,
                personal_use_pct        = $18,
                review_status           = $19,
                review_notes            = $20,
                payer_name              = $21,
                tax_form_type           = $22,
                category_mapping_reason = $23,
                category_mapping_confidence = $24,
                category_mapping_rule_id = $25,
                adjusted_by_id          = $26,
                adjusted_at             = NOW()
          WHERE id = $27
            AND business_id = $28
            AND deleted_at IS NULL
            AND (is_adjustment = false OR is_adjustment IS NULL)
         RETURNING *
       )
       SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM t
         ${TRANSACTION_JOIN_CLAUSE_SQL}`,
      [
        account_id,
        mappedCategoryId,
        amount,
        type,
        cleared,
        storedDescription.description,
        storedDescription.descriptionEncrypted,
        date,
        note,
        validation.normalized.currency || businessTaxContext.currency,
        validation.normalized.source_amount,
        validation.normalized.exchange_rate,
        validation.normalized.exchange_date,
        validation.normalized.converted_amount !== null ? validation.normalized.converted_amount : amount,
        validation.normalized.tax_treatment || (type === "income" ? "income" : "operating"),
        validation.normalized.indirect_tax_amount,
        validation.normalized.indirect_tax_recoverable,
        validation.normalized.personal_use_pct,
        validation.normalized.review_status || "ready",
        validation.normalized.review_notes,
        payerName,
        taxFormType,
        "manual",
        "manual",
        null,
        req.user.id,
        req.params.id,
        businessId
      ]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    const originalTxn = originalResult.rows[0];
    if (
      originalTxn
      && ["csv", "plaid"].includes(String(originalTxn.import_source || "").toLowerCase())
      && mappedCategoryId
      && mappedCategoryId !== originalTxn.category_id
      && ["ready", "matched", "locked"].includes(String(validation.normalized.review_status || "ready"))
    ) {
      const ruleTxn = {
        type,
        merchant_name: originalTxn.merchant_name,
        category_guess: originalTxn.category_guess,
        description: tryDecrypt(originalTxn.description)
      };
      await learnTransactionMappingRules(pool, businessId, ruleTxn, {
        categoryId: mappedCategoryId,
        userId: req.user.id
      });
    }
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PUT /transactions/:id error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to update transaction.");
  }
}));

router.delete("/bulk-delete-all", asyncRoute(async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const ownerCheck = await pool.query(
      "SELECT id FROM businesses WHERE id = $1 AND user_id = $2 LIMIT 1",
      [businessId, req.user.id]
    );
    if (!ownerCheck.rowCount) {
      throw new ApiError(403, "Only the business owner can delete all transactions.");
    }
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "DELETE") {
      throw new ApiError(400, "Confirmation required. Send { confirm: 'DELETE' }.");
    }
    const rawAccountId = String(req.body?.accountId || "").trim();
    const accountId = rawAccountId && rawAccountId !== "ALL" ? rawAccountId : null;
    if (accountId) {
      const accountCheck = await pool.query(
        "SELECT id FROM accounts WHERE id = $1 AND business_id = $2 LIMIT 1",
        [accountId, businessId]
      );
      if (!accountCheck.rowCount) {
        throw new ApiError(404, "Account not found for this business.");
      }
    }
    const lockState = await loadAccountingLockState(pool, businessId);
    if (lockState?.lockedThroughDate) {
      const lockedTransactionParams = accountId
        ? [businessId, lockState.lockedThroughDate, accountId]
        : [businessId, lockState.lockedThroughDate];
      const lockedTransaction = await pool.query(
        `SELECT id
           FROM transactions
          WHERE business_id = $1
            AND deleted_at IS NULL
            AND date <= $2
            ${accountId ? "AND account_id = $3" : ""}
          LIMIT 1`,
        lockedTransactionParams
      );
      if (lockedTransaction.rowCount > 0) {
        throw new ApiError(409, "Some transactions are in a locked accounting period and cannot be deleted.", {
          code: "ACCOUNTING_PERIOD_LOCKED",
          responseFields: {
            code: "ACCOUNTING_PERIOD_LOCKED",
            locked_through_date: lockState.lockedThroughDate
          }
        });
      }
    }
    const deleteParams = accountId ? [businessId, accountId] : [businessId];
    const result = await pool.query(
      `UPDATE transactions
          SET deleted_at = now(), is_void = true, voided_at = now(), deleted_reason = 'bulk_delete_all'
        WHERE business_id = $1
          AND deleted_at IS NULL
          ${accountId ? "AND account_id = $2" : ""}`,
      deleteParams
    );
    // Delete All is a hard reset: any transaction that was already
    // soft-deleted (and still undo-eligible) before this run must also be
    // excluded, or its pre-existing undo entry would keep the Undo Delete
    // button visible after the reset.
    await pool.query(
      `UPDATE transactions
          SET deleted_reason = 'bulk_delete_all'
        WHERE business_id = $1
          AND deleted_at IS NOT NULL
          AND (is_void = true OR is_void IS NULL)
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_reason IS DISTINCT FROM 'bulk_delete_all'
          ${accountId ? "AND account_id = $2" : ""}`,
      deleteParams
    );
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));
    res.json({ message: `Deleted ${result.rowCount} transaction(s).`, count: result.rowCount });
  } catch (err) {
    logError("DELETE /transactions/bulk-delete-all error", buildRouteErrorContext(req, err));
    if (err.status && err.status < 500) {
      throw err;
    }
    throw new ApiError(500, "Failed to delete transactions.");
  }
}));

router.delete("/:id", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid transaction ID.");
  }
  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      "SELECT id, date FROM transactions WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL AND (is_adjustment = false OR is_adjustment IS NULL) AND (is_void = false OR is_void IS NULL) LIMIT 1",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    await assertUnlockedBusinessDates(businessId, existing.rows[0].date);

    const archived = await archiveTransaction({
      pool,
      businessId,
      transactionId: req.params.id,
      userId: req.user.id,
      reason: req.body?.reason || null
    });

    if (!archived) {
      throw new ApiError(404, "Transaction not found.");
    }
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));

    res.json({ message: "Transaction deleted." });
  } catch (err) {
    logError("DELETE /transactions/:id error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to delete transaction.");
  }
}));

router.post("/undo-delete", asyncRoute(async (req, res) => {
  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const candidate = await pool.query(
      `SELECT id, date
         FROM transactions
        WHERE business_id = $1
          AND deleted_at IS NOT NULL
          AND (is_void = true OR is_void IS NULL)
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_reason IS DISTINCT FROM 'bulk_delete_all'
        ORDER BY deleted_at DESC, voided_at DESC, created_at DESC
        LIMIT $2`,
      [businessId, TRANSACTION_UNDO_STACK_LIMIT]
    );

    if (candidate.rowCount === 0) {
      throw new ApiError(404, "No archived transaction is available to restore.");
    }

    await assertUnlockedBusinessDates(businessId, candidate.rows[0].date);

    const restored = await restoreMostRecentArchivedTransaction({
      pool,
      businessId,
      transactionId: candidate.rows[0].id,
      userId: req.user.id
    });

    if (!restored) {
      throw new ApiError(404, "No archived transaction is available to restore.");
    }

    const remainingUndoCount = await countRestorableArchivedTransactions({
      pool,
      businessId,
      limit: TRANSACTION_UNDO_STACK_LIMIT
    });

    res.json({
      message: "Transaction restored.",
      transaction: decryptTransactionRow(restored),
      remaining_undo_count: remainingUndoCount,
      undo_stack_limit: TRANSACTION_UNDO_STACK_LIMIT
    });
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));
  } catch (err) {
    logError("POST /transactions/undo-delete error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to restore transaction.");
  }
}));

router.get("/undo-delete-status", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const remainingUndoCount = await countRestorableArchivedTransactions({
    pool,
    businessId,
    limit: TRANSACTION_UNDO_STACK_LIMIT
  });

  res.json({
    remaining_undo_count: remainingUndoCount,
    undo_stack_limit: TRANSACTION_UNDO_STACK_LIMIT
  });
}));

router.get("/exchange-rate-reference", async (req, res) => {
  try {
    const from = String(req.query.from || "").trim().toUpperCase();
    const to = String(req.query.to || "").trim().toUpperCase();
    const requestedDate = String(req.query.date || "").trim();

    if (!REFERENCE_RATE_CURRENCIES.has(from) || !REFERENCE_RATE_CURRENCIES.has(to)) {
      return res.status(400).json({ error: "Unsupported currency pair." });
    }

    if (from === to) {
      return res.json({
        from,
        to,
        rate: 1,
        date: requestedDate || new Date().toISOString().slice(0, 10),
        source: "same-currency",
        advisory: "Reference only. Confirm the final rate independently before filing or reconciliation."
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const effectiveDate = isReferenceRateDate(requestedDate) && requestedDate <= today ? requestedDate : "latest";
    const endpoint =
      effectiveDate === "latest"
        ? `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `https://api.frankfurter.app/${effectiveDate}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), EXCHANGE_RATE_REFERENCE_TIMEOUT_MS)
      : null;
    let response;
    try {
      response = await fetch(endpoint, {
        headers: {
          accept: "application/json"
        },
        ...(controller ? { signal: controller.signal } : {})
      });
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      logWarn("GET /transactions/exchange-rate-reference upstream error", {
        status: response.status,
        from,
        to,
        requestedDate
      });
      return res.status(502).json({ error: "Unable to load a reference exchange rate right now." });
    }

    const payload = await response.json();
    const rate = Number(payload?.rates?.[to]);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(404).json({ error: "Reference exchange rate unavailable for that currency pair." });
    }

    res.json({
      from,
      to,
      rate,
      date: payload?.date || (effectiveDate === "latest" ? today : effectiveDate),
      source: "Frankfurter",
      advisory: "Reference only. Confirm the final rate independently before filing or reconciliation."
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      logWarn("GET /transactions/exchange-rate-reference timed out", err);
      return res.status(504).json({ error: "Reference exchange rate lookup timed out." });
    }
    logError("GET /transactions/exchange-rate-reference error", buildRouteErrorContext(req, err));
    res.status(500).json({ error: "Failed to load the reference exchange rate." });
  }
});

router.patch("/:id/review-status", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid transaction ID.");
  }
  const status = String(req.body?.review_status || "").trim().toLowerCase();
  if (!isTransactionReviewStatus(status)) {
    throw new ApiError(400, `review_status must be one of ${transactionReviewStatusList()}`);
  }

  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      `SELECT id, date
         FROM transactions
        WHERE id = $1
          AND business_id = $2
          AND deleted_at IS NULL
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND (is_void = false OR is_void IS NULL)
        LIMIT 1`,
      [req.params.id, businessId]
    );
    if (existing.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    await assertUnlockedBusinessDates(businessId, existing.rows[0].date);

    const result = await pool.query(
      `WITH t AS (
         UPDATE transactions
            SET review_status = $1
          WHERE id = $2
            AND business_id = $3
            AND deleted_at IS NULL
            AND (is_adjustment = false OR is_adjustment IS NULL)
            AND (is_void = false OR is_void IS NULL)
         RETURNING *
       )
       SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM t
         ${TRANSACTION_JOIN_CLAUSE_SQL}`,
      [status, req.params.id, businessId]
    );
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));
    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /transactions/:id/review-status error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to update review status.");
  }
}));

router.patch("/:id/cleared", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid transaction ID.");
  }
  if (typeof req.body?.cleared !== "boolean") {
    throw new ApiError(400, "cleared must be true or false");
  }

  let businessId = null;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      "SELECT id, date FROM transactions WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL LIMIT 1",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }

    await assertUnlockedBusinessDates(businessId, existing.rows[0].date);
    const result = await pool.query(
      `WITH t AS (
         UPDATE transactions
            SET cleared = $1
          WHERE id = $2
            AND business_id = $3
            AND deleted_at IS NULL
            AND (is_adjustment = false OR is_adjustment IS NULL)
            AND (is_void = false OR is_void IS NULL)
         RETURNING *
       )
       SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM t
         ${TRANSACTION_JOIN_CLAUSE_SQL}`,
      [req.body.cleared, req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /transactions/:id/cleared error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "Failed to update cleared status.");
  }
}));

// receipt_status can never be set to 'attached' through this endpoint — that
// value is only ever derived from an actual receipt file being on record
// (see services/receiptStatusService.js, wired into routes/receipts.routes.js).
// This endpoint exists solely for the user-driven attestations: confirming a
// receipt is missing (with a reason) or not required (with a business
// purpose), or resetting back to pending. It never touches `cleared`, amount,
// category, or any other transaction field.
router.patch("/:id/receipt-status", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid transaction ID.");
  }

  try {
    const normalizedStatus = validateManualReceiptStatusChange({
      status: req.body?.receipt_status,
      receiptMissingReason: req.body?.receipt_missing_reason,
      businessPurpose: req.body?.business_purpose
    });
    const businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      `SELECT t.id,
              t.date,
              COALESCE(rc.receipt_count, 0)::int AS receipt_count
         FROM transactions t
         LEFT JOIN (
           SELECT transaction_id, COUNT(*)::int AS receipt_count
             FROM receipts
            WHERE transaction_id = $1
            GROUP BY transaction_id
         ) rc ON rc.transaction_id = t.id
        WHERE t.id = $1
          AND t.business_id = $2
          AND t.deleted_at IS NULL
          AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
          AND (t.is_void = false OR t.is_void IS NULL)
        LIMIT 1`,
      [req.params.id, businessId]
    );
    if (existing.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }
    if (Number(existing.rows[0].receipt_count || 0) > 0) {
      throw new ApiError(
        409,
        "This transaction already has a receipt file on record. Remove it before changing the receipt status manually.",
        {
          code: "receipt_status_conflict",
          responseFields: { code: "receipt_status_conflict" }
        }
      );
    }
    await assertUnlockedBusinessDates(businessId, existing.rows[0].date);

    const receiptMissingReason = normalizedStatus === "missing"
      ? String(req.body?.receipt_missing_reason || "").trim()
      : null;
    const businessPurpose = normalizedStatus === "not_required"
      ? String(req.body?.business_purpose || "").trim()
      : null;
    const supportingEvidence = String(req.body?.supporting_evidence || "").trim() || null;

    const result = await pool.query(
      `WITH t AS (
         UPDATE transactions
            SET receipt_status = $1,
                receipt_missing_reason = $2,
                business_purpose = $3,
                supporting_evidence = $4,
                receipt_status_confirmed_at = NOW(),
                receipt_status_confirmed_by = $5
          WHERE id = $6
            AND business_id = $7
            AND deleted_at IS NULL
            AND (is_adjustment = false OR is_adjustment IS NULL)
            AND (is_void = false OR is_void IS NULL)
         RETURNING *
       )
       SELECT t.*,
              ${TRANSACTION_JOIN_COLUMNS_SQL}
         FROM t
         ${TRANSACTION_JOIN_CLAUSE_SQL}`,
      [
        normalizedStatus,
        receiptMissingReason,
        businessPurpose,
        supportingEvidence,
        req.user.id,
        req.params.id,
        businessId
      ]
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Transaction not found.");
    }

    void invalidateSnapshotsForBusiness({
      businessId,
      reason: "Transactions changed after export."
    }).catch((error) => logWarn("Transaction snapshot invalidation failed", { businessId, err: error.message }));
    void recordAuditEventForRequest(pool, req, {
      action: AUDIT_ACTIONS.TRANSACTION_UPDATED,
      businessId,
      metadata: {
        transactionId: req.params.id,
        field: "receipt_status",
        receiptStatus: normalizedStatus
      }
    });

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /transactions/:id/receipt-status error", buildRouteErrorContext(req, err));
    throw toTransactionMutationApiError(err, "Failed to update receipt status.");
  }
}));

/* =========================================================
   CSV IMPORT  —  POST /transactions/import/csv
   ========================================================= */

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok = file.mimetype === "text/csv"
      || file.mimetype === "application/csv"
      || file.mimetype === "text/plain"
      || file.originalname.toLowerCase().endsWith(".csv");
    if (!ok) {
      return cb(new Error("Only CSV files are accepted."));
    }
    cb(null, true);
  }
});

router.post("/import/csv", csvUpload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "CSV file is required.");
  }

  let client = null;
  let businessId = null;
  let importedFilename = String(req.file?.originalname || "").trim() || "CSV file";
  try {
    businessId = await resolveBusinessIdForUser(req.user);

    // CSV import is available on every tier. Basic businesses are metered by
    // the monthly import + transaction caps, enforced below before any insert.
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    const accountId = String(req.body?.account_id || "").trim();
    if (!accountId || !UUID_REGEX.test(accountId)) {
      throw new ApiError(400, "account_id is required and must be a valid UUID.");
    }

    const skipDuplicates = String(req.body?.skip_duplicates ?? "true").toLowerCase() !== "false";

    // Optional date-range filter. Rows outside the range are skipped (not errored).
    // Either bound may be empty; an empty bound means "no limit on that side".
    const dateRange = parseImportDateRange(req.body || {});
    if (dateRange.error) {
      throw new ApiError(400, dateRange.error);
    }
    const filterStartDate = dateRange.startDate;
    const filterEndDate = dateRange.endDate;

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [accountId, businessId]
    );
    if (accountCheck.rowCount === 0) {
      throw new ApiError(400, "account_id does not belong to your business.");
    }

    const { region, currency: fallbackCurrency } = await getBusinessRegionAndCurrency(businessId);
    const lockState = await loadAccountingLockState(pool, businessId);
    const categorizeImportedTransaction = await buildBusinessTransactionCategorizer(pool, {
      businessId,
      region
    });

    const csvText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      throw new ApiError(400, "CSV file is empty or could not be parsed.");
    }

    const headers = Object.keys(rows[0]);
    const cols = detectColumns(headers);

    if (!cols.dateCol) {
      throw new ApiError(400, "Could not detect a date column. Expected a column named 'date', 'transaction_date', or similar.");
    }
    if (!cols.descCol) {
      throw new ApiError(400, "Could not detect a description column. Expected 'description', 'payee', 'memo', or similar.");
    }
    if (!cols.amountCol && !cols.withdrawalCol && !cols.depositCol) {
      throw new ApiError(400, "Could not detect an amount column. Expected 'amount', 'withdrawal', 'deposit', or similar.");
    }

    async function getOrCreateCsvCategory(db, categoryCache, name, kind) {
      const key = `${kind}::${name.toLowerCase()}`;
      const template = resolveCanonicalCategoryTemplate(name, kind, region);
      if (categoryCache.has(key)) {
        const cached = categoryCache.get(key);
        const categoryId = getCategoryCacheEntryId(cached);
        await ensureCategoryTemplateFields(db, businessId, categoryId, template);
        return categoryId;
      }
      const existing = await db.query(
        "SELECT id, color, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
        [businessId, name]
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        await ensureCategoryTemplateFields(db, businessId, row.id, template);
        categoryCache.set(key, row);
        return row.id;
      }
      let result = await db.query(
        `INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (business_id, lower(name)) DO NOTHING
         RETURNING id, color, tax_map_us, tax_map_ca`,
        [
          crypto.randomUUID(),
          businessId,
          name,
          kind,
          template.color,
          template.tax_map_us,
          template.tax_map_ca
        ]
      );
      if (!result.rowCount) {
        result = await db.query(
          "SELECT id, color, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
          [businessId, name]
        );
      }
      const row = result.rows[0] || null;
      const id = row?.id;
      if (id) {
        await ensureCategoryTemplateFields(db, businessId, id, template);
        categoryCache.set(key, row || { id });
      }
      return id;
    }

    const results = { imported: 0, skipped: 0, duplicates: 0, out_of_range: 0, errors: [], skipped_rows: [] };
    const MAX_ROWS = 1000;
    const rowsToProcess = rows.slice(0, MAX_ROWS);
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [businessId]);

    const existingCats = await client.query(
      "SELECT id, name, kind, color, tax_map_us, tax_map_ca FROM categories WHERE business_id = $1",
      [businessId]
    );
    const categoryCache = new Map();
    for (const cat of existingCats.rows) {
      categoryCache.set(`${cat.kind}::${cat.name.toLowerCase()}`, cat);
    }

    // Count rows that would actually import (valid fields + within the date
    // range) and block the whole import up-front if it would exceed the Basic
    // monthly allowance. Imported rows consume transaction slots, so the import
    // is never silently truncated — the user is asked to narrow the date range
    // or upgrade. Splitting one CSV into several files cannot bypass the cap
    // because the limit is a monthly usage cap, not a per-upload cap.
    const csvValidRowCount = await countImportableCsvRows(rowsToProcess, cols, {
      client,
      businessId,
      accountId,
      filterStartDate,
      filterEndDate,
      skipDuplicates,
      lockState
    });
    await assertCanImportCsvRows(client, businessId, csvValidRowCount, { subscription });

    const batch = await createImportBatch(client, {
      businessId,
      accountId,
      source: "csv",
      filename: req.file.originalname || null,
      importedByUserId: req.user?.id || null
    });

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const { amount, type, description, merchantName, categoryGuess, date } = extractRowData(row, cols);

      if (!date || !amount || !type || amount <= 0 || !description) {
        const missing = [];
        if (!date) missing.push("date");
        if (!amount || amount <= 0) missing.push("amount");
        if (!type) missing.push("type");
        if (!description) missing.push("description");
        results.skipped_rows.push({
          row: i + 2,
          reason_code: "missing_required_field",
          reason: `Row ${i + 2}: missing or invalid ${missing.join(", ")}`,
          date: date || null,
          description: description || null,
          merchant_name: merchantName || null,
          category_guess: categoryGuess || null,
          amount: amount || null,
          type: type || null
        });
        results.skipped++;
        continue;
      }

      if (filterStartDate && date < filterStartDate) {
        results.out_of_range++;
        continue;
      }
      if (filterEndDate && date > filterEndDate) {
        results.out_of_range++;
        continue;
      }

      try {
        assertDateUnlocked(lockState, date);
      } catch {
        const reason = `Row ${i + 2}: date ${date} falls within a locked accounting period`;
        results.errors.push({ row: i + 2, reason });
        results.skipped_rows.push({
          row: i + 2,
          reason_code: "locked_period",
          reason,
          date,
          description,
          merchant_name: merchantName || null,
          category_guess: categoryGuess || null,
          amount,
          type
        });
        results.skipped++;
        continue;
      }

      if (skipDuplicates) {
        const candidates = await findDuplicateCandidates(client, {
          businessId,
          accountId,
          date,
          amount,
          type,
          description,
          dateWindowDays: 2
        });
        if (candidates.length > 0) {
          results.duplicates++;
          continue;
        }
      }

      const detectedCategory = categorizeImportedTransaction({
        type,
        description,
        merchantName,
        categoryGuess
      });
      const mappingMeta = getMappingMetadata(detectedCategory);
      const categoryId = await getOrCreateCsvCategory(
        client,
        categoryCache,
        detectedCategory.categoryName,
        type
      );
      if (!categoryId) {
        const reason = `Row ${i + 2}: could not resolve category`;
        results.errors.push({ row: i + 2, reason });
        results.skipped_rows.push({
          row: i + 2,
          reason_code: "category_unresolved",
          reason,
          date,
          description,
          merchant_name: merchantName || null,
          category_guess: categoryGuess || null,
          amount,
          type
        });
        results.skipped++;
        continue;
      }

      const storedDescription = buildStoredDescriptionColumns(description);
      const taxTreatment = type === "income" ? "income" : "operating";

      try {
        await client.query(
          `INSERT INTO transactions
            (id, business_id, account_id, category_id, amount, type, cleared, description, description_encrypted,
             date, merchant_name, category_guess, currency, tax_treatment, review_status, converted_amount, import_batch_id, import_source,
             category_mapping_reason, category_mapping_confidence, category_mapping_rule_id)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, 'needs_review', $5, $14, 'csv',
                   $15, $16, $17)`,
          [
            crypto.randomUUID(),
            businessId,
            accountId,
            categoryId,
            amount,
            type,
            storedDescription.description,
            storedDescription.descriptionEncrypted,
            date,
            merchantName || null,
            categoryGuess || null,
            fallbackCurrency,
            taxTreatment,
            batch.id,
            mappingMeta.mappingReason,
            mappingMeta.mappingConfidence,
            mappingMeta.mappingRuleId
          ]
        );
        results.imported++;
      } catch (insertErr) {
        const reason = `Row ${i + 2}: ${insertErr.message}`;
        results.errors.push({ row: i + 2, reason });
        results.skipped_rows.push({
          row: i + 2,
          reason_code: "insert_failed",
          reason,
          date,
          description,
          merchant_name: merchantName || null,
          category_guess: categoryGuess || null,
          amount,
          type
        });
        results.skipped++;
      }
    }

    if (rows.length > MAX_ROWS) {
      results.truncated = true;
      results.truncated_at = MAX_ROWS;
    }

    await finalizeImportBatch(client, batch.id, {
      imported: results.imported,
      duplicate: results.duplicates,
      failed: results.errors.length,
      totalRows: rowsToProcess.length
    });
    await client.query("COMMIT");

    // Best-effort: notify Basic businesses as they approach their monthly caps.
    if (results.imported > 0) {
      void evaluateUsageLimitEmails({
        businessId,
        resources: ["transactions", "csvImportRows"],
        subscription
      });
    }
    void sendBookkeepingActivityEmail({
      businessId,
      userId: req.user?.id,
      kind: "csv_completed",
      actionPath: "/transactions",
      details: [
        { label: "File", value: importedFilename },
        { label: "Imported", value: String(results.imported) },
        { label: "Skipped", value: String(results.skipped + results.duplicates) }
      ]
    });

    const rangePart = (filterStartDate || filterEndDate)
      ? `, ${results.out_of_range} outside date range`
      : "";
    res.status(200).json({
      message: `Import complete. ${results.imported} imported, ${results.duplicates} skipped as duplicate, ${results.skipped} skipped${rangePart}.`,
      batch_id: batch.id,
      start_date: filterStartDate,
      end_date: filterEndDate,
      ...results
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    if (businessId) {
      void sendBookkeepingActivityEmail({
        businessId,
        userId: req.user?.id,
        kind: "csv_failed",
        actionPath: "/transactions",
        details: [
          { label: "File", value: importedFilename },
          { label: "Issue", value: String(err?.message || "CSV import failed.").slice(0, 240) }
        ]
      });
    }
    logError("POST /transactions/import/csv error", buildRouteErrorContext(req, err, { businessId }));
    throw toTransactionMutationApiError(err, "CSV import failed.");
  } finally {
    if (client) client.release();
  }
}));

/* =========================================================
   IMPORT BATCH HISTORY  —  GET /transactions/import/history
   ========================================================= */
router.get("/import/history", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const batches = await listImportBatches(pool, businessId, { limit: req.query.limit });
  res.json({ batches });
}));

/* =========================================================
   UNDO IMPORT BATCH  —  POST /transactions/import/:id/revert
   ========================================================= */
router.post("/import/:id/revert", asyncRoute(async (req, res) => {
  const batchId = String(req.params.id || "").trim();
  if (!UUID_REGEX.test(batchId)) {
    throw new ApiError(400, "Invalid import batch id.");
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const batch = await getImportBatch(pool, businessId, batchId);
    if (!batch) {
      throw new ApiError(404, "Import batch not found.");
    }
    if (batch.status === "reverted") {
      throw new ApiError(409, "This import batch has already been reverted.");
    }

    const lockState = await loadAccountingLockState(pool, businessId);
    const result = await revertImportBatch(pool, {
      businessId,
      batchId,
      userId: req.user?.id || null,
      lockState
    });

    res.json({
      message: `Reverted ${result.revertedCount} imported transaction(s).`,
      batch_id: batchId,
      reverted_count: result.revertedCount
    });
  } catch (err) {
    if (err && err.code === "accounting_period_locked") {
      throw new ApiError(409, err.message, {
        code: err.code,
        responseFields: { code: err.code }
      });
    }
    logError("POST /transactions/import/:id/revert error", buildRouteErrorContext(req, err));
    throw new ApiError(500, "Failed to revert import batch.");
  }
}));

/* =========================================================
   TAX SUMMARIES  —  GET /transactions/tax-summary/payers
                     GET /transactions/tax-summary/tax-lines
   ========================================================= */

function parseYearOrCurrent(value) {
  const n = parseInt(value, 10);
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return n;
  return new Date().getUTCFullYear();
}

router.get("/tax-summary/payers", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const { region, fiscalYearStart } = await getBusinessRegionAndCurrency(businessId);
  const year = parseYearOrCurrent(req.query.year);
  const summary = await getPayerSummaryForYear(pool, { businessId, year, region, fiscalYearStart });
  res.json(summary);
}));

router.get("/tax-summary/tax-lines", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const businessContext = await getBusinessRegionAndCurrency(businessId);
  const requestedRegion = String(req.query.region || "").toUpperCase();
  const region = requestedRegion === "CA" || requestedRegion === "US"
    ? requestedRegion
    : businessContext.region;
  const year = parseYearOrCurrent(req.query.year);
  const summary = await getTaxLineSummaryForYear(pool, {
    businessId,
    year,
    region,
    fiscalYearStart: businessContext.fiscalYearStart
  });
  res.json(summary);
}));

/* =========================================================
   QUARTERLY ESTIMATED TAX REMINDERS  —  GET /transactions/tax-summary/quarterly
   ========================================================= */

router.get("/tax-summary/quarterly", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const businessContext = await getBusinessRegionAndCurrency(businessId);
  const requestedRegion = String(req.query.region || "").toUpperCase();
  const region = requestedRegion === "CA" || requestedRegion === "US"
    ? requestedRegion
    : businessContext.region;
  const reminders = getQuarterlyReminders(region);
  res.json(reminders);
}));

/* =========================================================
   YEAR-END TAX DASHBOARD  —  GET /transactions/tax-summary/dashboard
   ========================================================= */

router.get("/tax-summary/dashboard", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const businessContext = await getBusinessRegionAndCurrency(businessId);
  const requestedRegion = String(req.query.region || "").toUpperCase();
  const region = requestedRegion === "CA" || requestedRegion === "US"
    ? requestedRegion
    : businessContext.region;
  const year = parseYearOrCurrent(req.query.year);
  const taxRateRaw = parseFloat(req.query.tax_rate);
  const taxRateOverride = Number.isFinite(taxRateRaw) ? taxRateRaw : null;
  const dashboard = await getTaxDashboard(pool, {
    businessId,
    year,
    region,
    province: businessContext.province,
    fiscalYearStart: businessContext.fiscalYearStart,
    taxRateOverride
  });
  res.json(dashboard);
}));

module.exports = router;
module.exports.__private = {
  getCategoryCacheEntryId,
  ensureCategoryTemplateFields,
  resolveCategoryId,
  normalizeCurrencyCode
};
