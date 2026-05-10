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
const {
  BasicPlanLimitError,
  assertCanCreateTransactions
} = require("../services/basicPlanUsageService.js");

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);
const VALID_TAX_TREATMENTS = new Set(["income", "operating", "capital", "split_use", "nondeductible"]);
const VALID_REVIEW_STATUSES = new Set(["needs_review", "ready", "matched", "locked"]);
const VALID_TAX_FORMS = new Set(["1099-NEC", "1099-K", "T4A", "none"]);
const MAX_TRANSACTION_AMOUNT = 999999999.99;
const MAX_PERCENT = 100;
const TRANSACTION_UNDO_STACK_LIMIT = 20;
const REFERENCE_RATE_CURRENCIES = new Set(["USD", "CAD", "EUR", "GBP", "AUD", "JPY"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const existing = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `INSERT INTO categories (id, business_id, name, kind, created_at)
    VALUES ($1, $2, $3, $4, now())
    ON CONFLICT (business_id, lower(name)) DO NOTHING
    RETURNING id`,
    [crypto.randomUUID(), businessId, name, kind]
  );

  if (inserted.rowCount) {
    return inserted.rows[0].id;
  }

  const existingAfterInsert = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );
  return existingAfterInsert.rows[0]?.id || null;
}

function normalizeCurrencyCode(value, fallbackCurrency) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) {
    return fallbackCurrency;
  }
  if (/^[A-Z]{3}$/.test(raw)) {
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
  if (reviewStatus && !VALID_REVIEW_STATUSES.has(reviewStatus)) {
    return {
      valid: false,
      message: "review_status must be one of needs_review, ready, matched, or locked"
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
    String(payload?.review_notes || "").trim().length > 0;

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
      review_notes: String(payload?.review_notes || "").trim() || null
    }
  };
}

async function getBusinessRegionAndCurrency(businessId) {
  const result = await pool.query(
    "SELECT region FROM businesses WHERE id = $1 LIMIT 1",
    [businessId]
  );
  const region = String(result.rows[0]?.region || "US").toUpperCase() === "CA" ? "CA" : "US";
  return {
    region,
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

  return {
    valid: true,
    normalized: {
      account_id,
      category_id,
      amount: normalizedAmount,
      date,
      type,
      cleared: cleared === true,
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

/**
 * Attempts to encrypt a transaction description using AES-256-GCM.
 * In production this fails closed when FIELD_ENCRYPTION_KEY is missing.
 * Outside production it falls back to plain-text storage with a warning so
 * local development and older test fixtures can still run.
 */
function tryEncryptDescription(description) {
  if (!description) return null;
  try {
    return encrypt(description);
  } catch (encryptErr) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FIELD_ENCRYPTION_KEY is required in production to store transaction descriptions.");
    }
    logError(
      "[transactions] Field encryption unavailable — description stored as plain text. " +
      "Set FIELD_ENCRYPTION_KEY to enable at-rest encryption:",
      encryptErr.message
    );
    return null;
  }
}

async function assertUnlockedBusinessDates(businessId, ...dates) {
  const lockState = await loadAccountingLockState(pool, businessId);
  dates.filter(Boolean).forEach((date) => assertDateUnlocked(lockState, date));
  return lockState;
}

function handleTransactionMutationError(res, err, fallbackMessage) {
  if (err instanceof AccountingPeriodLockedError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      locked_through_date: err.lockedThroughDate,
      transaction_date: err.transactionDate
    });
  }

  if (err instanceof BasicPlanLimitError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...err.details
    });
  }

  return res.status(500).json({ error: fallbackMessage });
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

router.get("/", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT t.id,
              t.business_id,
              b.name AS business_name,
              t.account_id,
              a.name AS account_name,
              t.category_id,
              c.name AS category_name,
              t.amount,
              t.type,
              t.cleared,
              t.description,
              t.description_encrypted,
              t.date,
              t.note,
              t.currency,
              t.source_amount,
              t.exchange_rate,
              t.exchange_date,
              t.converted_amount,
              t.tax_treatment,
              t.indirect_tax_amount,
              t.indirect_tax_recoverable,
              t.personal_use_pct,
              t.review_status,
              t.review_notes,
              t.payer_name,
              t.tax_form_type,
              t.recurring_transaction_id,
              t.recurring_occurrence_date,
              t.is_adjustment,
              t.original_transaction_id,
              t.created_at
       FROM transactions t
       JOIN businesses b ON b.id = t.business_id
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.business_id = ANY($1::uuid[])
         AND t.deleted_at IS NULL
         AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
         AND (t.is_void = false OR t.is_void IS NULL)
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [scope.businessIds, limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE business_id = ANY($1::uuid[]) AND deleted_at IS NULL AND (is_adjustment = false OR is_adjustment IS NULL) AND (is_void = false OR is_void IS NULL)",
      [scope.businessIds]
    );

    res.status(200).json({
      data: result.rows.map(decryptTransactionRow),
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    logError("GET /transactions error:", err);
    res.status(500).json({ error: "Failed to load transactions." });
  }
});

router.post("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    await assertCanCreateTransactions(pool, businessId, 1);
    const businessTaxContext = await getBusinessRegionAndCurrency(businessId);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }
    if (
      hasAdvancedTransactionPayload(validation.normalized, businessTaxContext.currency) &&
      !hasFeatureAccess(subscription, "edge_case_tools")
    ) {
      return res.status(402).json({ error: "Advanced transaction fields require an active InEx Ledger Pro plan." });
    }

    const { account_id, category_id, amount, type, date, cleared } = validation.normalized;
    const { description, note } = req.body;
    const payerName = type === "income" ? (String(req.body.payer_name || "").trim().slice(0, 200) || null) : null;
    const taxFormType = type === "income" && VALID_TAX_FORMS.has(req.body.tax_form_type) ? req.body.tax_form_type : null;
    await assertUnlockedBusinessDates(businessId, date);
    const encryptedDescription = tryEncryptDescription(description);

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      return res.status(400).json({ error: "account_id does not belong to your business" });
    }

    const mappedCategoryId = await resolveCategoryId(
      businessId,
      category_id,
      type
    );

    if (!mappedCategoryId) {
      return res.status(400).json({ error: "category_id is invalid" });
    }

    const result = await pool.query(
      `INSERT INTO transactions
        (id, business_id, account_id, category_id, amount, type, cleared, description, description_encrypted, date, note,
         currency, source_amount, exchange_rate, exchange_date, converted_amount, tax_treatment,
         indirect_tax_amount, indirect_tax_recoverable, personal_use_pct, review_status, review_notes,
         payer_name, tax_form_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
               $23, $24)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        account_id,
        mappedCategoryId,
        amount,
        type,
        cleared,
        description || null,
        encryptedDescription,
        date,
        note || null,
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
        taxFormType
      ]
    );

    res.status(201).json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("POST /transactions error:", err);
    return handleTransactionMutationError(res, err, "Failed to save transaction.");
  }
});

router.put("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid transaction ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const businessTaxContext = await getBusinessRegionAndCurrency(businessId);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }
    if (
      hasAdvancedTransactionPayload(validation.normalized, businessTaxContext.currency) &&
      !hasFeatureAccess(subscription, "edge_case_tools")
    ) {
      return res.status(402).json({ error: "Advanced transaction fields require an active InEx Ledger Pro plan." });
    }
    const { account_id, category_id, amount, type, date, cleared } = validation.normalized;
    const { description, note } = req.body;

    // Verify the original transaction exists and belongs to this business
    const originalResult = await pool.query(
      "SELECT id, date FROM transactions WHERE id = $1 AND business_id = $2 AND is_adjustment = false AND deleted_at IS NULL",
      [req.params.id, businessId]
    );
    if (originalResult.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }
    await assertUnlockedBusinessDates(businessId, originalResult.rows[0].date, date);

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      return res.status(400).json({ error: "account_id does not belong to your business" });
    }

    const mappedCategoryId = await resolveCategoryId(businessId, category_id, type);
    if (!mappedCategoryId) {
      return res.status(400).json({ error: "category_id is invalid" });
    }

    const encryptedDescription = tryEncryptDescription(description);
    const payerName = type === "income" ? (String(req.body.payer_name || "").trim().slice(0, 200) || null) : null;
    const taxFormType = type === "income" && VALID_TAX_FORMS.has(req.body.tax_form_type) ? req.body.tax_form_type : null;

    const result = await pool.query(
      `UPDATE transactions
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
              adjusted_by_id          = $23,
              adjusted_at             = NOW()
        WHERE id = $24
          AND business_id = $25
          AND deleted_at IS NULL
          AND (is_adjustment = false OR is_adjustment IS NULL)
       RETURNING *`,
      [
        account_id,
        mappedCategoryId,
        amount,
        type,
        cleared,
        description || null,
        encryptedDescription,
        date,
        note || null,
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
        req.user.id,
        req.params.id,
        businessId
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PUT /transactions/:id error:", err);
    return handleTransactionMutationError(res, err, "Failed to update transaction.");
  }
});

router.delete("/bulk-delete-all", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const confirm = String(req.body?.confirm || "").trim();
    if (confirm !== "DELETE") {
      return res.status(400).json({ error: "Confirmation required. Send { confirm: 'DELETE' }." });
    }
    const lockState = await loadAccountingLockState(pool, businessId);
    if (lockState?.lockedThroughDate) {
      const lockedTransaction = await pool.query(
        `SELECT id
           FROM transactions
          WHERE business_id = $1
            AND deleted_at IS NULL
            AND date <= $2
          LIMIT 1`,
        [businessId, lockState.lockedThroughDate]
      );
      if (lockedTransaction.rowCount > 0) {
        return res.status(409).json({
          error: "Some transactions are in a locked accounting period and cannot be deleted.",
          code: "ACCOUNTING_PERIOD_LOCKED",
          locked_through_date: lockState.lockedThroughDate
        });
      }
    }
    const result = await pool.query(
      `UPDATE transactions
          SET deleted_at = now(), is_void = true, voided_at = now()
        WHERE business_id = $1
          AND deleted_at IS NULL`,
      [businessId]
    );
    res.json({ message: `Deleted ${result.rowCount} transaction(s).`, count: result.rowCount });
  } catch (err) {
    logError("DELETE /transactions/bulk-delete-all error:", err);
    res.status(500).json({ error: "Failed to delete transactions." });
  }
});

router.delete("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid transaction ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      "SELECT id, date FROM transactions WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL AND (is_adjustment = false OR is_adjustment IS NULL) AND (is_void = false OR is_void IS NULL) LIMIT 1",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
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
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json({ message: "Transaction deleted." });
  } catch (err) {
    logError("DELETE /transactions/:id error:", err);
    return handleTransactionMutationError(res, err, "Failed to delete transaction.");
  }
});

router.post("/undo-delete", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const candidate = await pool.query(
      `SELECT id, date
         FROM transactions
        WHERE business_id = $1
          AND deleted_at IS NOT NULL
          AND (is_void = true OR is_void IS NULL)
          AND (is_adjustment = false OR is_adjustment IS NULL)
        ORDER BY deleted_at DESC, voided_at DESC, created_at DESC
        LIMIT $2`,
      [businessId, TRANSACTION_UNDO_STACK_LIMIT]
    );

    if (candidate.rowCount === 0) {
      return res.status(404).json({ error: "No archived transaction is available to restore." });
    }

    await assertUnlockedBusinessDates(businessId, candidate.rows[0].date);

    const restored = await restoreMostRecentArchivedTransaction({
      pool,
      businessId,
      transactionId: candidate.rows[0].id,
      userId: req.user.id
    });

    if (!restored) {
      return res.status(404).json({ error: "No archived transaction is available to restore." });
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
  } catch (err) {
    logError("POST /transactions/undo-delete error:", err);
    return handleTransactionMutationError(res, err, "Failed to restore transaction.");
  }
});

router.get("/undo-delete-status", async (req, res) => {
  try {
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
  } catch (err) {
    logError("GET /transactions/undo-delete-status error:", err);
    res.status(500).json({ error: "Failed to load undo status." });
  }
});

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

    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json"
      }
    });

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
    logError("GET /transactions/exchange-rate-reference error:", err);
    res.status(500).json({ error: "Failed to load the reference exchange rate." });
  }
});

router.patch("/:id/review-status", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid transaction ID." });
  }
  const status = String(req.body?.review_status || "").trim().toLowerCase();
  if (!VALID_REVIEW_STATUSES.has(status)) {
    return res.status(400).json({ error: "review_status must be one of needs_review, ready, matched, or locked" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `UPDATE transactions
         SET review_status = $1
       WHERE id = $2
         AND business_id = $3
         AND deleted_at IS NULL
         AND (is_adjustment = false OR is_adjustment IS NULL)
         AND (is_void = false OR is_void IS NULL)
       RETURNING *`,
      [status, req.params.id, businessId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }
    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /transactions/:id/review-status error:", err);
    return handleTransactionMutationError(res, err, "Failed to update review status.");
  }
});

router.patch("/:id/cleared", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid transaction ID." });
  }
  if (typeof req.body?.cleared !== "boolean") {
    return res.status(400).json({ error: "cleared must be true or false" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const existing = await pool.query(
      "SELECT id, date FROM transactions WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL LIMIT 1",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    await assertUnlockedBusinessDates(businessId, existing.rows[0].date);
    const result = await pool.query(
      `UPDATE transactions
       SET cleared = $1
       WHERE id = $2
         AND business_id = $3
         AND deleted_at IS NULL
         AND (is_adjustment = false OR is_adjustment IS NULL)
         AND (is_void = false OR is_void IS NULL)
       RETURNING *`,
      [req.body.cleared, req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /transactions/:id/cleared error:", err);
    return handleTransactionMutationError(res, err, "Failed to update cleared status.");
  }
});

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

/**
 * Parses raw CSV text into an array of row objects keyed by normalized header names.
 * Supports quoted commas, escaped quotes, and embedded newlines inside quoted fields.
 */
function parseCsv(text) {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.trim()) {
    return [];
  }

  const rows = [];
  let row = [];
  let cell = "";
  let inQuote = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (ch === '"') {
      if (inQuote && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }

    if (ch === "," && !inQuote) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (ch === "\n" && !inQuote) {
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => String(value || "").trim())) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some((value) => String(value || "").trim())) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").toLowerCase().replace(/[^a-z0-9_$]/g, "_"));
  return rows.slice(1).map((cells) => {
    const mapped = {};
    headers.forEach((header, index) => {
      mapped[header] = cells[index] ?? "";
    });
    return mapped;
  });
}

const DATE_PATTERNS = [
  /^(\d{4})-(\d{2})-(\d{2})$/,          // YYYY-MM-DD
  /^(\d{2})\/(\d{2})\/(\d{4})$/,         // MM/DD/YYYY
  /^(\d{2})-(\d{2})-(\d{4})$/,           // MM-DD-YYYY
  /^(\d{2})\/(\d{2})\/(\d{2})$/,         // MM/DD/YY
];

function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const [m1] = DATE_PATTERNS;
  if (m1.test(s)) return s; // already YYYY-MM-DD

  // MM/DD/YYYY
  const mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mm) return `${mm[3]}-${mm[1].padStart(2, "0")}-${mm[2].padStart(2, "0")}`;

  // MM-DD-YYYY
  const md = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (md) return `${md[3]}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}`;

  // MM/DD/YY
  const ms = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ms) {
    const yr = Number(ms[3]) >= 50 ? `19${ms[3]}` : `20${ms[3]}`;
    return `${yr}-${ms[1].padStart(2, "0")}-${ms[2].padStart(2, "0")}`;
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return null;
}

/**
 * Tries to detect date/amount/description columns from CSV headers.
 * Supports common Canadian bank export formats (BMO, TD, RBC, Scotiabank, CIBC, etc.)
 */
function detectColumns(headers) {
  const h = headers.map((x) => x.toLowerCase());
  const find = (...candidates) => candidates.find((c) => h.includes(c)) || null;

  const dateCol = find(
    "date", "transaction_date", "trans__date", "posted_date", "posting_date",
    "post_date", "date_", "date_posted", "trans_date", "value_date",
    "effective_date", "settlement_date", "completed_date", "started_date"
  );
  const descCol = find(
    "description", "transaction_description", "transaction_description_1",
    "description_1", "description_2",
    "payee", "merchant", "memo", "details", "narrative",
    "trans__description", "particulars", "beneficiary", "name"
  );
  const amountCol = find(
    "amount", "transaction_amount", "net_amount", "debit_credit", "cad_", "usd_"
  );
  const withdrawalCol = find(
    "withdrawal", "debit", "withdrawals", "cheques_and_other_deductions",
    "withdrawals_debits", "withdrawals__dr_", "amount_debit", "debit_amount", "money_out"
  );
  const depositCol = find(
    "deposit", "credit", "deposits", "deposits_and_other_credits",
    "deposits_credits", "deposits__cr_", "amount_credit", "credit_amount", "money_in"
  );

  return { dateCol, descCol, amountCol, withdrawalCol, depositCol };
}

function extractRowData(row, cols) {
  let amount = null;
  let type = null;

  if (cols.amountCol && row[cols.amountCol] !== undefined && row[cols.amountCol] !== "") {
    const raw = String(row[cols.amountCol]).replace(/[$, ]/g, "");
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) {
      amount = Math.abs(n);
      type = n < 0 ? "expense" : "income";
    }
  } else {
    const withdrawal = String(row[cols.withdrawalCol] || "").replace(/[$, ]/g, "");
    const deposit = String(row[cols.depositCol] || "").replace(/[$, ]/g, "");
    const wAmt = Number.parseFloat(withdrawal);
    const dAmt = Number.parseFloat(deposit);
    if (Number.isFinite(dAmt) && dAmt > 0) {
      amount = dAmt;
      type = "income";
    } else if (Number.isFinite(wAmt) && wAmt > 0) {
      amount = wAmt;
      type = "expense";
    }
  }

  const description = String(
    row[cols.descCol] ||
    row["transaction_description_1"] ||
    row["description_1"] ||
    row["details"] ||
    ""
  ).trim().slice(0, 500);

  const date = normalizeDate(row[cols.dateCol]);

  return { amount, type, description, date };
}

// ─── Smart CSV Category Detection ────────────────────────────────────────────
const CSV_CATEGORY_RULES = [
  // Expense rules — ordered most-specific first
  {
    kind: "expense", name: "Bank Fees",
    keywords: ["overdraft", "service charge", "maintenance fee", "wire transfer fee", "atm fee",
      "foreign transaction", "bank fee", "interest charge", "nsf fee", "returned item",
      "monthly fee", "account fee", "stop payment", "insufficient funds"]
  },
  {
    kind: "expense", name: "Food & Dining",
    keywords: ["mcdonald", "burger king", "wendy", "subway", "starbucks", "dunkin", "taco bell",
      "chick-fil-a", "chickfila", "pizza hut", "domino", "kfc ", "chipotle", "panera",
      "olive garden", "applebee", "denny", "ihop", "red lobster", "outback steakhouse",
      "buffalo wild", "five guys", "shake shack", "popeye", "panda express", "sonic drive",
      "arby", "dairy queen", "baskin robbins", "jamba juice", "smoothie king",
      "doordash", "uber eats", "ubereats", "grubhub", "skip the dishes", "skipthedishes",
      "postmates", "just eat", "foodora", "tim horton", "a&w restaurant", "harvey's",
      "new york fries", "boston pizza", "pizza pizza", "pita pit", "mary brown", "st-hubert",
      "baton rouge", "milestones", "earls restaurant", "moxies", "joey restaurant",
      "cactus club", "white spot", "montana's", "kelseys", "jack astor", "swiss chalet",
      "in-n-out", "whataburger", "wingstop", "raising cane", "zaxby", "culver",
      "waffle house", "cracker barrel", "texas roadhouse", "longhorn steakhouse",
      "the keg", "moxie"]
  },
  {
    kind: "expense", name: "Groceries",
    keywords: ["walmart supercenter", "walmart grocery", "walmart neighborhood", "costco",
      "whole foods", "trader joe", "kroger", "safeway", "publix", "albertsons",
      "h-e-b", "heb ", "aldi ", "lidl ", "wegman", "meijer", "stop & shop", "stopnshop",
      "shoprite", "food lion", "giant eagle", "harris teeter", "winn dixie", "save-a-lot",
      "no frills", "metro grocery", "loblaws", "sobeys", "iga grocery", "freshco",
      "food basics", "giant tiger", "co-op food", "save-on-foods", "thrifty foods",
      "overwaitea", "independent grocer", "real canadian superstore", "provigo", "maxi grocery",
      "superstore", "walmart"]
  },
  {
    kind: "expense", name: "Fuel & Gas",
    keywords: ["shell gas", "shell station", "shell #", "chevron", "bp gas", "bp station",
      "exxon", "mobil gas", "mobil #", "sunoco", "marathon gas", "speedway gas",
      "circle k gas", "wawa gas", "sheetz", "pilot flying", "loves travel stop",
      "petro canada", "petrocan", "esso", "husky gas", "ultramar", "pioneer gas",
      "canadian tire gas", "petro-t", "irving oil", "kwik trip gas", "casey's gas"]
  },
  {
    kind: "expense", name: "Ride Sharing & Taxi",
    keywords: ["lyft", "didi", "waymo", "yellow cab", "blue cab", "green cab",
      "taxicab", "rideshare", "uber"]
  },
  {
    kind: "expense", name: "Travel",
    keywords: ["delta air", "american airlines", "united airlines", "southwest air", "spirit air",
      "air canada", "westjet", "jetblue", "frontier airlines", "alaska airlines",
      "lufthansa", "british airways", "air france", "air transat", "porter airlines",
      "flair airlines", "sunwing", "marriott", "hilton", "hyatt", "sheraton", "westin",
      "holiday inn", "hampton inn", "doubletree", "residence inn", "four seasons",
      "ritz carlton", "best western", "motel 6", "super 8", "comfort inn", "airbnb",
      "vrbo", "booking.com", "expedia", "travelocity", "priceline", "hotels.com",
      "trivago", "kayak", "orbitz", "amtrak", "via rail", "greyhound bus", "airport hotel",
      "airport parking", "airlines"]
  },
  {
    kind: "expense", name: "Software & Subscriptions",
    keywords: ["netflix", "spotify", "hulu", "disney plus", "disney+", "amazon prime",
      "apple tv+", "hbo max", "youtube premium", "adobe ", "microsoft 365", "microsoft office",
      "github", "slack", "zoom", "dropbox", "google one", "google workspace",
      "amazon web services", "aws ", "azure ", "digitalocean", "heroku", "notion ",
      "figma ", "canva ", "mailchimp", "hubspot", "salesforce", "quickbooks", "xero",
      "freshbooks", "wave apps", "shopify", "wix ", "squarespace", "godaddy",
      "namecheap", "cloudflare", "twilio", "sendgrid", "anthropic", "openai",
      "subscription fee", "membership renewal"]
  },
  {
    kind: "expense", name: "Advertising & Marketing",
    keywords: ["google ads", "google adwords", "facebook ads", "meta ads", "instagram ads",
      "tiktok ads", "twitter ads", "pinterest ads", "linkedin ads", "bing ads",
      "snapchat ads", "youtube ads", "constant contact", "hootsuite", "buffer ",
      "sprout social", "semrush", "ahrefs", "klaviyo", "activecampaign"]
  },
  {
    kind: "expense", name: "Phone & Internet",
    keywords: ["rogers", "bell canada", "telus", "fido wireless", "koodo", "virgin mobile",
      "freedom mobile", "shaw cable", "videotron", "eastlink", "at&t", "att wireless",
      "att mobility", "verizon", "t-mobile", "tmobile", "sprint wireless", "comcast",
      "xfinity", "spectrum ", "cox communication", "centurylink", "frontier comm",
      "windstream", "google fi", "mint mobile", "visible wireless",
      "internet service", "wireless service", "cellular service"]
  },
  {
    kind: "expense", name: "Insurance",
    keywords: ["allstate", "state farm", "geico", "progressive ins", "farmers insurance",
      "nationwide ins", "liberty mutual", "usaa", "aetna", "blue cross", "cigna",
      "united health", "sun life", "great-west life", "manulife", "canada life",
      "desjardins ins", "intact insurance", "co-operators", "aviva canada",
      "td insurance", "rbc insurance", "bmo insurance", "insurance premium", "insurance payment"]
  },
  {
    kind: "expense", name: "Health & Wellness",
    keywords: ["cvs pharmacy", "walgreens", "rite aid", "shoppers drug mart", "london drugs",
      "pharmasave", "rexall", "loblaws pharmacy", "costco pharmacy", "planet fitness",
      "goodlife fitness", "anytime fitness", "la fitness", "24 hour fitness", "equinox",
      "crunch fitness", "ymca", "medical clinic", "dental office", "dentist", "optometrist",
      "physio", "physiotherapy", "chiropractor", "massage therapy", "pharmacy", "drugstore",
      "health clinic", "urgent care", "hospital"]
  },
  {
    kind: "expense", name: "Office Supplies",
    keywords: ["staples ", "office depot", "officemax", "office max", "uline ", "viking direct",
      "grand & toy", "bureau en gros", "reliable office supplies"]
  },
  {
    kind: "expense", name: "Shipping & Postage",
    keywords: ["fedex", "ups store", "ups shipping", "usps", "dhl", "canada post",
      "purolator", "canpar", "loomis express", "fleet courier", "postage", "courier service"]
  },
  {
    kind: "expense", name: "Vehicle & Transportation",
    keywords: ["autozone", "advance auto", "o'reilly auto", "oreilly auto", "napa auto",
      "jiffy lube", "valvoline", "midas ", "meineke", "firestone", "goodyear", "pep boys",
      "maaco", "enterprise rent", "budget rent-a", "avis ", "hertz ", "national car rental",
      "dollar car", "thrifty car", "u-haul", "penske truck", "zipcar",
      "parking lot", "parking meter", "car wash", "auto repair", "oil change", "dealership"]
  },
  {
    kind: "expense", name: "Rent & Utilities",
    keywords: ["rent payment", "hydro ", "bc hydro", "enbridge", "atco gas", "fortis bc",
      "epcor", "alectra", "union gas", "pacific gas", "pge ", "con edison",
      "national grid", "water utility", "sewage", "garbage collect", "monthly rent",
      "apartment rent", "electric utility", "natural gas utility"]
  },
  {
    kind: "expense", name: "Professional Services",
    keywords: ["law firm", "attorney", "accountant", "cpa firm", "consulting", "fiverr",
      "upwork", "toptal", "99designs", "freelance payment", "contractor payment",
      "legal fee", "professional fee", "notary"]
  },
  {
    kind: "expense", name: "Government & Taxes",
    keywords: ["irs ", "cra ", "revenue canada", "revenu canada", "department of finance",
      "government fee", "permit fee", "business license", "vehicle registration",
      "tax payment", "government of canada", "service canada", "service ontario",
      "dmv ", "property tax", "hst payment", "gst payment", "sales tax remittance"]
  },

  // Income rules
  {
    kind: "income", name: "Payroll Income",
    keywords: ["payroll", "salary deposit", "direct deposit payroll", "adp ", "paychex",
      "ceridian", "paylocity", "gusto payroll", "bamboohr", "kronos payroll",
      "wages", "employment income", "employment deposit", "biweekly pay", "weekly pay"]
  },
  {
    kind: "income", name: "Sales Revenue",
    keywords: ["square ", "stripe", "paypal", "shopify", "amazon seller", "etsy ", "ebay sale",
      "venmo", "zelle", "e-transfer", "interac e-transfer", "interac etransfer",
      "payment received", "invoice payment", "client payment", "settlement deposit",
      "transfer in", "deposit", "direct deposit"]
  },
];

function detectCsvCategory(description, kind) {
  const desc = description.toLowerCase();
  for (const rule of CSV_CATEGORY_RULES) {
    if (rule.kind !== kind) continue;
    if (rule.keywords.some(kw => desc.includes(kw))) return rule.name;
  }
  return kind === "income" ? "Imported Income" : "Imported Expense";
}
// ─────────────────────────────────────────────────────────────────────────────

router.post("/import/csv", csvUpload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "CSV file is required." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "receipts")) {
      return res.status(402).json({ error: "CSV import requires an active InEx Ledger Pro plan." });
    }

    const accountId = String(req.body?.account_id || "").trim();
    if (!accountId || !UUID_REGEX.test(accountId)) {
      return res.status(400).json({ error: "account_id is required and must be a valid UUID." });
    }

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [accountId, businessId]
    );
    if (accountCheck.rowCount === 0) {
      return res.status(400).json({ error: "account_id does not belong to your business." });
    }

    const { region, currency: fallbackCurrency } = await getBusinessRegionAndCurrency(businessId);
    const lockState = await loadAccountingLockState(pool, businessId);

    const csvText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV file is empty or could not be parsed." });
    }

    const headers = Object.keys(rows[0]);
    const cols = detectColumns(headers);

    if (!cols.dateCol) {
      return res.status(400).json({ error: "Could not detect a date column. Expected a column named 'date', 'transaction_date', or similar." });
    }
    if (!cols.descCol) {
      return res.status(400).json({ error: "Could not detect a description column. Expected 'description', 'payee', 'memo', or similar." });
    }
    if (!cols.amountCol && !cols.withdrawalCol && !cols.depositCol) {
      return res.status(400).json({ error: "Could not detect an amount column. Expected 'amount', 'withdrawal', 'deposit', or similar." });
    }

    // Pre-load all existing categories once; create missing ones on demand
    const existingCats = await pool.query(
      "SELECT id, name, kind FROM categories WHERE business_id = $1",
      [businessId]
    );
    const categoryCache = new Map();
    for (const cat of existingCats.rows) {
      categoryCache.set(`${cat.kind}::${cat.name.toLowerCase()}`, cat.id);
    }

    async function getOrCreateCsvCategory(name, kind) {
      const key = `${kind}::${name.toLowerCase()}`;
      if (categoryCache.has(key)) return categoryCache.get(key);
      let result = await pool.query(
        `INSERT INTO categories (id, business_id, name, kind, created_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (business_id, lower(name)) DO NOTHING
         RETURNING id`,
        [crypto.randomUUID(), businessId, name, kind]
      );
      if (!result.rowCount) {
        result = await pool.query(
          "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
          [businessId, name]
        );
      }
      const id = result.rows[0]?.id;
      if (id) categoryCache.set(key, id);
      return id;
    }

    const results = { imported: 0, skipped: 0, errors: [] };
    const MAX_ROWS = 1000;
    const rowsToProcess = rows.slice(0, MAX_ROWS);
    const allowance = await assertCanCreateTransactions(pool, businessId, 0);
    let remainingBasicSlots = Number.isFinite(allowance.remaining) ? allowance.remaining : Number.POSITIVE_INFINITY;

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const { amount, type, description, date } = extractRowData(row, cols);

      if (!date || !amount || !type || amount <= 0 || !description) {
        results.skipped++;
        continue;
      }

      try {
        assertDateUnlocked(lockState, date);
      } catch {
        results.errors.push({ row: i + 2, reason: `Row ${i + 2}: date ${date} falls within a locked accounting period` });
        results.skipped++;
        continue;
      }

      const detectedCategory = detectCsvCategory(description, type);
      const categoryId = await getOrCreateCsvCategory(detectedCategory, type);
      if (!categoryId) {
        results.errors.push({ row: i + 2, reason: `Row ${i + 2}: could not resolve category` });
        results.skipped++;
        continue;
      }

      if (remainingBasicSlots <= 0) {
        results.errors.push({
          row: i + 2,
          reason: `Row ${i + 2}: Basic includes up to 50 transactions per month. Upgrade to Pro to import more this month.`
        });
        results.skipped++;
        continue;
      }

      const encryptedDescription = tryEncryptDescription(description);
      const taxTreatment = type === "income" ? "income" : "operating";

      try {
        await pool.query(
          `INSERT INTO transactions
            (id, business_id, account_id, category_id, amount, type, cleared, description, description_encrypted,
             date, currency, tax_treatment, review_status, converted_amount)
           VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, 'needs_review', $5)`,
          [
            crypto.randomUUID(),
            businessId,
            accountId,
            categoryId,
            amount,
            type,
            description,
            encryptedDescription,
            date,
            fallbackCurrency,
            taxTreatment
          ]
        );
        results.imported++;
        if (Number.isFinite(remainingBasicSlots)) {
          remainingBasicSlots -= 1;
        }
      } catch (insertErr) {
        if (insertErr instanceof BasicPlanLimitError) {
          results.errors.push({
            row: i + 2,
            reason: `Row ${i + 2}: ${insertErr.message}`
          });
          results.skipped++;
          continue;
        }
        results.errors.push({ row: i + 2, reason: `Row ${i + 2}: ${insertErr.message}` });
        results.skipped++;
      }
    }

    if (rows.length > MAX_ROWS) {
      results.truncated = true;
      results.truncated_at = MAX_ROWS;
    }

    res.status(200).json({
      message: `Import complete. ${results.imported} transaction(s) imported, ${results.skipped} skipped.`,
      ...results
    });
  } catch (err) {
    logError("POST /transactions/import/csv error:", err);
    res.status(500).json({ error: "CSV import failed." });
  }
});

module.exports = router;
module.exports.__private = {
  parseCsv,
  normalizeDate,
  detectColumns,
  extractRowData
};
