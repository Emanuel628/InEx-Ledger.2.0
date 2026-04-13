const express = require("express");
const crypto = require("crypto");
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
const { archiveTransaction } = require("../services/transactionAuditService.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);
const VALID_TAX_TREATMENTS = new Set(["income", "operating", "capital", "split_use", "nondeductible"]);
const VALID_REVIEW_STATUSES = new Set(["needs_review", "ready", "matched", "locked"]);
const MAX_TRANSACTION_AMOUNT = 999999999.99;
const MAX_PERCENT = 100;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createTransactionLimiter());

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
 * Falls back to null (plain-text storage only) when FIELD_ENCRYPTION_KEY is
 * not configured so that transactions can still be saved without encryption.
 * A warning is logged so that server operators are alerted to the missing key.
 */
function tryEncryptDescription(description) {
  if (!description) return null;
  try {
    return encrypt(description);
  } catch (encryptErr) {
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

  return res.status(500).json({ error: fallbackMessage });
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
    const businessTaxContext = await getBusinessRegionAndCurrency(businessId);
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    const { account_id, category_id, amount, type, date, cleared } = validation.normalized;
    const { description, note } = req.body;
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
         indirect_tax_amount, indirect_tax_recoverable, personal_use_pct, review_status, review_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
        validation.normalized.review_notes
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
    const validation = validateTransactionPayload(req.body, businessTaxContext.currency);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
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

    // Audit Pivot: insert a new adjustment row referencing the original transaction
    const result = await pool.query(
      `INSERT INTO transactions
        (id, business_id, account_id, category_id, amount, type, cleared,
         description, description_encrypted, date, note,
         currency, source_amount, exchange_rate, exchange_date, converted_amount, tax_treatment,
         indirect_tax_amount, indirect_tax_recoverable, personal_use_pct, review_status, review_notes,
         is_adjustment, original_transaction_id, adjusted_by_id, adjusted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
               true, $23, $24, NOW())
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
        req.params.id,
        req.user.id
      ]
    );

    res.json(decryptTransactionRow(result.rows[0]));
  } catch (err) {
    logError("PUT /transactions/:id error:", err);
    return handleTransactionMutationError(res, err, "Failed to update transaction.");
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

module.exports = router;
