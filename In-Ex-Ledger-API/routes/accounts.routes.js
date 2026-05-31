const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");
const {
  loadAccountingLockState,
  assertNoLockedPeriodTransactionsForAccount,
  AccountingPeriodLockedError
} = require("../services/accountingLockService.js");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACCOUNT_TYPES = ["checking", "savings", "credit_card", "cash", "loan", "custom"];
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
router.get("/", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(Math.max(requestedLimit || ACCOUNTS_DEFAULT_LIMIT, 1), ACCOUNTS_MAX_LIMIT);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const result = await pool.query(
      `SELECT a.*,
              b.name AS business_name
       FROM accounts a
       JOIN businesses b ON b.id = a.business_id
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
  } catch (err) {
    logError("GET accounts error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while retrieving accounts. Please try again or contact support if the problem persists." });
  }
});

/**
 * CREATE new account
 */
router.post("/", async (req, res) => {
  const { name, type, opening_balance, opening_balance_as_of } = req.body;
  const normalizedName = normalizeAccountName(name);
  const parsedOpeningBalance = parseOpeningBalance(opening_balance);
  const parsedOpeningBalanceDate = parseOpeningBalanceDate(opening_balance_as_of);

  if (!normalizedName || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
  }

  if (normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    return res.status(400).json({ error: `Account name must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.` });
  }

  if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.` });
  }

  if (!parsedOpeningBalance.valid) {
    return res.status(400).json({ error: parsedOpeningBalance.error });
  }

  if (!parsedOpeningBalanceDate.valid) {
    return res.status(400).json({ error: parsedOpeningBalanceDate.error });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `INSERT INTO accounts (id, business_id, name, type, opening_balance, opening_balance_as_of)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        normalizedName,
        type,
        parsedOpeningBalance.value ?? 0,
        parsedOpeningBalanceDate.value ?? null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    logError("POST account error:", err.stack || err);
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this name already exists. Please choose a different name."
      });
    }
    res.status(500).json({ error: "A server error occurred while saving the account. Please try again or contact support if the problem persists." });
  }
});

/**
 * UPDATE account (name and/or type)
 */
router.put("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid account ID." });
  }
  const { name, type, opening_balance, opening_balance_as_of } = req.body;
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
  const hasOpeningBalance = Object.prototype.hasOwnProperty.call(req.body || {}, "opening_balance");
  const hasOpeningBalanceDate = Object.prototype.hasOwnProperty.call(req.body || {}, "opening_balance_as_of");
  const normalizedName = normalizeAccountName(name);
  const parsedOpeningBalance = parseOpeningBalance(opening_balance);
  const parsedOpeningBalanceDate = parseOpeningBalanceDate(opening_balance_as_of);

  if (!hasName && !type && !hasOpeningBalance && !hasOpeningBalanceDate) {
    return res.status(400).json({ error: "At least one updatable account field is required." });
  }

  if (hasName && !normalizedName) {
    return res.status(400).json({ error: "Account name cannot be blank." });
  }

  if (hasName && normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    return res.status(400).json({ error: `Account name must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.` });
  }

  if (type && !ALLOWED_ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.` });
  }

  if (!parsedOpeningBalance.valid) {
    return res.status(400).json({ error: parsedOpeningBalance.error });
  }

  if (!parsedOpeningBalanceDate.valid) {
    return res.status(400).json({ error: parsedOpeningBalanceDate.error });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const existing = await pool.query(
      "SELECT id, type FROM accounts WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Account not found or access denied." });
    }

    // Block account type reclassification if locked-period transactions reference this account.
    // Pure name changes are always permitted.
    if (type && type !== existing.rows[0].type) {
      const lockState = await loadAccountingLockState(pool, businessId);
      await assertNoLockedPeriodTransactionsForAccount(pool, businessId, req.params.id, lockState);
    }

    const result = await pool.query(
      `UPDATE accounts
          SET name = COALESCE($1, name),
              type = COALESCE($2, type),
              opening_balance = COALESCE($3, opening_balance),
              opening_balance_as_of = CASE WHEN $4 THEN $5 ELSE opening_balance_as_of END
        WHERE id = $6 AND business_id = $7
        RETURNING *`,
      [
        hasName ? normalizedName : null,
        type || null,
        hasOpeningBalance ? parsedOpeningBalance.value : null,
        hasOpeningBalanceDate,
        hasOpeningBalanceDate ? parsedOpeningBalanceDate.value : null,
        req.params.id,
        businessId
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("PUT account error:", err.stack || err);
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this name already exists. Please choose a different name."
      });
    }
    res.status(500).json({ error: "A server error occurred while updating the account. Please try again or contact support if the problem persists." });
  }
});

/**
 * DELETE account
 */
router.delete("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid account ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    // Block on active (non-deleted) transactions
    const usage = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NULL",
      [req.params.id, businessId]
    );
    if (parseInt(usage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({
        error: "This account cannot be deleted because it is in use."
      });
    }

    // Block on active (non-deleted) recurring transactions
    const recurringUsage = await pool.query(
      "SELECT COUNT(*) FROM recurring_transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NULL",
      [req.params.id, businessId]
    );
    if (parseInt(recurringUsage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({
        error: "This account cannot be deleted because it is used by a recurring transaction."
      });
    }

    const client = await pool.connect();
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

      const result = await client.query(
        "DELETE FROM accounts WHERE id = $1 AND business_id = $2",
        [req.params.id, businessId]
      );

      await client.query("COMMIT");

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Account not found or access denied." });
      }

      res.json({ message: "Account deleted successfully." });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logError("DELETE account error:", err.stack || err);
    res.status(500).json({ error: "Delete failed." });
  }
});

module.exports = router;
