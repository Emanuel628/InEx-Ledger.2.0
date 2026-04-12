const crypto = require("crypto");
const path = require("path");

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/"
};

function getCsrfSecret() {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing CSRF signing secret. Set CSRF_SECRET or JWT_SECRET.");
  }
  return secret;
}

function signNonce(nonce) {
  return crypto
    .createHmac("sha256", getCsrfSecret())
    .update(String(nonce || ""))
    .digest("base64url");
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function generateCsrfToken() {
  const nonce = crypto.randomBytes(32).toString("base64url");
  return `${nonce}.${signNonce(nonce)}`;
}

function isValidCsrfToken(token) {
  if (typeof token !== "string") {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }

  const [nonce, signature] = parts;
  return timingSafeEqualString(signature, signNonce(nonce));
}

function shouldAttachCsrfCookie(req) {
  if (req.path === "/api/billing/webhook") {
    return false;
  }

  if (req.path.startsWith("/api/")) {
    return true;
  }

  if (req.method !== "GET") {
    return false;
  }

  const extension = path.extname(req.path || "");
  return !extension || extension === ".html";
}

function ensureCsrfCookie(req, res, next) {
  if (!shouldAttachCsrfCookie(req)) {
    return next();
  }

  const existingToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (isValidCsrfToken(existingToken)) {
    return next();
  }

  res.cookie(CSRF_COOKIE_NAME, generateCsrfToken(), CSRF_COOKIE_OPTIONS);
  return next();
}

function requireCsrfProtection(req, res, next) {
  if (SAFE_METHODS.has(String(req.method || "").toUpperCase())) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME) || req.get("x-xsrf-token");

  if (
    !isValidCsrfToken(cookieToken) ||
    !isValidCsrfToken(headerToken) ||
    !timingSafeEqualString(cookieToken, headerToken)
  ) {
    return res.status(403).json({ error: "CSRF token missing or invalid." });
  }

  return next();
}

module.exports = {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCsrfToken,
  isValidCsrfToken,
  ensureCsrfCookie,
  requireCsrfProtection
};
