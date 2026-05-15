const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { decorateSessionRow } = require("../services/sessionContextService.js");
const {
  AUDIT_ACTIONS,
  recordAuditEventForRequest
} = require("../services/auditEventService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

const REFRESH_TOKEN_COOKIE = "refresh_token";

const sessionsMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getCurrentTokenHash(req) {
  const raw = req?.cookies?.[REFRESH_TOKEN_COOKIE];
  if (!raw) return null;
  return hashToken(raw);
}

/**
 * GET /api/sessions
 * Lists all active (non-revoked, non-expired) sessions for the current user.
 * Each row includes device label, IP, user agent, last active time, and an
 * is_current flag for the session matching the caller's refresh cookie.
 */
router.get("/", async (req, res) => {
  try {
    const currentTokenHash = getCurrentTokenHash(req);
    const result = await pool.query(
      `SELECT id, token_hash, created_at, expires_at, last_used_at,
              ip_address, user_agent, device_label, mfa_authenticated
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked = false AND expires_at > NOW()
       ORDER BY COALESCE(last_used_at, created_at) DESC`,
      [req.user.id]
    );
    const sessions = result.rows.map((row) => decorateSessionRow(row, { currentTokenHash }));
    res.json({ sessions, count: sessions.length });
  } catch (err) {
    logError("GET /sessions error:", err.message);
    res.status(500).json({ error: "Failed to load sessions." });
  }
});

/**
 * DELETE /api/sessions/:id
 * Revokes a specific session by its record ID. Records an audit event.
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
    await recordAuditEventForRequest(pool, req, {
      userId: req.user.id,
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      metadata: { session_id: sessionId, scope: "single" }
    });
    res.json({ message: "Session revoked." });
  } catch (err) {
    logError("DELETE /sessions/:id error:", err.message);
    res.status(500).json({ error: "Failed to revoke session." });
  }
});

/**
 * DELETE /api/sessions
 * Revokes ALL sessions for the current user (sign out everywhere).
 * Records an audit event with the count of revoked sessions.
 */
router.delete("/", sessionsMutationLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false RETURNING id",
      [req.user.id]
    );
    await recordAuditEventForRequest(pool, req, {
      userId: req.user.id,
      action: AUDIT_ACTIONS.SESSION_REVOKED,
      metadata: { scope: "all", revoked_count: result.rowCount }
    });
    res.json({ message: "All sessions revoked.", revoked_count: result.rowCount });
  } catch (err) {
    logError("DELETE /sessions error:", err.message);
    res.status(500).json({ error: "Failed to revoke sessions." });
  }
});

module.exports = router;
