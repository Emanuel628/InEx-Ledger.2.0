const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);

/**
 * GET /api/privacy/settings
 */
router.get("/settings", async (req, res) => {
  res.json({ dataSharingOptOut: false, consentGiven: true });
});

/**
 * POST /api/privacy/settings
 */
router.post("/settings", async (req, res) => {
  // Future: persist privacy preferences to DB
  res.json({ ok: true });
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
        pool.query("SELECT * FROM transactions WHERE business_id = $1 ORDER BY date DESC", [businessId]),
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
