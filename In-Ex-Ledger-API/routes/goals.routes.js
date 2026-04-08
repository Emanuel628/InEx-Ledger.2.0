const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter());

const VALID_CATEGORIES = new Set(["savings", "taxes", "emergency", "purchase", "vacation", "other"]);
const VALID_STATUSES = new Set(["active", "completed", "paused"]);
const MAX_GOAL_AMOUNT = 999999999.99;

function startOfLocalDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function validateGoalPayload(payload) {
  const { name, target_amount, target_date, category, status, current_amount, description } = payload ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return { valid: false, message: "name is required" };
  }

  if (target_amount === undefined || target_amount === null || target_amount === "") {
    return { valid: false, message: "target_amount is required" };
  }

  const normalizedTarget = Number.parseFloat(target_amount);
  if (!Number.isFinite(normalizedTarget) || normalizedTarget <= 0 || normalizedTarget > MAX_GOAL_AMOUNT) {
    return { valid: false, message: `target_amount must be a positive number up to ${MAX_GOAL_AMOUNT}` };
  }

  let normalizedCurrent = 0;
  if (current_amount !== undefined && current_amount !== null && current_amount !== "") {
    normalizedCurrent = Number.parseFloat(current_amount);
    if (!Number.isFinite(normalizedCurrent) || normalizedCurrent < 0 || normalizedCurrent > MAX_GOAL_AMOUNT) {
      return { valid: false, message: "current_amount must be a non-negative number" };
    }
  }

  if (target_date !== undefined && target_date !== null && target_date !== "") {
    if (typeof target_date !== "string" || Number.isNaN(Date.parse(target_date))) {
      return { valid: false, message: "target_date must be a valid date string" };
    }
  }

  const resolvedCategory = category && VALID_CATEGORIES.has(category) ? category : "savings";
  const resolvedStatus = status && VALID_STATUSES.has(status) ? status : "active";

  return {
    valid: true,
    normalized: {
      name: name.trim(),
      description: description ? String(description).trim() : null,
      target_amount: normalizedTarget,
      current_amount: normalizedCurrent,
      target_date: target_date || null,
      category: resolvedCategory,
      status: resolvedStatus
    }
  };
}

function computeGoalSuggestion(goal) {
  const { target_amount, current_amount, target_date } = goal;
  const remaining = Number(target_amount) - Number(current_amount);
  if (remaining <= 0) {
    return { message: "Goal reached! Great work.", weeks_remaining: 0, weekly_needed: 0 };
  }

  if (!target_date) {
    return { message: null, weeks_remaining: null, weekly_needed: null };
  }

  const now = startOfLocalDay(new Date());
  const deadline = startOfLocalDay(`${target_date}T00:00:00`);
  const diffMs = deadline - now;
  if (diffMs <= 0) {
    return { message: "This goal is past its target date.", weeks_remaining: 0, weekly_needed: null };
  }

  const weeksRemaining = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));
  const weeklyNeeded = weeksRemaining > 0 ? (remaining / weeksRemaining).toFixed(2) : null;

  const deadlineLabel = deadline.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
  const message = weeklyNeeded
    ? `Save an additional $${weeklyNeeded} weekly to meet your goal by ${deadlineLabel}.`
    : null;

  return { message, weeks_remaining: weeksRemaining, weekly_needed: weeklyNeeded ? Number(weeklyNeeded) : null };
}

function mapGoalRow(row) {
  const progress =
    row.target_amount > 0
      ? Math.min(100, Math.round((Number(row.current_amount) / Number(row.target_amount)) * 100))
      : 0;

  return {
    id: row.id,
    business_id: row.business_id,
    name: row.name,
    description: row.description,
    target_amount: Number(row.target_amount),
    current_amount: Number(row.current_amount),
    target_date: row.target_date ? String(row.target_date).slice(0, 10) : null,
    category: row.category,
    status: row.status,
    progress_pct: progress,
    suggestion: computeGoalSuggestion(row),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// GET /api/goals
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `SELECT id, business_id, name, description, target_amount, current_amount,
              target_date, category, status, created_at, updated_at
       FROM financial_goals
       WHERE business_id = $1
       ORDER BY status ASC, target_date ASC NULLS LAST, created_at DESC`,
      [businessId]
    );

    res.json(result.rows.map(mapGoalRow));
  } catch (err) {
    console.error("GET /goals error:", err);
    res.status(500).json({ error: "Failed to load goals." });
  }
});

// POST /api/goals
router.post("/", async (req, res) => {
  const validation = validateGoalPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const { name, description, target_amount, current_amount, target_date, category, status } = validation.normalized;

    const result = await pool.query(
      `INSERT INTO financial_goals
        (id, business_id, name, description, target_amount, current_amount, target_date, category, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [crypto.randomUUID(), businessId, name, description, target_amount, current_amount, target_date, category, status]
    );

    res.status(201).json(mapGoalRow(result.rows[0]));
  } catch (err) {
    console.error("POST /goals error:", err);
    res.status(500).json({ error: "Failed to create goal." });
  }
});

// PUT /api/goals/:id
router.put("/:id", async (req, res) => {
  const validation = validateGoalPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const { name, description, target_amount, current_amount, target_date, category, status } = validation.normalized;

    const result = await pool.query(
      `UPDATE financial_goals
       SET name = $1,
           description = $2,
           target_amount = $3,
           current_amount = $4,
           target_date = $5,
           category = $6,
           status = $7,
           updated_at = NOW()
       WHERE id = $8 AND business_id = $9
       RETURNING *`,
      [name, description, target_amount, current_amount, target_date, category, status, req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    res.json(mapGoalRow(result.rows[0]));
  } catch (err) {
    console.error("PUT /goals/:id error:", err);
    res.status(500).json({ error: "Failed to update goal." });
  }
});

// PATCH /api/goals/:id/progress — update only current_amount
router.patch("/:id/progress", async (req, res) => {
  const raw = req.body?.current_amount;
  if (raw === undefined || raw === null) {
    return res.status(400).json({ error: "current_amount is required" });
  }

  const amount = Number.parseFloat(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_GOAL_AMOUNT) {
    return res.status(400).json({ error: "current_amount must be a non-negative number" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `UPDATE financial_goals
       SET current_amount = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [amount, req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    res.json(mapGoalRow(result.rows[0]));
  } catch (err) {
    console.error("PATCH /goals/:id/progress error:", err);
    res.status(500).json({ error: "Failed to update goal progress." });
  }
});

// DELETE /api/goals/:id
router.delete("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "DELETE FROM financial_goals WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Goal not found." });
    }

    res.json({ message: "Goal deleted." });
  } catch (err) {
    console.error("DELETE /goals/:id error:", err);
    res.status(500).json({ error: "Failed to delete goal." });
  }
});

module.exports = router;
