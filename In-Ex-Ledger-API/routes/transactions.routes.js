import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deriveCategoryKindFromSlug(slug) {
  const normalized = String(slug ?? "").trim().toLowerCase();
  const parts = normalized.split("_");
  const candidate = parts[1];
  if (candidate === "income" || candidate === "expense") {
    return candidate;
  }
  return null;
}

function deriveCategoryNameFromSlug(slug) {
  const normalized = String(slug ?? "").trim();
  const parts = normalized.split("_");
  if (parts.length > 2) {
    const name = parts.slice(2).join(" ").replace(/-/g, " ");
    if (name.trim()) {
      return name.trim();
    }
  }
  return normalized;
}

async function resolveCategoryId(businessId, categoryRef, fallbackKind) {
  const raw = String(categoryRef ?? "").trim();
  if (!raw) {
    return null;
  }

  if (UUID_REGEX.test(raw)) {
    return raw;
  }

  const kind = deriveCategoryKindFromSlug(raw) || fallbackKind || "expense";
  const name = deriveCategoryNameFromSlug(raw);

  const existing = await pool.query(
    "SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2) LIMIT 1",
    [businessId, name]
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `INSERT INTO categories (id, business_id, name, kind, created_at)
     VALUES (uuid_generate_v4(), $1, $2, $3, now())
     RETURNING id`,
    [businessId, name, kind]
  );

  return inserted.rows[0].id;
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

router.get("/", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

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

router.post("/", requireAuth, async (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const { account_id, category_id, amount, type, description, date, note } =
      req.body;
    const mappedCategoryId = await resolveCategoryId(
      businessId,
      category_id,
      type
    );

    if (!mappedCategoryId) {
      return res.status(400).json({ error: "category_id is invalid" });
    }

    const result = await pool.query(
      `INSERT INTO transactions
        (id, business_id, account_id, category_id, amount, type, description, date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        account_id,
        mappedCategoryId,
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
