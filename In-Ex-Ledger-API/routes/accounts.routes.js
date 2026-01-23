import express from "express";
import pool from "../db.js";
import crypto from "node:crypto";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /accounts
 * Fetch all accounts for the authenticated user
 */
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type, balance, currency, created_at
       FROM accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    console.log("GET accounts for user:", req.user.email, result.rowCount);
    res.json(result.rows);
  } catch (err) {
    console.error("GET accounts error:", err);
    res.status(500).json({ error: "Failed to retrieve accounts from DB." });
  }
});

/**
 * POST /accounts
 * Create a new account
 */
router.post("/", authenticateToken, async (req, res) => {
  const { name, type, balance, currency } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "Account name and type are required." });
  }

  try {
    const result = await pool.query(
      `INSERT INTO accounts (id, user_id, name, type, balance, currency)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        crypto.randomUUID(),
        req.user.id,
        name,
        type,
        parseFloat(balance) || 0,
        currency || "USD"
      ]
    );

    console.log("CREATED account:", result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST account error:", err);
    res.status(500).json({ error: "Failed to save account to DB." });
  }
});

/**
 * DELETE /accounts/:id
 * Delete an account owned by the user
 */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM accounts
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Account not found or access denied." });
    }

    console.log("DELETED account:", req.params.id);
    res.json({ message: "Account deleted successfully." });
  } catch (err) {
    console.error("DELETE account error:", err);
    res.status(500).json({ error: "Delete failed." });
  }
});

export default router;