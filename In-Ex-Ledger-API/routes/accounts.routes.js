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
  AccountingPeriodLockedError,
  buildAccountingLockErrorPayload,
  loadAccountingLockState
} = require("../services/accountingLockService.js");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

function handleAccountMutationError(res, err, fallbackMessage) {
  if (err instanceof AccountingPeriodLockedError) {
    return res.status(err.status).json(buildAccountingLockErrorPayload(err));
  }

  return res.status(500).json({ error: fallbackMessage });
}

function normalizeAccountName(name) {
  return typeof name === "string" ? name.trim() : "";
}

async function findConflictingAccountName(businessId, name, excludeId = null) {
  const normalizedName = normalizeAccountName(name);
  if (!normalizedName) {
    return false;
  }

  const sql = excludeId
    ? `SELECT 1
         FROM accounts
        WHERE business_id = $1
          AND LOWER(name) = LOWER($2)
          AND id <> $3
        LIMIT 1`
    : `SELECT 1
         FROM accounts
        WHERE business_id = $1
          AND LOWER(name) = LOWER($2)
        LIMIT 1`;
  const params = excludeId
    ? [businessId, normalizedName, excludeId]
    : [businessId, normalizedName];
  const result = await pool.query(sql, params);
  return result.rowCount > 0;
}

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
       ORDER BY b.name ASC, a.created_at DESC`,
      [scope.businessIds]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET accounts error:", err.message);
    res.status(500).json({ error: "Failed to retrieve accounts from DB." });
  }
});

/**
 * CREATE new account
 */
router.post("/", async (req, res) => {
  const { type } = req.body;
  const name = normalizeAccountName(req.body?.name);

  const ALLOWED_ACCOUNT_TYPES = ["checking", "savings", "credit_card"];

  if (!name || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
  }

  if (!ALLOWED_ACCOUNT_TYPES.includes(type)) {
    return res.status(400).json({ error: `Account type must be one of: ${ALLOWED_ACCOUNT_TYPES.join(", ")}.` });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (await findConflictingAccountName(businessId, name)) {
      return res.status(409).json({
        error: "An account with this name already exists."
      });
    }

    const result = await pool.query(
      `INSERT INTO accounts (id, business_id, name, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [crypto.randomUUID(), businessId, name, type]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST account error:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this name already exists."
      });
    }
    res.status(500).json({ error: "Failed to save account to DB." });
  }
});

/**
 * UPDATE account (name and/or type)
 */
router.put("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid account ID." });
  }
  const { type } = req.body;
  const name = req.body?.name;

  const ALLOWED_ACCOUNT_TYPES = ["checking", "savings", "credit_card"];

  if (!name && !type) {
    return res.status(400).json({ error: "At least one of name or type is required." });
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

    const current = existing.rows[0];
    const nextName = name !== undefined ? normalizeAccountName(name) : current.name;
    if (name !== undefined && !nextName) {
      return res.status(400).json({ error: "Account name and type are required." });
    }
    if (await findConflictingAccountName(businessId, nextName, req.params.id)) {
      return res.status(409).json({
        error: "An account with this name already exists."
      });
    }
    if (type && type !== current.type) {
      const lockState = await loadAccountingLockState(pool, businessId);
      if (lockState?.lockedThroughDate) {
        const usage = await pool.query(
          `SELECT date
             FROM transactions
            WHERE account_id = $1
              AND business_id = $2
              AND deleted_at IS NULL
              AND (is_adjustment = false OR is_adjustment IS NULL)
              AND (is_void = false OR is_void IS NULL)
              AND date <= $3
            ORDER BY date DESC
            LIMIT 1`,
          [req.params.id, businessId, lockState.lockedThroughDate]
        );

        if (usage.rowCount) {
          throw new AccountingPeriodLockedError({
            lockedThroughDate: lockState.lockedThroughDate,
            transactionDate: usage.rows[0].date
          });
        }
      }
    }

    const result = await pool.query(
      `UPDATE accounts
          SET name = COALESCE($1, name),
              type = COALESCE($2, type)
        WHERE id = $3 AND business_id = $4
        RETURNING *`,
      [name !== undefined ? nextName : null, type || null, req.params.id, businessId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT account error:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this name already exists."
      });
    }
    handleAccountMutationError(res, err, "Failed to update account.");
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
      "SELECT COUNT(*) FROM transactions WHERE account_id = $1 AND business_id = $2",
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
    console.error("DELETE account error:", err.message);
    res.status(500).json({ error: "Delete failed." });
  }
});

module.exports = router;
