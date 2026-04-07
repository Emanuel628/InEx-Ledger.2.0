const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser, getBusinessScopeForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
const VALID_TRANSACTION_TYPES = new Set(["income", "expense"]);
const MAX_TRANSACTION_AMOUNT = 999999999.99;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(requireAuth);
router.use(createDataApiLimiter());

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
    VALUES ($1, $2, $3, $4, now())
    RETURNING id`,
    [crypto.randomUUID(), businessId, name, kind]
    );


  return inserted.rows[0].id;
}

function validateTransactionPayload(payload) {
  const { account_id, category_id, amount, date, type, cleared } = payload ?? {};

  if (!account_id) {
    return { valid: false, message: "account_id is required" };
  }

  if (!category_id) {
    return { valid: false, message: "category_id is required" };
  }

  if (amount === undefined || amount === null || amount === "") {
    return { valid: false, message: "amount is required" };
  }

  const normalizedAmount = Number.parseFloat(amount);
  if (!Number.isFinite(normalizedAmount)) {
    return { valid: false, message: "amount must be a number" };
  }

  if (normalizedAmount <= 0 || normalizedAmount > MAX_TRANSACTION_AMOUNT) {
    return { valid: false, message: `amount must be greater than 0 and at most ${MAX_TRANSACTION_AMOUNT}` };
  }

  if (!type || !VALID_TRANSACTION_TYPES.has(type)) {
    return { valid: false, message: "type must be either 'income' or 'expense'" };
  }

  if (!date || typeof date !== "string" || Number.isNaN(Date.parse(date))) {
    return { valid: false, message: "date must be a valid ISO string" };
  }

  if (cleared !== undefined && typeof cleared !== "boolean") {
    return { valid: false, message: "cleared must be true or false" };
  }

  return {
    valid: true,
    normalized: {
      account_id,
      category_id,
      amount: normalizedAmount,
      date,
      type,
      cleared: cleared === true
    }
  };
}

router.get("/", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 100, 1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const result = await pool.query(
      `SELECT t.id,
              t.business_id,
              b.name AS business_name,
              t.account_id,
              a.name AS account_name,
              t.category_id,
              c.name AS category_name,
              t.amount,
              t.type,
              t.cleared,
              t.description,
              t.date,
              t.note,
              t.recurring_transaction_id,
              t.recurring_occurrence_date,
              t.created_at
       FROM transactions t
       JOIN businesses b ON b.id = t.business_id
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.business_id = ANY($1::uuid[])
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [scope.businessIds, limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE business_id = ANY($1::uuid[])",
      [scope.businessIds]
    );

    res.status(200).json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset
    });
  } catch (err) {
    console.error("GET /transactions error:", err);
    res.status(500).json({ error: "Failed to load transactions." });
  }
});

router.post("/", async (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const { account_id, category_id, amount, type, date, cleared } = validation.normalized;
    const { description, note } = req.body;

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      return res.status(400).json({ error: "account_id does not belong to your business" });
    }

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
        (id, business_id, account_id, category_id, amount, type, cleared, description, date, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        account_id,
        mappedCategoryId,
        amount,
        type,
        cleared,
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

router.put("/:id", async (req, res) => {
  const validation = validateTransactionPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const { account_id, category_id, amount, type, date, cleared } = validation.normalized;
    const { description, note } = req.body;

    const accountCheck = await pool.query(
      "SELECT id FROM accounts WHERE id = $1 AND business_id = $2",
      [account_id, businessId]
    );
    if (accountCheck.rowCount === 0) {
      return res.status(400).json({ error: "account_id does not belong to your business" });
    }

    const mappedCategoryId = await resolveCategoryId(businessId, category_id, type);
    if (!mappedCategoryId) {
      return res.status(400).json({ error: "category_id is invalid" });
    }

    const result = await pool.query(
      `UPDATE transactions
       SET account_id = $1, category_id = $2, amount = $3, type = $4,
           cleared = $5, description = $6, date = $7, note = $8
       WHERE id = $9 AND business_id = $10
       RETURNING *`,
      [account_id, mappedCategoryId, amount, type, cleared, description || null, date, note || null,
       req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /transactions/:id error:", err);
    res.status(500).json({ error: "Failed to update transaction." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "DELETE FROM transactions WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json({ message: "Transaction deleted." });
  } catch (err) {
    console.error("DELETE /transactions/:id error:", err);
    res.status(500).json({ error: "Failed to delete transaction." });
  }
});

router.patch("/:id/cleared", async (req, res) => {
  if (typeof req.body?.cleared !== "boolean") {
    return res.status(400).json({ error: "cleared must be true or false" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `UPDATE transactions
       SET cleared = $1
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [req.body.cleared, req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /transactions/:id/cleared error:", err);
    res.status(500).json({ error: "Failed to update cleared status." });
  }
});

module.exports = router;
