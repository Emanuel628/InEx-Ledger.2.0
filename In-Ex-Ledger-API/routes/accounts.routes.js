const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);
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
       ORDER BY b.name ASC, a.created_at DESC`,
      [scope.businessIds]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("✗ GET accounts error:", err.message);
    res.status(500).json({ error: "Failed to retrieve accounts from DB." });
  }
});

/**
 * CREATE new account
 */
router.post("/", async (req, res) => {
  const { name, type } = req.body;

  const ALLOWED_ACCOUNT_TYPES = ["checking", "savings", "credit_card"];

  if (!name || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
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
      [crypto.randomUUID(), businessId, name, type]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("✗ POST account error:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({
        error: "An account with this name already exists."
      });
    }
    res.status(500).json({ error: "Failed to save account to DB." });
  }
});

/**
 * DELETE account
 */
router.delete("/:id", async (req, res) => {
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
    console.error("✗ DELETE account error:", err.message);
    res.status(500).json({ error: "Delete failed." });
  }
});

module.exports = router;
