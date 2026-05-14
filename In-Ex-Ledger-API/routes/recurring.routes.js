const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const { BasicPlanLimitError } = require("../services/basicPlanUsageService.js");
const {
  RecurringTemplateValidationError,
  normalizeRecurringPayload,
  materializeTemplateRuns,
  materializeNextTemplateRun,
  verifyTemplateOwnership,
  mapRecurringRow,
  computeNextRunDateForUpdate,
  projectUpcomingOccurrences
} = require("../services/recurringTransactionsService.js");
const {
  loadAccountingLockState,
  isDateLocked
} = require("../services/accountingLockService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter({ max: 80 }));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateRecurringIdParam(id) {
  return UUID_RE.test(String(id || ""));
}

router.use(async (req, res, next) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (!hasFeatureAccess(subscription, "recurring_transactions")) {
      return res.status(402).json({ error: "Recurring transactions require an active Pro plan." });
    }
    next();
  } catch (err) {
    next(err);
  }
});

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
  if (!validateRecurringIdParam(req.params.id)) {
    return res.status(400).json({ error: "Invalid recurring transaction id." });
  }
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
  if (!validateRecurringIdParam(req.params.id)) {
    return res.status(400).json({ error: "Invalid recurring transaction id." });
  }
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
  if (!validateRecurringIdParam(req.params.id)) {
    return res.status(400).json({ error: "Invalid recurring transaction id." });
  }
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
    const statusCode =
      err instanceof RecurringTemplateValidationError || err instanceof BasicPlanLimitError
        ? err.statusCode
        : 500;
    res.status(statusCode).json({
      error: err.message || "Failed to post recurring transaction.",
      ...(err instanceof BasicPlanLimitError ? { code: err.code, ...err.details } : {})
    });
  }
});

router.delete("/:id", async (req, res) => {
  if (!validateRecurringIdParam(req.params.id)) {
    return res.status(400).json({ error: "Invalid recurring transaction id." });
  }
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

/**
 * GET /api/recurring/:id/runs
 * History of generated runs for a template (most recent first).
 */
router.get("/:id/runs", async (req, res) => {
  if (!validateRecurringIdParam(req.params.id)) {
    return res.status(400).json({ error: "Invalid recurring transaction id." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const result = await pool.query(
      `SELECT r.id, r.occurrence_date, r.transaction_id, r.created_at,
              t.amount, t.cleared, t.description
         FROM recurring_transaction_runs r
    LEFT JOIN transactions t ON t.id = r.transaction_id
        WHERE r.recurring_transaction_id = $1
          AND r.business_id = $2
        ORDER BY r.occurrence_date DESC, r.created_at DESC
        LIMIT $3`,
      [req.params.id, businessId, limit]
    );
    res.json({ runs: result.rows, count: result.rowCount });
  } catch (err) {
    logError("GET /recurring/:id/runs error:", err);
    res.status(500).json({ error: "Failed to load recurring run history." });
  }
});

/**
 * GET /api/recurring/upcoming?days=30&per_template=5
 * Projects upcoming occurrences across every active template, flagging any
 * that would land inside a locked accounting period. Useful for a "what's
 * about to post" sidebar / banner.
 */
router.get("/upcoming", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    const perTemplate = Math.min(Math.max(parseInt(req.query.per_template, 10) || 5, 1), 20);
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const templatesResult = await pool.query(
      `SELECT id, description, cadence, next_run_date, end_date, account_id,
              category_id, type, amount, active
         FROM recurring_transactions
        WHERE business_id = $1 AND active = true
        ORDER BY next_run_date ASC`,
      [businessId]
    );

    const lockState = await loadAccountingLockState(pool, businessId);
    const lockedThrough = lockState?.lockedThroughDate || null;

    const upcoming = [];
    for (const template of templatesResult.rows) {
      const projected = projectUpcomingOccurrences(template, perTemplate);
      for (const date of projected) {
        if (date < today) continue;
        if (date > cutoff) break;
        upcoming.push({
          template_id: template.id,
          description: template.description,
          cadence: template.cadence,
          amount: Number(template.amount || 0),
          type: template.type,
          account_id: template.account_id,
          category_id: template.category_id,
          occurrence_date: date,
          locked_period: lockedThrough ? isDateLocked(date, lockedThrough) : false
        });
      }
    }
    upcoming.sort((a, b) => (a.occurrence_date < b.occurrence_date ? -1 : 1));

    const blockedCount = upcoming.filter((entry) => entry.locked_period).length;

    res.json({
      today,
      cutoff,
      upcoming,
      blocked_by_locked_period: blockedCount,
      template_count: templatesResult.rowCount
    });
  } catch (err) {
    logError("GET /recurring/upcoming error:", err);
    res.status(500).json({ error: "Failed to load upcoming recurring runs." });
  }
});

module.exports = router;
