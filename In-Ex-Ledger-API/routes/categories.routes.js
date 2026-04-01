import express from "express";
import crypto from "node:crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { resolveBusinessIdForUser } from "../api/utils/resolveBusinessIdForUser.js";

const router = express.Router();
router.use(requireAuth);

const VALID_KINDS = new Set(["income", "expense"]);

/**
 * GET /api/categories
 */
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `SELECT id, name, kind, tax_map_us, tax_map_ca, is_default, created_at
       FROM categories
       WHERE business_id = $1
       ORDER BY kind, name`,
      [businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /categories error:", err.message);
    res.status(500).json({ error: "Failed to load categories." });
  }
});

/**
 * POST /api/categories
 */
router.post("/", async (req, res) => {
  const { name, kind, tax_map_us, tax_map_ca } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!kind || !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: "kind must be 'income' or 'expense'" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `INSERT INTO categories (id, business_id, name, kind, tax_map_us, tax_map_ca)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, kind, tax_map_us, tax_map_ca, is_default, created_at`,
      [crypto.randomUUID(), businessId, name.trim(), kind, tax_map_us || null, tax_map_ca || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /categories error:", err.message);
    res.status(500).json({ error: "Failed to create category." });
  }
});

/**
 * PUT /api/categories/:id
 */
router.put("/:id", async (req, res) => {
  const { name, kind, tax_map_us, tax_map_ca } = req.body ?? {};

  if (kind && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: "kind must be 'income' or 'expense'" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const existing = await pool.query(
      "SELECT id FROM categories WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    const result = await pool.query(
      `UPDATE categories
       SET name = COALESCE($1, name),
           kind = COALESCE($2, kind),
           tax_map_us = COALESCE($3, tax_map_us),
           tax_map_ca = COALESCE($4, tax_map_ca)
       WHERE id = $5 AND business_id = $6
       RETURNING id, name, kind, tax_map_us, tax_map_ca, is_default, created_at`,
      [name?.trim() || null, kind || null, tax_map_us || null, tax_map_ca || null, req.params.id, businessId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /categories/:id error:", err.message);
    res.status(500).json({ error: "Failed to update category." });
  }
});

export default router;
