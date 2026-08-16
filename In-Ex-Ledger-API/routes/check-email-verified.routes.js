// Mounted at /check-email-verified
// Returns { verified: true/false } for a signed verification-state token.
const express = require("express");
const router = express.Router();
const { pool } = require("../db.js");
const { verifyToken } = require("../middleware/auth.middleware.js");
const { normalizeEmail } = require("../utils/emailNormalization.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");

router.get("/", asyncRoute(async (req, res) => {
  const state = String(req.query.state || "").trim();
  if (!state) {
    throw new ApiError(400, "Verification state is required");
  }

  let payload;
  try {
    payload = verifyToken(state);
  } catch (_) {
    throw new ApiError(401, "Invalid verification state");
  }

  if (payload?.purpose !== "verify_email_status") {
    throw new ApiError(401, "Invalid verification state");
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new ApiError(401, "Invalid verification state");
  }

  const result = await pool.query(
    "SELECT email_verified FROM users WHERE email = $1 LIMIT 1",
    [email]
  );
  res.json({ verified: !!result.rows[0]?.email_verified });
}));

module.exports = router;
