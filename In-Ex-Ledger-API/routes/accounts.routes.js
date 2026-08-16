const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");
const {
  loadAccountingLockState,
  assertNoLockedPeriodTransactionsForAccount,
  AccountingPeriodLockedError
} = require("../services/accountingLockService.js");
const { ACCOUNT_CATEGORIES, normalizeAccountCategory } = require("../services/accountTypeService.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACCOUNT_TYPES = ACCOUNT_CATEGORIES;
const MAX_ACCOUNT_NAME_LENGTH = 120;
const ACCOUNTS_DEFAULT_LIMIT = 500;
const ACCOUNTS_MAX_LIMIT = 2000;
const OPENING_BALANCE_SCALE = 2;

function normalizeAccountName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOpeningBalance(value) {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (value === null || value === "") {
    return { valid: true, value: 0 };
  }

  const numericValue = typeof value === "number" ? value : Number.parseFloat(String(value).trim());
  if (!Number.isFinite(numericValue)) {
    return { valid: false, error: "opening_balance must be a valid number." };
  }

  const rounded = Number(numericValue.toFixed(OPENING_BALANCE_SCALE));
  return { valid: true, value: rounded };
}

function parseOpeningBalanceDate(value) {
  if (value === undefined) {
    return { valid: true, value: undefined };
  }

  if (value === null || value === "") {
    return { valid: true, value: null };
  }

  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { valid: false, error: "opening_balance_as_of must be a valid YYYY-MM-DD date." };
  }

  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    return { valid: false, error: "opening_balance_as_of must be a valid YYYY-MM-DD date." };
  }

  return { valid: true, value: normalized };
}

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

/**
 * GET all accounts for logged-in business
 */
router.get("/", asyncRoute(async (req, res) => {
  const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
  const requestedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(requestedLimit || ACCOUNTS_DEFAULT_LIMIT, 1), ACCOUNTS_MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const result = await pool.query(
    `SELECT a.*,
            b.name AS business_name,
            COALESCE(tx.transaction_count, 0)::int AS transaction_count
     FROM accounts a
     JOIN businesses b ON b.id = a.business_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS transaction_count
         FROM transactions t
        WHERE t.account_id = a.id
          AND t.business_id = a.business_id
          AND t.deleted_at IS NULL
     ) tx ON true
     WHERE a.business_id = ANY($1::uuid[])
     ORDER BY b.name ASC, a.created_at DESC
     LIMIT $2 OFFSET $3`,
    [scope.businessIds, limit, offset]
  );
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM accounts
      WHERE business_id = ANY($1::uuid[])`,
    [scope.businessIds]
  );
  const total = Number(countResult.rows[0]?.count || 0);
  res.json({
    data: result.rows,
    total,
    limit,
    offset,
    has_more: offset + result.rows.length < total
  });
}));

/**
 * CREATE new account
 */
router.post("/", asyncRoute(async (req, res) => {
  const { name, type, opening_balance, opening_balance_as_of } = req.body;
  const normalizedName = normalizeAccountName(name);
  const parsedOpeningBalance = parseOpeningBalance(opening_balance);
  const parsedOpeningBalanceDate = parseOpeningBalanceDate(opening_balance_as_of);

  if (!normalizedName || !type) {
    throw new ApiError(400, "Account name and type are required.");
  }

  if (normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw new ApiError(400, `Account name must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.`);
  }

  if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
    throw new ApiError(400, `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.`);
  }

  if (!parsedOpeningBalance.valid) {
    throw new ApiError(400, parsedOpeningBalance.error);
  }

  if (!parsedOpeningBalanceDate.valid) {
    throw new ApiError(400, parsedOpeningBalanceDate.error);
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  let result;
  try {
    result = await pool.query(
      `INSERT INTO accounts (id, business_id, name, type, account_category, opening_balance, opening_balance_as_of)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        normalizedName,
        type,
        normalizeAccountCategory(type),
        parsedOpeningBalance.value ?? 0,
        parsedOpeningBalanceDate.value ?? null
      ]
    );
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "An account with this name already exists. Please choose a different name.");
    }
    throw err;
  }

  res.status(201).json(result.rows[0]);
}));

/**
 * UPDATE account (name and/or type)
 */
router.put("/:id", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid account ID.");
  }
  const { name, type, opening_balance, opening_balance_as_of } = req.body;
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
  const hasOpeningBalance = Object.prototype.hasOwnProperty.call(req.body || {}, "opening_balance");
  const hasOpeningBalanceDate = Object.prototype.hasOwnProperty.call(req.body || {}, "opening_balance_as_of");
  const normalizedName = normalizeAccountName(name);
  const parsedOpeningBalance = parseOpeningBalance(opening_balance);
  const parsedOpeningBalanceDate = parseOpeningBalanceDate(opening_balance_as_of);

  if (!hasName && !type && !hasOpeningBalance && !hasOpeningBalanceDate) {
    throw new ApiError(400, "At least one updatable account field is required.");
  }

  if (hasName && !normalizedName) {
    throw new ApiError(400, "Account name cannot be blank.");
  }

  if (hasName && normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    throw new ApiError(400, `Account name must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.`);
  }

  if (type && !ALLOWED_ACCOUNT_TYPES.includes(type)) {
    throw new ApiError(400, `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.`);
  }

  if (!parsedOpeningBalance.valid) {
    throw new ApiError(400, parsedOpeningBalance.error);
  }

  if (!parsedOpeningBalanceDate.valid) {
    throw new ApiError(400, parsedOpeningBalanceDate.error);
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  const existing = await pool.query(
    "SELECT id, type FROM accounts WHERE id = $1 AND business_id = $2",
    [req.params.id, businessId]
  );

  if (existing.rowCount === 0) {
    throw new ApiError(404, "Account not found or access denied.");
  }

  // Block account type reclassification if locked-period transactions reference this account.
  // Pure name changes are always permitted.
  if (type && type !== existing.rows[0].type) {
    const lockState = await loadAccountingLockState(pool, businessId);
    try {
      await assertNoLockedPeriodTransactionsForAccount(pool, businessId, req.params.id, lockState);
    } catch (err) {
      if (err instanceof AccountingPeriodLockedError) {
        // Carries extra fields (code, locked_through_date) the shared
        // central error handler doesn't forward -- respond directly.
        return res.status(err.status).json({
          error: err.message,
          code: err.code,
          locked_through_date: err.lockedThroughDate
        });
      }
      throw err;
    }
  }

  let result;
  try {
    result = await pool.query(
      `UPDATE accounts
          SET name = COALESCE($1, name),
              type = COALESCE($2, type),
              account_category = COALESCE($3, account_category),
              opening_balance = COALESCE($4, opening_balance),
              opening_balance_as_of = CASE WHEN $5 THEN $6 ELSE opening_balance_as_of END
        WHERE id = $7 AND business_id = $8
        RETURNING *`,
      [
        hasName ? normalizedName : null,
        type || null,
        type ? normalizeAccountCategory(type) : null,
        hasOpeningBalance ? parsedOpeningBalance.value : null,
        hasOpeningBalanceDate,
        hasOpeningBalanceDate ? parsedOpeningBalanceDate.value : null,
        req.params.id,
        businessId
      ]
    );
  } catch (err) {
    if (err.code === "23505") {
      throw new ApiError(409, "An account with this name already exists. Please choose a different name.");
    }
    throw err;
  }

  res.json(result.rows[0]);
}));

/**
 * DELETE account
 */
router.delete("/:id", asyncRoute(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    throw new ApiError(400, "Invalid account ID.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);

  // Block on active (non-deleted) transactions
  const usage = await pool.query(
    "SELECT COUNT(*) FROM transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NULL",
    [req.params.id, businessId]
  );
  if (parseInt(usage.rows[0]?.count || "0", 10) > 0) {
    throw new ApiError(409, "This account cannot be deleted because it is in use.");
  }

  // Block on active (non-deleted) recurring transactions
  const recurringUsage = await pool.query(
    "SELECT COUNT(*) FROM recurring_transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NULL",
    [req.params.id, businessId]
  );
  if (parseInt(recurringUsage.rows[0]?.count || "0", 10) > 0) {
    throw new ApiError(409, "This account cannot be deleted because it is used by a recurring transaction.");
  }

  const client = await pool.connect();
  let result;
  try {
    await client.query("BEGIN");

    // Soft-deleted transactions still hold the FK (ON DELETE RESTRICT).
    // Null out their account reference so the account row can be removed.
    await client.query(
      "UPDATE transactions SET account_id = NULL WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NOT NULL",
      [req.params.id, businessId]
    );

    // Soft-deleted recurring_transactions have account_id NOT NULL, so we
    // can't null it. Hard-delete them — they're already logically gone.
    await client.query(
      "DELETE FROM recurring_transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NOT NULL",
      [req.params.id, businessId]
    );

    result = await client.query(
      "DELETE FROM accounts WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (result.rowCount === 0) {
    throw new ApiError(404, "Account not found or access denied.");
  }

  res.json({ message: "Account deleted successfully." });
}));

module.exports = router;
