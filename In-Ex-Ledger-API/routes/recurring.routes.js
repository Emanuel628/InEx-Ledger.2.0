const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  RecurringTemplateValidationError,
  normalizeRecurringPayload,
  materializeTemplateRuns,
  materializeNextTemplateRun,
  verifyTemplateOwnership,
  mapRecurringRow,
  computeNextRunDateForUpdate
} = require("../services/recurringTransactionsService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter({ max: 80 }));

router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const result = await pool.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions
       WHERE business_id = $1
       ORDER BY active DESC, next_run_date ASC, created_at DESC
       LIMIT 500`,
      [businessId]
    );

    res.json(result.rows.map(mapRecurringRow));
  } catch (err) {
    logError("GET /recurring error:", err);
    res.status(500).json({ error: "Failed to load recurring transactions." });
  }
});

router.post("/", async (req, res) => {
  const validation = normalizeRecurringPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const client = await pool.connect();
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const normalized = validation.normalized;
    await client.query("BEGIN");
    await verifyTemplateOwnership(client, businessId, normalized.accountId, normalized.categoryId);

    const result = await client.query(
      `INSERT INTO recurring_transactions
        (id, business_id, account_id, category_id, amount, type, description, note,
         cadence, start_date, next_run_date, end_date, cleared_default, active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`,
      [
        crypto.randomUUID(),
        businessId,
        normalized.accountId,
        normalized.categoryId,
        normalized.amount,
        normalized.type,
        normalized.description,
        normalized.note || null,
        normalized.cadence,
        normalized.startDate,
        normalized.startDate,
        normalized.endDate,
        normalized.clearedDefault,
        normalized.active
      ]
    );

    await client.query("COMMIT");
    await materializeTemplateRuns(businessId, result.rows[0].id);

    const refreshed = await pool.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [result.rows[0].id, businessId]
    );

    res.status(201).json(mapRecurringRow(refreshed.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    logError("POST /recurring error:", err);
    const statusCode = err instanceof RecurringTemplateValidationError ? err.statusCode : 500;
    res.status(statusCode).json({
      error: err.message || "Failed to create recurring transaction."
    });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const validation = normalizeRecurringPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.message });
  }

  const client = await pool.connect();
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const normalized = validation.normalized;
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [req.params.id, businessId]
    );

    if (!existing.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Recurring transaction not found." });
    }

    await verifyTemplateOwnership(client, businessId, normalized.accountId, normalized.categoryId);
    const scheduling = computeNextRunDateForUpdate(normalized, existing.rows[0]);

    const result = await client.query(
      `UPDATE recurring_transactions
       SET account_id = $1,
           category_id = $2,
           amount = $3,
           type = $4,
           description = $5,
           note = $6,
           cadence = $7,
           start_date = $8,
           next_run_date = $9,
           end_date = $10,
           cleared_default = $11,
           active = $12,
           updated_at = NOW()
       WHERE id = $13 AND business_id = $14
       RETURNING *`,
      [
        normalized.accountId,
        normalized.categoryId,
        normalized.amount,
        normalized.type,
        normalized.description,
        normalized.note || null,
        normalized.cadence,
        normalized.startDate,
        scheduling.nextRunDate,
        normalized.endDate,
        normalized.clearedDefault,
        scheduling.active,
        req.params.id,
        businessId
      ]
    );

    await client.query("COMMIT");
    await materializeTemplateRuns(businessId, req.params.id);
    res.json(mapRecurringRow(result.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    logError("PUT /recurring/:id error:", err);
    const statusCode = err instanceof RecurringTemplateValidationError ? err.statusCode : 500;
    res.status(statusCode).json({
      error: err.message || "Failed to update recurring transaction."
    });
  } finally {
    client.release();
  }
});

router.patch("/:id/status", async (req, res) => {
  if (typeof req.body?.active !== "boolean") {
    return res.status(400).json({ error: "active must be true or false" });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      `UPDATE recurring_transactions
       SET active = $1, updated_at = NOW()
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [req.body.active, req.params.id, businessId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Recurring transaction not found." });
    }

    res.json(mapRecurringRow(result.rows[0]));
  } catch (err) {
    logError("PATCH /recurring/:id/status error:", err);
    res.status(500).json({ error: "Failed to update recurring status." });
  }
});

router.post("/:id/run", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await materializeNextTemplateRun(businessId, req.params.id);
    if (!result.found) {
      return res.status(404).json({ error: "Recurring transaction not found." });
    }

    if (result.locked) {
      return res.status(409).json({
        error: "This occurrence falls inside a locked accounting period and cannot be posted.",
        code: "accounting_period_locked"
      });
    }

    const template = await pool.query(
      `SELECT id, business_id, account_id, category_id, amount, type, description, note,
              cadence, start_date, next_run_date, end_date, last_run_date, cleared_default, active,
              created_at, updated_at
       FROM recurring_transactions WHERE id = $1 AND business_id = $2 LIMIT 1`,
      [req.params.id, businessId]
    );
    if (!template.rowCount) {
      return res.status(404).json({ error: "Recurring transaction not found." });
    }

    res.json({
      created: result.created === true,
      recurring: mapRecurringRow(template.rows[0])
    });
  } catch (err) {
    logError("POST /recurring/:id/run error:", err);
    const statusCode = err instanceof RecurringTemplateValidationError ? err.statusCode : 500;
    res.status(statusCode).json({
      error: err.message || "Failed to post recurring transaction."
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const result = await pool.query(
      "DELETE FROM recurring_transactions WHERE id = $1 AND business_id = $2",
      [req.params.id, businessId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Recurring transaction not found." });
    }

    res.json({ message: "Recurring transaction deleted." });
  } catch (err) {
    logError("DELETE /recurring/:id error:", err);
    res.status(500).json({ error: "Failed to delete recurring transaction." });
  }
});

module.exports = router;
