const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  resolveBusinessIdForUser,
  getBusinessScopeForUser
} = require("../api/utils/resolveBusinessIdForUser.js");
const {
  loadAccountingLockState,
  assertNoLockedPeriodTransactionsForCategory,
  AccountingPeriodLockedError
} = require("../services/accountingLockService.js");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89abAB][0-9a-f]{3}-[0-9a-f]{12}$/i;

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

const VALID_KINDS = new Set(["income", "expense"]);
const VALID_COLORS = new Set(["blue", "green", "amber", "pink", "red", "slate"]);
const PG_UNIQUE_VIOLATION = "23505";
const CATEGORY_NAME_UNIQUE_CONSTRAINTS = new Set([
  "categories_business_name_unique",
  "categories_business_name_unique_ci"
]);

function normalizeOptionalTrimmedString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function isCategoryNameConflict(err) {
  return (
    err?.code === PG_UNIQUE_VIOLATION &&
    typeof err?.constraint === "string" &&
    CATEGORY_NAME_UNIQUE_CONSTRAINTS.has(err.constraint)
  );
}

/**
 * GET /api/categories
 */
router.get("/", async (req, res) => {
  try {
    const scope = await getBusinessScopeForUser(req.user, req.query?.scope);
    const result = await pool.query(
      `SELECT c.id, c.business_id, b.name AS business_name, c.name, c.kind, c.color, c.tax_map_us, c.tax_map_ca, c.is_default, c.created_at
       FROM categories c
       JOIN businesses b ON b.id = c.business_id
       WHERE c.business_id = ANY($1::uuid[])
       ORDER BY b.name ASC, c.kind, c.name
       LIMIT 500`,
      [scope.businessIds]
    );
    res.json(result.rows);
  } catch (err) {
    logError("GET /categories error:", err.message);
    res.status(500).json({ error: "Failed to load categories." });
  }
});

/**
 * POST /api/categories
 */
router.post("/", async (req, res) => {
  const { name, kind, color, tax_map_us, tax_map_ca } = req.body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!kind || !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: "kind must be 'income' or 'expense'" });
  }
  if (color && !VALID_COLORS.has(color)) {
    return res.status(400).json({ error: "color is invalid" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `INSERT INTO categories (id, business_id, name, kind, color, tax_map_us, tax_map_ca)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, kind, color, tax_map_us, tax_map_ca, is_default, created_at`,
      [crypto.randomUUID(), businessId, name.trim(), kind, color || null, tax_map_us || null, tax_map_ca || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (isCategoryNameConflict(err)) {
      return res.status(409).json({ error: "A category with this name already exists." });
    }
    logError("POST /categories error:", err.message);
    res.status(500).json({ error: "Failed to create category." });
  }
});

/**
 * PUT /api/categories/:id
 */
router.put("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid category ID." });
  }
  const { name, kind, color, tax_map_us, tax_map_ca } = req.body ?? {};

  if (kind && !VALID_KINDS.has(kind)) {
    return res.status(400).json({ error: "kind must be 'income' or 'expense'" });
  }
  if (name !== undefined && (!name || typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name cannot be empty" });
  }
  if (color !== undefined && color !== null && !VALID_COLORS.has(color)) {
    return res.status(400).json({ error: "color is invalid" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const existing = await pool.query(
      "SELECT id, name, kind, color, tax_map_us, tax_map_ca FROM categories WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ error: "Category not found." });
    }

    const current = existing.rows[0];
    const newName = name !== undefined ? normalizeOptionalTrimmedString(name) : current.name;
    const newKind = kind !== undefined ? (kind ?? null) : current.kind;
    const newColor = color !== undefined ? (color ?? null) : current.color;
    const newTaxMapUs = tax_map_us !== undefined ? (tax_map_us ?? null) : current.tax_map_us;
    const newTaxMapCa = tax_map_ca !== undefined ? (tax_map_ca ?? null) : current.tax_map_ca;

    // Block classification changes that would retroactively alter locked-period history.
    // Pure name or color changes are always permitted.
    const classificationChanging =
      newKind !== current.kind ||
      newTaxMapUs !== current.tax_map_us ||
      newTaxMapCa !== current.tax_map_ca;

    if (classificationChanging) {
      const lockState = await loadAccountingLockState(pool, businessId);
      await assertNoLockedPeriodTransactionsForCategory(pool, businessId, req.params.id, lockState);
    }

    const result = await pool.query(
      `UPDATE categories
       SET name = $1,
           kind = $2,
           color = $3,
           tax_map_us = $4,
           tax_map_ca = $5
       WHERE id = $6 AND business_id = $7
       RETURNING id, name, kind, color, tax_map_us, tax_map_ca, is_default, created_at`,
      [newName, newKind, newColor, newTaxMapUs, newTaxMapCa, req.params.id, businessId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (isCategoryNameConflict(err)) {
      return res.status(409).json({ error: "A category with this name already exists." });
    }
    if (err instanceof AccountingPeriodLockedError) {
      return res.status(err.status).json({
        error: err.message,
        code: err.code,
        locked_through_date: err.lockedThroughDate
      });
    }
    logError("PUT /categories/:id error:", err.message);
    res.status(500).json({ error: "Failed to update category." });
  }
});

/**
 * DELETE /api/categories/:id
 */
router.delete("/:id", async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid category ID." });
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

    const usage = await pool.query(
      "SELECT COUNT(*) FROM transactions WHERE category_id = $1 AND business_id = $2 AND deleted_at IS NULL",
      [req.params.id, businessId]
    );
    if (parseInt(usage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({ error: "This category cannot be deleted because it is in use." });
    }

    const recurringUsage = await pool.query(
      "SELECT COUNT(*) FROM recurring_transactions WHERE category_id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );
    if (parseInt(recurringUsage.rows[0]?.count || "0", 10) > 0) {
      return res.status(409).json({
        error: "This category cannot be deleted because it is used by a recurring transaction."
      });
    }

    await pool.query(
      "DELETE FROM categories WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    res.json({ message: "Category deleted." });
  } catch (err) {
    logError("DELETE /categories/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete category." });
  }
});

module.exports = router;
