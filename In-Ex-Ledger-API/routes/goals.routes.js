const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter());

const ALLOWED_GOAL_TYPES = ["savings", "spending_limit", "income_target"];

/**
 * GET /api/goals
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `SELECT id, name, type, target_amount, current_amount, due_date,
              notes, is_completed, created_at, updated_at
         FROM goals
        WHERE business_id = $1
        ORDER BY created_at DESC`,
      [businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("✗ GET goals error:", err.message);
    res.status(500).json({ error: "Failed to retrieve goals." });
  }
});

/**
 * POST /api/goals
 */
router.post("/", async (req, res) => {
  const { name, type, target_amount, current_amount, due_date, notes } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Goal name is required." });
  }

  if (!type) {
    return res.status(400).json({ error: `Goal type is required. Must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` });
  }

  if (!ALLOWED_GOAL_TYPES.includes(type)) {
    return res.status(400).json({ error: `Goal type must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` });
  }

  const parsedTarget = Number.parseFloat(target_amount);
  if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
    return res.status(400).json({ error: "target_amount must be a positive number." });
  }

  let parsedCurrent = 0;
  if (current_amount !== undefined && current_amount !== null && current_amount !== "") {
    parsedCurrent = Number.parseFloat(current_amount);
    if (!Number.isFinite(parsedCurrent) || parsedCurrent < 0) {
      return res.status(400).json({ error: "current_amount must be a non-negative number." });
    }
  }

  if (due_date && Number.isNaN(Date.parse(due_date))) {
    return res.status(400).json({ error: "due_date must be a valid date." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `INSERT INTO goals (id, business_id, name, type, target_amount, current_amount, due_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        name.trim(),
        type,
        parsedTarget,
        parsedCurrent,
        due_date || null,
        notes ? String(notes).trim() : null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("✗ POST goals error:", err.message);
    res.status(500).json({ error: "Failed to save goal." });
  }
});

/**
 * PUT /api/goals/:id
 */
router.put("/:id", async (req, res) => {
  const { name, type, target_amount, current_amount, due_date, notes, is_completed } = req.body ?? {};

  if (type !== undefined && !ALLOWED_GOAL_TYPES.includes(type)) {
    return res.status(400).json({ error: `Goal type must be one of: ${ALLOWED_GOAL_TYPES.join(", ")}.` });
  }

  if (target_amount !== undefined) {
    const parsedTarget = Number.parseFloat(target_amount);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      return res.status(400).json({ error: "target_amount must be a positive number." });
    }
  }

  if (current_amount !== undefined) {
    const parsedCurrent = Number.parseFloat(current_amount);
    if (!Number.isFinite(parsedCurrent) || parsedCurrent < 0) {
      return res.status(400).json({ error: "current_amount must be a non-negative number." });
    }
  }

  if (due_date !== undefined && due_date !== null && due_date !== "" && Number.isNaN(Date.parse(due_date))) {
    return res.status(400).json({ error: "due_date must be a valid date." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const existing = await pool.query(
      "SELECT id FROM goals WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Goal not found or access denied." });
    }

    const result = await pool.query(
      `UPDATE goals
          SET name          = COALESCE($1, name),
              type          = COALESCE($2, type),
              target_amount = COALESCE($3, target_amount),
              current_amount = COALESCE($4, current_amount),
              due_date      = CASE WHEN $5::boolean THEN $6::date ELSE due_date END,
              notes         = CASE WHEN $7::boolean THEN $8 ELSE notes END,
              is_completed  = COALESCE($9, is_completed),
              updated_at    = NOW()
        WHERE id = $10 AND business_id = $11
        RETURNING *`,
      [
        name ? String(name).trim() : null,
        type || null,
        target_amount !== undefined ? Number.parseFloat(target_amount) : null,
        current_amount !== undefined ? Number.parseFloat(current_amount) : null,
        due_date !== undefined,
        (due_date !== undefined && due_date !== null && due_date !== "") ? due_date : null,
        notes !== undefined,
        notes !== undefined ? (notes ? String(notes).trim() : null) : null,
        is_completed !== undefined ? Boolean(is_completed) : null,
        req.params.id,
        businessId
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("✗ PUT goals error:", err.message);
    res.status(500).json({ error: "Failed to update goal." });
  }
});

/**
 * DELETE /api/goals/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "DELETE FROM goals WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Goal not found or access denied." });
    }

    res.json({ message: "Goal deleted successfully." });
  } catch (err) {
    console.error("✗ DELETE goals error:", err.message);
    res.status(500).json({ error: "Failed to delete goal." });
  }
});

module.exports = router;
