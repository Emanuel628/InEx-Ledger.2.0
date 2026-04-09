const crypto = require("crypto");
const express = require("express");
const { pool } = require("../db.js");
const { requireAuth, requireMfa } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError } = require("../utils/logger.js");
const { decrypt } = require("../services/encryptionService.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter());

const MAX_USER_AGENT_LENGTH = 512;

/**
 * Append an entry to the immutable user_action_audit_log.
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.action  - 'data_export' | 'erasure_request' | 'admin_override'
 * @param {string} [opts.format]
 * @param {string} [opts.ipAddress]
 * @param {string} [opts.userAgent]
 * @param {string} [opts.performedBy]  - admin user ID for overrides
 * @param {object} [opts.metadata]
 */
async function logUserAction({ userId, action, format, ipAddress, userAgent, performedBy, metadata }) {
  try {
    await pool.query(
      `INSERT INTO user_action_audit_log
         (id, user_id, action, format, ip_address, user_agent, performed_by, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        userId,
        action,
        format || null,
        ipAddress || null,
        userAgent ? String(userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
        performedBy || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (err) {
    logError("Failed to write user_action_audit_log", { userId, action, err: err.message });
  }
}

/**
 * Serialise an array of objects to RFC-4180 CSV.
 * The header row is derived from the keys of the first row.
 */
function toCsv(rows) {
  if (!rows || !rows.length) return "";
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

/**
 * GET /api/privacy/settings
 */
router.get("/settings", async (req, res) => {
  try {
    const [privacyResult, userResult] = await Promise.all([
      pool.query(
        "SELECT data_sharing_opt_out, consent_given, analytics_opt_in FROM user_privacy_settings WHERE user_id = $1",
        [req.user.id]
      ),
      pool.query(
        "SELECT data_residency FROM users WHERE id = $1 LIMIT 1",
        [req.user.id]
      )
    ]);

    const row = privacyResult.rows[0];
    const dataResidency = userResult.rows[0]?.data_residency || "US";
    const isQuebec = dataResidency === "CA-QC";

    // Quebec Privacy Default: if no row exists yet, default data sharing to OFF
    const defaultOptOut = isQuebec;

    res.json({
      dataSharingOptOut: row ? row.data_sharing_opt_out : defaultOptOut,
      consentGiven: row ? row.consent_given : !defaultOptOut,
      // analyticsOptIn is the Quebec-specific explicit opt-in; defaults to false (off)
      analyticsOptIn: row ? Boolean(row.analytics_opt_in) : false,
      dataResidency
    });
  } catch (err) {
    logError("GET /privacy/settings error", { err: err.message });
    res.status(500).json({ error: "Failed to load privacy settings." });
  }
});

/**
 * POST /api/privacy/settings
 */
router.post("/settings", async (req, res) => {
  const dataSharingOptOut = typeof req.body?.dataSharingOptOut === "boolean" ? req.body.dataSharingOptOut : false;
  const consentGiven = typeof req.body?.consentGiven === "boolean" ? req.body.consentGiven : true;
  // analyticsOptIn is only meaningful for Quebec users (Law 25 explicit opt-in).
  // Accepted but silently ignored for non-QC users.
  const analyticsOptIn = typeof req.body?.analyticsOptIn === "boolean" ? req.body.analyticsOptIn : null;

  try {
    // Fetch the user's data_residency to determine if consent logging is required
    const userResult = await pool.query(
      "SELECT data_residency FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const dataResidency = userResult.rows[0]?.data_residency || "US";
    const isQuebec = dataResidency === "CA-QC";

    // Fetch existing privacy row to detect changes for consent logging
    const existingResult = await pool.query(
      "SELECT analytics_opt_in FROM user_privacy_settings WHERE user_id = $1",
      [req.user.id]
    );
    const previousAnalyticsOptIn = existingResult.rows[0]?.analytics_opt_in ?? false;

    // Determine the analytics_opt_in value to persist.
    // Only update it if a value was explicitly provided; otherwise keep the existing value.
    const nextAnalyticsOptIn = analyticsOptIn !== null ? analyticsOptIn : previousAnalyticsOptIn;

    await pool.query(
      `INSERT INTO user_privacy_settings (user_id, data_sharing_opt_out, consent_given, analytics_opt_in, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET data_sharing_opt_out = EXCLUDED.data_sharing_opt_out,
             consent_given = EXCLUDED.consent_given,
             analytics_opt_in = EXCLUDED.analytics_opt_in,
             updated_at = NOW()`,
      [req.user.id, dataSharingOptOut, consentGiven, nextAnalyticsOptIn]
    );

    // Log explicit consent changes for Quebec users (Law 25 requirement).
    // Always log data-sharing opt-out changes.
    if (dataResidency === "CA-QC") {
      const ipAddress = req.ip || req.connection?.remoteAddress || null;
      const userAgent = String(req.get("user-agent") || "").slice(0, MAX_USER_AGENT_LENGTH) || null;

      // Log data-sharing opt-out change
      const action = dataSharingOptOut ? "opt_out" : "opt_in";
      await pool.query(
        `INSERT INTO privacy_consent_log (user_id, data_residency, action, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, dataResidency, action, ipAddress, userAgent]
      );

      // Log analytics opt-in consent separately when the QC user explicitly enables/disables
      // tracking.  This block is already scoped to QC (outer if above); the extra
      // change-detection guard prevents duplicate log rows on no-op saves.
      if (analyticsOptIn !== null && analyticsOptIn !== previousAnalyticsOptIn) {
        const analyticsAction = analyticsOptIn ? "opt_in" : "opt_out";
        await pool.query(
          `INSERT INTO privacy_consent_log (user_id, data_residency, action, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.user.id, `${dataResidency}:analytics`, analyticsAction, ipAddress, userAgent]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logError("POST /privacy/settings error", { err: err.message });
    res.status(500).json({ error: "Failed to save privacy settings." });
  }
});

/**
 * POST /api/privacy/export
 * Self-service data portability: export ledger data, audit logs, and adjustment
 * histories.  Supports JSON (default) and CSV via ?format=csv or body.format.
 *
 * Key ledger fields included: TransactionIDs, Amounts, Dates, Categories.
 * Audit trail: every successful export is logged in user_action_audit_log.
 */
router.post("/export", requireMfa, async (req, res) => {
  const format = String(req.query.format || req.body?.format || "json").toLowerCase();
  if (format !== "json" && format !== "csv") {
    return res.status(400).json({ error: "Unsupported format. Use 'json' or 'csv'." });
  }

  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const [
      userResult,
      businessResult,
      txResult,
      adjustmentsResult,
      accountsResult,
      categoriesResult,
      auditLogResult
    ] = await Promise.all([
      pool.query(
        "SELECT id, email, full_name, display_name, created_at FROM users WHERE id = $1",
        [req.user.id]
      ),
      pool.query(
        "SELECT id, name, region, language, created_at FROM businesses WHERE id = $1",
        [businessId]
      ),
      // Standard (non-adjustment) transactions
      pool.query(
        `SELECT t.id        AS transaction_id,
                a.name      AS account,
                c.name      AS category,
                t.amount,
                t.type,
                t.description,
                t.description_encrypted,
                t.date,
                t.note,
                t.cleared,
                t.created_at
           FROM transactions t
           LEFT JOIN accounts   a ON a.id = t.account_id
           LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.business_id = $1
            AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
          ORDER BY t.date DESC`,
        [businessId]
      ),
      // Adjustment / audit-pivot entries
      pool.query(
        `SELECT t.id                        AS adjustment_id,
                t.original_transaction_id,
                a.name                      AS account,
                c.name                      AS category,
                t.amount,
                t.type,
                t.description,
                t.date,
                t.note,
                t.adjusted_at,
                t.created_at
           FROM transactions t
           LEFT JOIN accounts   a ON a.id = t.account_id
           LEFT JOIN categories c ON c.id = t.category_id
          WHERE t.business_id = $1
            AND t.is_adjustment = true
          ORDER BY t.adjusted_at DESC`,
        [businessId]
      ),
      pool.query(
        "SELECT id, name, type, created_at FROM accounts WHERE business_id = $1",
        [businessId]
      ),
      pool.query(
        "SELECT id, name, kind, created_at FROM categories WHERE business_id = $1",
        [businessId]
      ),
      // User's own governance audit log
      pool.query(
        `SELECT action, format, created_at
           FROM user_action_audit_log
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [req.user.id]
      )
    ]);

    // Log this export request (fire-and-forget; do not fail on log error)
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get("user-agent") || null;
    await logUserAction({
      userId: req.user.id,
      action: "data_export",
      format,
      ipAddress,
      userAgent,
      metadata: { businessId }
    });

    if (format === "csv") {
      // CSV export: primary transactions sheet only (the most common use case).
      // Flat structure for spreadsheet interoperability.
      const rows = txResult.rows.map((t) => {
        let description = t.description || "";
        if (t.description_encrypted) {
          try { description = decrypt(t.description_encrypted); } catch (err) { logError("Privacy CSV export: failed to decrypt description", { err: err.message, transactionId: t.transaction_id }); }
        }
        return {
          transaction_id:  t.transaction_id,
          date:            t.date,
          type:            t.type,
          amount:          t.amount,
          account:         t.account || "",
          category:        t.category || "",
          description,
          note:            t.note || "",
          cleared:         t.cleared ? "true" : "false",
          created_at:      t.created_at
        };
      });
      const csv = toCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="inex-ledger-transactions.csv"');
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      return res.send(csv);
    }

    // JSON export: full structured package
    const exportData = {
      exportedAt: new Date().toISOString(),
      schemaVersion: "phase5-v1",
      user: userResult.rows[0],
      business: businessResult.rows[0],
      accounts: accountsResult.rows,
      categories: categoriesResult.rows,
      transactions: txResult.rows.map((t) => {
        const { description_encrypted, ...rest } = t;
        if (description_encrypted) {
          try { rest.description = decrypt(description_encrypted); } catch (err) { logError("Privacy JSON export: failed to decrypt description", { err: err.message, transactionId: rest.transaction_id }); }
        }
        return rest;
      }),
      adjustmentHistory: adjustmentsResult.rows,
      auditLog: auditLogResult.rows
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inex-ledger-export.json"');
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    return res.json(exportData);
  } catch (err) {
    logError("POST /privacy/export error", { err: err.message });
    return res.status(500).json({ error: "Export failed." });
  }
});

/**
 * POST /api/privacy/erase
 * Right to Be Forgotten: scrub all Personally Identifiable Information (name,
 * email, password) while preserving anonymised financial records (transaction
 * IDs, amounts, dates, categories) required for tax audits.
 *
 * Audit trail: the erasure request is logged in user_action_audit_log before
 * any data is modified so that compliance teams have a permanent record.
 */
router.post("/erase", requireMfa, async (req, res) => {
  const userId = req.user.id;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.get("user-agent") || null;

  // Resolve the business ID before starting the transaction so it does not
  // execute inside the transaction (avoids lock contention and keeps the
  // transaction focused on the write operations).
  let businessId;
  try {
    businessId = await resolveBusinessIdForUser(req.user);
  } catch (err) {
    logError("POST /privacy/erase: could not resolve business", { userId, err: err.message });
    return res.status(500).json({ error: "Erasure failed. Please try again or contact support." });
  }

  // Use a cryptographically random token for the erased email so the erasure
  // record cannot be correlated back to the original user ID.
  const erasedEmail = `erased-${crypto.randomUUID()}@erased.invalid`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Log the erasure request first (immutable audit record)
    await client.query(
      `INSERT INTO user_action_audit_log
         (id, user_id, action, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'erasure_request', $3, $4, $5)`,
      [
        crypto.randomUUID(),
        userId,
        ipAddress,
        userAgent ? String(userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
        JSON.stringify({ requestedAt: new Date().toISOString() })
      ]
    );

    // Scrub PII from the users table.
    // email must remain UNIQUE NOT NULL, so replace it with an un-guessable
    // sentinel that clearly signals erasure and cannot be used to log in.
    await client.query(
      `UPDATE users
          SET email         = $1,
              full_name     = NULL,
              display_name  = NULL,
              password_hash = 'ERASED',
              is_erased     = true,
              erased_at     = NOW()
        WHERE id = $2`,
      [erasedEmail, userId]
    );

    // Scrub PII-containing free-text fields from transactions while keeping
    // the financial record (id, amount, date, category, type) intact.
    await client.query(
      `UPDATE transactions
          SET description           = NULL,
              description_encrypted = NULL,
              note                  = NULL
        WHERE business_id = $1`,
      [businessId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      message: "Your personal information has been erased. Anonymised financial records are retained for tax compliance."
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("POST /privacy/erase error", { userId, err: err.message });
    return res.status(500).json({ error: "Erasure failed. Please try again or contact support." });
  } finally {
    client.release();
  }
});

/**
 * POST /api/privacy/delete
 * Deletes all business data (transactions, accounts, categories) but keeps the user account.
 * Deprecated in favour of /erase for GDPR/privacy-law compliance; retained for
 * backward-compatibility with existing clients.
 */
router.post("/delete", async (req, res) => {
  const userId = req.user.id;
  const ipAddress = req.ip || req.connection?.remoteAddress || null;
  const userAgent = req.get("user-agent") || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve business ID within the transaction boundary using the client
    // so that all reads and writes share the same transaction scope.
    const bizResult = await client.query(
      `SELECT b.id
         FROM users u
         JOIN businesses b ON b.id = u.active_business_id AND b.user_id = u.id
        WHERE u.id = $1
        LIMIT 1`,
      [userId]
    );
    if (!bizResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No active business found." });
    }
    const businessId = bizResult.rows[0].id;

    // Log the deletion to the audit trail before performing the deletion
    // so a compliance record always exists even if a subsequent step fails.
    await client.query(
      `INSERT INTO user_action_audit_log
         (id, user_id, action, ip_address, user_agent, metadata)
       VALUES ($1, $2, 'data_deletion', $3, $4, $5)`,
      [
        crypto.randomUUID(),
        userId,
        ipAddress,
        userAgent ? String(userAgent).slice(0, MAX_USER_AGENT_LENGTH) : null,
        JSON.stringify({ businessId, method: "delete_all", requestedAt: new Date().toISOString() })
      ]
    );

    await client.query("DELETE FROM transactions WHERE business_id = $1", [businessId]);
    await client.query("DELETE FROM accounts WHERE business_id = $1", [businessId]);
    await client.query("DELETE FROM categories WHERE business_id = $1", [businessId]);

    await client.query("COMMIT");

    res.json({ message: "Business data deleted successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("POST /privacy/delete error", { err: err.message });
    res.status(500).json({ error: "Delete failed." });
  } finally {
    client.release();
  }
});

/**
 * GET /api/privacy/audit-log
 * Returns the caller's own governance audit trail entries (exports, erasures).
 */
router.get("/audit-log", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, action, format, ip_address, metadata, created_at
         FROM user_action_audit_log
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    logError("GET /privacy/audit-log error", { err: err.message });
    return res.status(500).json({ error: "Could not load audit log." });
  }
});

module.exports = router;
