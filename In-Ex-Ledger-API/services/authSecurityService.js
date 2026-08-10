"use strict";

// Pure/near-pure security helpers used by routes/auth.routes.js: password
// hashing and strength checks, login-lockout timing, email masking for logs
// and MFA status display, token hashing, and small response-shaping
// utilities. No database access, cookies, or request/response objects --
// kept side-effect-free (aside from bcrypt/crypto calls) so they're directly
// testable without a database or mocked pool.

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { normalizeEmail } = require("../utils/emailNormalization.js");

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

function isStrongPassword(password) {
  const value = String(password || "");
  return (
    value.length >= 8 &&
    /\d/.test(value) &&
    /[A-Z]/.test(value) &&
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(value)
  );
}

function isTransientLoginInfrastructureError(err) {
  const code = String(err?.code || "").trim().toUpperCase();
  return (
    code.startsWith("08")
    || code === "53"
    || code === "57P01"
    || code === "57P03"
    || code === "ETIMEDOUT"
    || code === "ECONNRESET"
    || code === "ECONNREFUSED"
  );
}

function buildPublicSessionPayload(session) {
  if (!session || typeof session !== "object") {
    return {};
  }
  const { token, ...publicPayload } = session;
  return publicPayload;
}

function ensureArrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function hashMfaEmailCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function generateMfaEmailCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function maskEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return "";
  }
  const [local, domain] = normalized.split("@");
  const localPrefix = local.length <= 2 ? local[0] || "*" : `${local.slice(0, 2)}${"*".repeat(Math.max(local.length - 2, 2))}`;
  const domainParts = domain.split(".");
  const domainName = domainParts.shift() || "";
  const maskedDomain = domainName.length <= 2
    ? `${domainName[0] || "*"}*`
    : `${domainName.slice(0, 2)}${"*".repeat(Math.max(domainName.length - 2, 2))}`;
  return `${localPrefix}@${[maskedDomain, ...domainParts].join(".")}`;
}

function buildMfaStatusPayload(user) {
  return {
    enabled: !!user?.mfa_enabled,
    enabled_at: user?.mfa_enabled_at || null,
    delivery: "email",
    recovery_email_masked: maskEmail(user?.recovery_email),
    recovery_email_verified: !!user?.recovery_email_verified
  };
}

function getLoginLockExpiry(user) {
  const value = user?.login_locked_until ? new Date(user.login_locked_until) : null;
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }
  return value;
}

function isLoginLocked(user) {
  const lockedUntil = getLoginLockExpiry(user);
  return !!lockedUntil && lockedUntil.getTime() > Date.now();
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashMfaTrustToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  hashPassword,
  isStrongPassword,
  isTransientLoginInfrastructureError,
  buildPublicSessionPayload,
  ensureArrayValue,
  hashMfaEmailCode,
  generateMfaEmailCode,
  maskEmail,
  buildMfaStatusPayload,
  getLoginLockExpiry,
  isLoginLocked,
  hashRefreshToken,
  hashMfaTrustToken
};
