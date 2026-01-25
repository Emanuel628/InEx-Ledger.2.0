import express from "express";
import crypto from "node:crypto";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);

async function resolveBusinessId(userId) {
  const result = await pool.query(
    "SELECT id FROM businesses WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

function validateTransactionPayload(payload) {
  const { account_id, category_id, amount, date, type } = payload ?? {};

  if (!account_id) {
    return { valid: false, message: "account_id is required" };
  }

  if (!category_id) {
    return { valid: false, message: "category_id is required" };
  }

  if (amount === undefined || amount === null) {
    return { valid: false, message: "amount is required" };
  }

  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return { valid: false, message: "amount must be a number" };
  }

  if (!type || !VALID_TRANSACTION_TYPES.has(type)) {
    return { valid: false, message: "type must be either 'income' or 'expense'" };
  }

  if (!date || typeof date !== "string" || Number.isNaN(Date.parse(date))) {
    return { valid: false, message: "date must be a valid ISO string" };
  }

  return { valid: true };
}

router.get("/transactions", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessId(req.user.id);
    if (!businessId) {
      return res.status(404).json({ error: "Business not found" });
    }

    const result = await pool.query(
      `SELECT id,
              business_id,
              account_id,
              category_id,
              amount,
              type,
              description,
              date,
              note,
              created_at
       FROM transactions
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("GET /transactions error:", err);
    res.status(500).json({ error: "Failed to load transactions." });
  }
});

router.post("/transactions", requireAuth, async (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessId(req.user.id);
    if (!businessId) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { account_id, category_id, amount, type, description, date, note } =
      req.body;

    const result = await pool.query(
      `INSERT INTO transactions
        (id, business_id, account_id, category_id, amount, type, description, date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        account_id,
        category_id,
        amount,
        type,
        description || null,
        date,
        note || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /transactions error:", err);
    res.status(500).json({ error: "Failed to save transaction." });
  }
});

export default router;
