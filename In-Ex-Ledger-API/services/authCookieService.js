"use strict";

const {
  ACCESS_TOKEN_COOKIE,
  COOKIE_OPTIONS,
} = require("../utils/authUtils.js");
const { signToken, verifyToken } = require("../middleware/auth.middleware.js");
const { hashValue } = require("./signInSecurityService.js");

const REFRESH_TOKEN_COOKIE = "refresh_token";
const MFA_TRUST_COOKIE = "mfa_trust";
const GLOBAL_MFA_TRUST_COOKIE = "mfa_global_trust";
const REFRESH_TOKEN_EXPIRY_DAYS =
  Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
const REFRESH_TOKEN_EXPIRY_MS =
  REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const MFA_TRUST_EXPIRY_DAYS = Number(process.env.MFA_TRUST_EXPIRY_DAYS) || 14;
const MFA_TRUST_EXPIRY_MS = MFA_TRUST_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const GLOBAL_MFA_TRUST_EXPIRY_SECONDS =
  Number(process.env.GLOBAL_MFA_TRUST_EXPIRY_SECONDS) || 14 * 24 * 60 * 60;
const ACCESS_TOKEN_EXPIRY_SECONDS =
  Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS) || 60 * 60;

function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, COOKIE_OPTIONS);
}

function setAccessCookie(res, token) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: ACCESS_TOKEN_EXPIRY_SECONDS * 1000,
  });
}

function clearAccessCookie(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, COOKIE_OPTIONS);
}

function setMfaTrustCookie(res, token, expiresAt) {
  res.cookie(MFA_TRUST_COOKIE, token, {
    ...COOKIE_OPTIONS,
    expires: expiresAt,
  });
}

function clearMfaTrustCookie(res) {
  res.clearCookie(MFA_TRUST_COOKIE, COOKIE_OPTIONS);
}

function getUserAgentHash(req) {
  return hashValue(String(req.get("user-agent") || "").trim().slice(0, 512));
}

function setGlobalMfaTrustCookie(res, req) {
  const token = signToken(
    {
      purpose: "global_mfa_trust",
      user_agent_hash: getUserAgentHash(req),
    },
    GLOBAL_MFA_TRUST_EXPIRY_SECONDS,
  );

  res.cookie(GLOBAL_MFA_TRUST_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: GLOBAL_MFA_TRUST_EXPIRY_SECONDS * 1000,
  });
}

function clearGlobalMfaTrustCookie(res) {
  res.clearCookie(GLOBAL_MFA_TRUST_COOKIE, COOKIE_OPTIONS);
}

function hasValidGlobalMfaTrustCookie(req) {
  const token = String(req.cookies?.[GLOBAL_MFA_TRUST_COOKIE] || "").trim();
  if (!token) {
    return false;
  }

  try {
    const payload = verifyToken(token);
    return (
      payload?.purpose === "global_mfa_trust" &&
      payload?.user_agent_hash === getUserAgentHash(req)
    );
  } catch (_) {
    return false;
  }
}

module.exports = {
  ACCESS_TOKEN_EXPIRY_SECONDS,
  GLOBAL_MFA_TRUST_COOKIE,
  MFA_TRUST_COOKIE,
  MFA_TRUST_EXPIRY_MS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_EXPIRY_MS,
  clearAccessCookie,
  clearGlobalMfaTrustCookie,
  clearMfaTrustCookie,
  clearRefreshCookie,
  hasValidGlobalMfaTrustCookie,
  setAccessCookie,
  setGlobalMfaTrustCookie,
  setMfaTrustCookie,
  setRefreshCookie,
};
