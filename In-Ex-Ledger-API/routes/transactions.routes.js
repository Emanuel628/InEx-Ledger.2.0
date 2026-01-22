import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = express.Router();

const transactions = [];

function validateTransactionPayload(payload) {
  const requiredFields = [
    "id",
    "business_id",
    "date",
    "description",
    "amount",
    "account_id",
    "category_id",
    "receipt_id",
    "created_at"
  ];

  for (const field of requiredFields) {
    if (!(field in payload)) {
      return { valid: false, message: `${field} is required` };
    }
  }

  const stringFields = [
    "id",
    "business_id",
    "date",
    "description",
    "account_id",
    "category_id",
    "receipt_id",
    "created_at"
  ];

  for (const field of stringFields) {
    if (typeof payload[field] !== "string") {
      return { valid: false, message: `${field} must be a string` };
    }
  }

  if (typeof payload.amount !== "number" || Number.isNaN(payload.amount)) {
    return { valid: false, message: "amount must be a number" };
  }

  return { valid: true };
}

router.get("/transactions", requireAuth, (req, res) => {
  const userTransactions = transactions.filter(
    (t) => t.user_id === req.user.id
  );
  res.status(200).json(userTransactions);
});

router.post("/transactions", requireAuth, (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const transaction = {
    ...req.body,
    user_id: req.user.id
  };

  transactions.push(transaction);
  res.status(201).json(transaction);
});

export default router;