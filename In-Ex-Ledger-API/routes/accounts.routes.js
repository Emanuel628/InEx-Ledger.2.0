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

function normalizeAccountName(value) {
  return typeof value === "string" ? value.trim() : "";
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
    const result = await pool.query(
      `SELECT a.*,
              b.name AS business_name
       FROM accounts a
       JOIN businesses b ON b.id = a.business_id
       WHERE a.business_id = ANY($1::uuid[])
       ORDER BY b.name ASC, a.created_at DESC
       LIMIT 500`,
      [scope.businessIds]
    );
    res.json(result.rows);
  } catch (err) {
    logError("GET accounts error:", err.stack || err);
    res.status(500).json({ error: "A server error occurred while retrieving accounts. Please try again or contact support if the problem persists." });
  }
});

/**
 * CREATE new account
 */
router.post("/", async (req, res) => {
  const { name, type } = req.body;
  const normalizedName = normalizeAccountName(name);

  if (!normalizedName || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
  }

  if (normalizedName.length > MAX_ACCOUNT_NAME_LENGTH) {
    return res.status(400).json({ error: `Account name must be ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.` });
  }

  if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.` });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `INSERT INTO accounts (id, business_id, name, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [crypto.randomUUID(), businessId, normalizedName, type]
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
  const { name, type } = req.body;
  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
  const normalizedName = normalizeAccountName(name);

  if (!hasName && !type) {
    return res.status(400).json({ error: "At least one of name or type is required." });
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
              type = COALESCE($2, type)
        WHERE id = $3 AND business_id = $4
        RETURNING *`,
      [hasName ? normalizedName : null, type || null, req.params.id, businessId]
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

    const usage = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE account_id = $1 AND business_id = $2 AND deleted_at IS NULL",
      [req.params.id, businessId]
    );
    if (parseInt(usage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({
        error: "This account cannot be deleted because it is in use."
      });
    }

    const recurringUsage = await pool.query(
      "SELECT COUNT(*) FROM recurring_transactions WHERE account_id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (parseInt(recurringUsage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({
        error: "This account cannot be deleted because it is used by a recurring transaction."
      });
    }

    const result = await pool.query(
      "DELETE FROM accounts WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Account not found or access denied." });
    }

    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    logError("DELETE account error:", err.stack || err);
    res.status(500).json({ error: "Delete failed." });
  }
});

module.exports = router;
