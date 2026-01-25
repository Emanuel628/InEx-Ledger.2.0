import express from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

function validateTransactionPayload(payload) {
  const requiredFields = [
    "account_id",
    "category_id",
    "amount",
    "type",
    "description",
    "date"
  ];

  for (const field of requiredFields) {
    if (payload[field] === undefined || payload[field] === null) {
      return { valid: false, message: `${field} is required` };
    }
  }

  if (typeof payload.account_id !== "string") {
    return { valid: false, message: "account_id must be a string" };
  }

  if (typeof payload.category_id !== "string") {
    return { valid: false, message: "category_id must be a string" };
  }

  if (typeof payload.description !== "string") {
    return { valid: false, message: "description must be a string" };
  }

  if (typeof payload.date !== "string") {
    return { valid: false, message: "date must be a string" };
  }

  if (typeof payload.amount !== "number" || Number.isNaN(payload.amount)) {
    return { valid: false, message: "amount must be a number" };
  }

  if (!["income", "expense"].includes(payload.type)) {
    return { valid: false, message: "type must be either income or expense" };
  }

  if (payload.note && typeof payload.note !== "string") {
    return { valid: false, message: "note must be a string" };
  }

  return { valid: true };
}

async function getBusinessIdForUser(userId) {
  const result = await pool.query(
    "SELECT id FROM businesses WHERE user_id = $1 LIMIT 1",
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].id;
}

router.get("/transactions", requireAuth, async (req, res) => {
  try {
    const businessId = await getBusinessIdForUser(req.user.id);
    if (!businessId) {
      return res.status(404).json({ error: "Business not found" });
    }

    const result = await pool.query(
      "SELECT * FROM transactions WHERE business_id = $1 ORDER BY created_at DESC",
      [businessId]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("GET /transactions error:", err.message);
    res.status(500).json({ error: "Failed to load transactions" });
  }
});

router.post("/transactions", requireAuth, async (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await getBusinessIdForUser(req.user.id);
    if (!businessId) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { account_id, category_id, amount, type, description, date, note } =
      req.body;

    const result = await pool.query(
      `INSERT INTO transactions 
        (business_id, account_id, category_id, amount, type, description, date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        businessId,
        account_id,
        category_id,
        amount,
        type,
        description,
        date,
        note || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /transactions error:", err.message);
    res.status(500).json({ error: "Failed to save transaction" });
  }
});

export default router;
