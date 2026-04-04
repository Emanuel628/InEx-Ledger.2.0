const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { getSubscriptionSnapshotForBusiness } = require("../services/subscriptionService.js");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const businessId = req.user.business_id || (await resolveBusinessIdForUser(req.user));
    const result = await pool.query(
      `SELECT id, email, role, email_verified, full_name, display_name, created_at
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    res.status(200).json({
      ...result.rows[0],
      business_id: businessId,
      subscription
    });
  } catch (err) {
    console.error("GET /me error:", err.message);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

/**
 * PUT /api/me
 * Update user profile (full_name, display_name).
 */
router.put("/", requireAuth, async (req, res) => {
  const { full_name, display_name } = req.body ?? {};
  try {
    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           display_name = COALESCE($2, display_name)
       WHERE id = $3
       RETURNING id, email, full_name, display_name, created_at`,
      [full_name?.trim() || null, display_name?.trim() || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("PUT /me error:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

router.delete("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1", [
      req.user.id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ message: "Account and data deleted" });
  } catch (err) {
    console.error("DELETE /me error:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
