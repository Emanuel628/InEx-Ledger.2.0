// Mounted at /check-email-verified
// Returns { verified: true/false } for a signed verification-state token.
const express = require("express");
const router = express.Router();
const { pool } = require("../db.js");
const { verifyToken } = require("../middleware/auth.middleware.js");

function normalizeEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : "";
}

router.get("/", async (req, res) => {
  const state = String(req.query.state || "").trim();
  if (!state) {
    return res.status(400).json({ error: "Verification state is required" });
  }

  let email = "";
  try {
    const payload = verifyToken(state);
    if (payload?.purpose !== "verify_email_status") {
      return res.status(401).json({ error: "Invalid verification state" });
    }
    email = normalizeEmail(payload.email);
    if (!email) {
      return res.status(401).json({ error: "Invalid verification state" });
    }
  } catch (_) {
    return res.status(401).json({ error: "Invalid verification state" });
  }

  try {
    const result = await pool.query(
      "SELECT email_verified FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    return res.json({ verified: !!result.rows[0]?.email_verified });
  } catch (_) {
    return res.status(500).json({ error: "Failed to check verification status" });
  }
});

module.exports = router;
