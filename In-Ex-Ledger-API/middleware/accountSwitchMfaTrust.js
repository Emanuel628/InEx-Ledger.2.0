const crypto = require('crypto');
const { pool } = require('../db.js');
const { signToken, verifyToken } = require('./auth.middleware.js');
const { COOKIE_OPTIONS } = require('../utils/authUtils.js');
const { resolveBusinessIdForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { getSubscriptionSnapshotForUser } = require('../services/subscriptionService.js');

const REFRESH_TOKEN_COOKIE = 'refresh_token';
const MFA_TRUST_COOKIE = 'mfa_trust';
const GLOBAL_MFA_TRUST_COOKIE = 'mfa_global_trust';
const REFRESH_TOKEN_BYTE_LENGTH = 48;
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const REFRESH_TOKEN_EXPIRY_MS = REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_SECONDS = Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 15 * 60;
const GLOBAL_MFA_TRUST_EXPIRY_SECONDS = Number(process.env.GLOBAL_MFA_TRUST_EXPIRY_SECONDS) || 14 * 24 * 60 * 60;

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getUserAgentHash(req) {
  return hashValue(String(req.get('user-agent') || '').trim().slice(0, 512));
}

function setGlobalMfaTrustCookie(res, req) {
  const token = signToken({
    purpose: 'global_mfa_trust',
    user_agent_hash: getUserAgentHash(req)
  }, GLOBAL_MFA_TRUST_EXPIRY_SECONDS);

  res.cookie(GLOBAL_MFA_TRUST_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: GLOBAL_MFA_TRUST_EXPIRY_SECONDS * 1000
  });
}

function hasValidGlobalMfaTrustCookie(req) {
  const token = String(req.cookies?.[GLOBAL_MFA_TRUST_COOKIE] || '').trim();
  if (!token) {
    return false;
  }

  try {
    const payload = verifyToken(token);
    return payload?.purpose === 'global_mfa_trust'
      && payload?.user_agent_hash === getUserAgentHash(req);
  } catch (_) {
    return false;
  }
}

async function createRefreshToken(userId, { mfaAuthenticated = false } = {}) {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTE_LENGTH).toString('hex');
  const hashed = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, mfa_authenticated)
     VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), userId, hashed, expiresAt, !!mfaAuthenticated]
  );
  return { token, expiresAt };
}

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt
  });
}

async function findUserById(userId) {
  const result = await pool.query(
    `SELECT id, email, email_verified, mfa_enabled, role, is_erased
       FROM users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function issueSessionFromTrustedBrowser(req, res, mfaToken) {
  const pending = verifyToken(String(mfaToken || '').trim());
  if (pending?.purpose !== 'mfa_pending' || !pending?.id) {
    return null;
  }

  const user = await findUserById(pending.id);
  if (!user || user.is_erased || !user.email_verified) {
    return null;
  }

  const businessId = pending.business_id || await resolveBusinessIdForUser(user);
  const subscription = await getSubscriptionSnapshotForUser({
    id: user.id,
    business_id: businessId
  });
  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role || 'user',
    email_verified: true,
    business_id: businessId,
    mfa_enabled: !!user.mfa_enabled,
    mfa_authenticated: true
  }, ACCESS_TOKEN_EXPIRY_SECONDS);

  const refresh = await createRefreshToken(user.id, { mfaAuthenticated: true });
  setRefreshCookie(res, refresh.token, refresh.expiresAt);
  setGlobalMfaTrustCookie(res, req);

  return {
    token,
    email_verified: true,
    subscription,
    mfa_enabled: !!user.mfa_enabled,
    mfa_trusted_browser: true
  };
}

function allowTrustedBrowserAccountSwitch(req, res, next) {
  if (String(req.method || '').toUpperCase() !== 'POST') {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = function patchedLoginJson(payload) {
    if (!payload?.mfa_required || !payload?.mfa_token || !hasValidGlobalMfaTrustCookie(req)) {
      return originalJson(payload);
    }

    return issueSessionFromTrustedBrowser(req, res, payload.mfa_token)
      .then((trustedPayload) => originalJson(trustedPayload || payload))
      .catch(() => originalJson(payload));
  };

  return next();
}

function rememberTrustedBrowserOnLogout(req, res, next) {
  const authHeader = String(req.get('authorization') || '').trim();
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length).trim()
    : '';

  if (token) {
    try {
      const payload = verifyToken(token);
      if (payload?.mfa_authenticated) {
        setGlobalMfaTrustCookie(res, req);
      }
    } catch (_) {}
  }

  res.clearCookie(MFA_TRUST_COOKIE, COOKIE_OPTIONS);
  return next();
}

module.exports = {
  allowTrustedBrowserAccountSwitch,
  rememberTrustedBrowserOnLogout
};
