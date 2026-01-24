import express from "express";
import pool from "../db.js";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET all accounts for logged-in business
 */
router.get("/", requireAuth, async (req, res) => {
  console.log("🔐 AUTH USER:", req.user);
  try {
    const result = await pool.query(
      "SELECT * FROM accounts WHERE business_id = $1 ORDER BY created_at DESC",
      [req.user.business_id]
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
router.post("/", requireAuth, async (req, res) => {
  console.log("🔐 AUTH USER:", req.user);
  console.log("POST /accounts BODY:", req.body);
  const { name, type, balance, currency } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
  }

  try {
    const dbCheck = await pool.query(
      "SELECT current_database(), current_schema()"
    );
    console.log("POST /accounts DB:", dbCheck.rows[0]);

    const result = await pool.query(
      `INSERT INTO accounts (id, business_id, name, type, balance, currency)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        crypto.randomUUID(),
        req.user.business_id,
        name,
        type,
        parseFloat(balance) || 0,
        currency || "USD"
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("✗ POST account error:", err.message);
    res.status(500).json({ error: "Failed to save account to DB." });
  }
});

/**
 * DELETE account
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM accounts WHERE id = $1 AND business_id = $2",
      [req.params.id, req.user.business_id]
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

export default router;
