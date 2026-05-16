const crypto = require("crypto");
const express = require("express");
const { pool } = require("../db.js");
const { createRouteLimiter } = require("../middleware/rate-limit.middleware.js");
const { verifyToken } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { logError } = require("../utils/logger.js");

const router = express.Router();

const MAX_USER_AGENT_LENGTH = 512;
const VALID_DECISIONS = new Set(["accepted", "declined"]);
const CONSENT_COOKIE_NAME = "lb_cookie_consent";
const CONSENT_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const consentLimiter = createRouteLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: "rl:consent",
  keyStrategy: "ip"
});

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function buildConsentRecord(decision, version, at = new Date().toISOString()) {
  return {
    decision,
    version: String(version || "1").slice(0, 10),
    at
  };
}

function setConsentCookie(res, record) {
  res.cookie(CONSENT_COOKIE_NAME, JSON.stringify(record), {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: CONSENT_COOKIE_MAX_AGE_MS,
    path: "/"
  });
}

function parseConsentCookie(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!VALID_DECISIONS.has(parsed?.decision)) {
      return null;
    }
    return buildConsentRecord(parsed.decision, parsed.version, parsed.at);
  } catch (_) {
    return null;
  }
}

async function resolveAuthenticatedUserId(req) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) {
      const payload = verifyToken(token);
      return payload?.id || payload?.userId || payload?.sub || null;
    }
  } catch (_) {
    // Consent is public; invalid auth is ignored.
  }

  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) {
    return null;
  }

  try {
    const refreshLookup = await pool.query(
      `SELECT rt.user_id
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked = false
          AND rt.expires_at > NOW()
          AND u.is_erased = false
        LIMIT 1`,
      [hashRefreshToken(refreshToken)]
    );
    return refreshLookup.rows[0]?.user_id || null;
  } catch (_) {
    return null;
  }
}

router.get("/cookie", consentLimiter, async (req, res) => {
  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (userId) {
      const result = await pool.query(
        `SELECT decision, version, created_at
           FROM cookie_consent_log
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [userId]
      );
      if (result.rows[0]) {
        const record = buildConsentRecord(
          result.rows[0].decision,
          result.rows[0].version,
          result.rows[0].created_at
        );
        setConsentCookie(res, record);
        return res.json({ record });
      }
    }

    const cookieRecord = parseConsentCookie(req.cookies?.[CONSENT_COOKIE_NAME]);
    return res.json({ record: cookieRecord });
  } catch (err) {
    logError("cookie_consent_lookup_failed", err);
    return res.status(500).json({ error: "Failed to load consent." });
  }
});

router.post("/cookie", consentLimiter, requireCsrfProtection, async (req, res) => {
  const { decision, version } = req.body || {};

  if (!VALID_DECISIONS.has(decision)) {
    return res.status(400).json({ error: "Invalid decision value." });
  }

  const record = buildConsentRecord(decision, version);
  const ipAddress = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").slice(0, 64);
  const userAgent = String(req.headers["user-agent"] || "").slice(0, MAX_USER_AGENT_LENGTH);
  const userId = await resolveAuthenticatedUserId(req);

  try {
    await pool.query(
      `INSERT INTO cookie_consent_log (id, user_id, decision, version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), userId, record.decision, record.version, ipAddress || null, userAgent || null]
    );
    setConsentCookie(res, record);
    return res.json({ ok: true, record });
  } catch (err) {
    logError("cookie_consent_insert_failed", err);
    return res.status(500).json({ error: "Failed to record consent." });
  }
});

module.exports = router;
