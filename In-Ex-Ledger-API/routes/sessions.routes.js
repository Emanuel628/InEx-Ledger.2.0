const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

const sessionsMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * GET /api/sessions
 * Lists all active (non-revoked, non-expired) sessions for the current user.
 */
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, created_at, expires_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    logError("GET /sessions error:", err.message);
    res.status(500).json({ error: "Failed to load sessions." });
  }
});

/**
 * DELETE /api/sessions/:id
 * Revokes a specific session by its record ID.
 */
router.delete("/:id", sessionsMutationLimiter, async (req, res) => {
  try {
    const sessionId = String(req.params.id || "").trim();
    if (!UUID_RE.test(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }
    const result = await pool.query(
      "UPDATE refresh_tokens SET revoked = true WHERE id = $1 AND user_id = $2 RETURNING id",
      [sessionId, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Session not found." });
    }
    res.json({ message: "Session revoked." });
  } catch (err) {
    logError("DELETE /sessions/:id error:", err.message);
    res.status(500).json({ error: "Failed to revoke session." });
  }
});

/**
 * DELETE /api/sessions
 * Revokes ALL sessions for the current user (sign out everywhere).
 */
router.delete("/", sessionsMutationLimiter, async (req, res) => {
  try {
    await pool.query(
      "UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false",
      [req.user.id]
    );
    res.json({ message: "All sessions revoked." });
  } catch (err) {
    logError("DELETE /sessions error:", err.message);
    res.status(500).json({ error: "Failed to revoke sessions." });
  }
});

module.exports = router;
