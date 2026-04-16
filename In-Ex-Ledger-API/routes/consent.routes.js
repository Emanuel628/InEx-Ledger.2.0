const crypto = require("crypto");
const express = require("express");
const { pool } = require("../db.js");
const { createRouteLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();

const MAX_USER_AGENT_LENGTH = 512;
const VALID_DECISIONS = new Set(["accepted", "declined"]);

// Lenient public rate limit: 20 requests / IP per 10 minutes
const consentLimiter = createRouteLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: "rl:consent",
  keyStrategy: "ip"
});

/**
 * POST /api/consent/cookie
 * Persists a cookie-banner decision to the DB for compliance evidence.
 * Public endpoint — no auth required.
 * Body: { decision: "accepted"|"declined", version: string }
 */
router.post("/cookie", consentLimiter, async (req, res) => {
  const { decision, version } = req.body || {};

  if (!VALID_DECISIONS.has(decision)) {
    return res.status(400).json({ error: "Invalid decision value." });
  }

  const consentVersion = String(version || "1").slice(0, 10);
  const ipAddress = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").slice(0, 64);
  const userAgent = String(req.headers["user-agent"] || "").slice(0, MAX_USER_AGENT_LENGTH);

  // Optional: attach to authenticated user if token is present
  let userId = null;
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token && typeof require("../services/tokenService.js")?.verifyAccessToken === "function") {
      const payload = require("../services/tokenService.js").verifyAccessToken(token);
      userId = payload?.userId || payload?.sub || null;
    }
  } catch (_) {
    // Token optional — ignore errors
  }

  try {
    await pool.query(
      `INSERT INTO cookie_consent_log (id, user_id, decision, version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), userId, decision, consentVersion, ipAddress || null, userAgent || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    logError("cookie_consent_insert_failed", err);
    return res.status(500).json({ error: "Failed to record consent." });
  }
});

module.exports = router;
