const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter());

const MAX_USER_AGENT_LENGTH = 512;

/**
 * GET /api/privacy/settings
 */
router.get("/settings", async (req, res) => {
  try {
    const [privacyResult, userResult] = await Promise.all([
      pool.query(
        "SELECT data_sharing_opt_out, consent_given FROM user_privacy_settings WHERE user_id = $1",
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
      dataResidency
    });
  } catch (err) {
    console.error("GET /privacy/settings error:", err.message);
    res.status(500).json({ error: "Failed to load privacy settings." });
  }
});

/**
 * POST /api/privacy/settings
 */
router.post("/settings", async (req, res) => {
  const dataSharingOptOut = typeof req.body?.dataSharingOptOut === "boolean" ? req.body.dataSharingOptOut : false;
  const consentGiven = typeof req.body?.consentGiven === "boolean" ? req.body.consentGiven : true;

  try {
    // Fetch the user's data_residency to determine if consent logging is required
    const userResult = await pool.query(
      "SELECT data_residency FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    const dataResidency = userResult.rows[0]?.data_residency || "US";

    await pool.query(
      `INSERT INTO user_privacy_settings (user_id, data_sharing_opt_out, consent_given, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
         SET data_sharing_opt_out = EXCLUDED.data_sharing_opt_out,
             consent_given = EXCLUDED.consent_given,
             updated_at = NOW()`,
      [req.user.id, dataSharingOptOut, consentGiven]
    );

    // Log explicit consent changes for Quebec users (Law 25 requirement)
    if (dataResidency === "CA-QC") {
      const action = dataSharingOptOut ? "opt_out" : "opt_in";
      const ipAddress = req.ip || req.connection?.remoteAddress || null;
      const userAgent = String(req.get("user-agent") || "").slice(0, MAX_USER_AGENT_LENGTH) || null;
      await pool.query(
        `INSERT INTO privacy_consent_log (user_id, data_residency, action, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, dataResidency, action, ipAddress, userAgent]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /privacy/settings error:", err.message);
    res.status(500).json({ error: "Failed to save privacy settings." });
  }
});

/**
 * POST /api/privacy/export
 * Returns a JSON package of the user's data.
 */
router.post("/export", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    const [userResult, businessResult, txResult, accountsResult, categoriesResult] =
      await Promise.all([
        pool.query("SELECT id, email, created_at FROM users WHERE id = $1", [req.user.id]),
        pool.query("SELECT id, name, region, language, created_at FROM businesses WHERE id = $1", [businessId]),
        pool.query(
          `SELECT id, account_id, category_id, amount, type, description, date, note,
                  cleared, recurring_transaction_id, recurring_occurrence_date, created_at
           FROM transactions WHERE business_id = $1 ORDER BY date DESC`,
          [businessId]
        ),
        pool.query("SELECT id, name, type, created_at FROM accounts WHERE business_id = $1", [businessId]),
        pool.query("SELECT id, name, kind, created_at FROM categories WHERE business_id = $1", [businessId])
      ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: userResult.rows[0],
      business: businessResult.rows[0],
      accounts: accountsResult.rows,
      categories: categoriesResult.rows,
      transactions: txResult.rows
    };

    res.setHeader("Content-Disposition", 'attachment; filename="inex-ledger-export.json"');
    res.json(exportData);
  } catch (err) {
    console.error("POST /privacy/export error:", err.message);
    res.status(500).json({ error: "Export failed." });
  }
});

/**
 * POST /api/privacy/delete
 * Deletes all business data (transactions, accounts, categories) but keeps the user account.
 */
router.post("/delete", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    await pool.query("DELETE FROM transactions WHERE business_id = $1", [businessId]);
    await pool.query("DELETE FROM accounts WHERE business_id = $1", [businessId]);
    await pool.query("DELETE FROM categories WHERE business_id = $1", [businessId]);

    res.json({ message: "Business data deleted successfully." });
  } catch (err) {
    console.error("POST /privacy/delete error:", err.message);
    res.status(500).json({ error: "Delete failed." });
  }
});

module.exports = router;
