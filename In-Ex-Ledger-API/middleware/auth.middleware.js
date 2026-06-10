const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_COOKIE } = require("../utils/authUtils.js");
const { logWarn } = require("../utils/logger.js");

const JWT_SECRET = process.env.JWT_SECRET;
const DEFAULT_JWT_EXPIRY_SECONDS = Number(process.env.JWT_EXPIRY_SECONDS) || 15 * 60;

if (!JWT_SECRET) {
  throw new Error(
    "Missing required environment variable: JWT_SECRET (set this before running the server)"
  );
}

function signToken(payload, expiresInSeconds = DEFAULT_JWT_EXPIRY_SECONDS) {
  const options = { algorithm: "HS256" };
  if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
    options.expiresIn = expiresInSeconds;
  }
  return jwt.sign(payload ?? {}, JWT_SECRET, options);
}

function verifyToken(token) {
  return jwt.verify(String(token || "").trim(), JWT_SECRET, {
    algorithms: ["HS256"]
  });
}

function getRequestToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return String(req.cookies?.[ACCESS_TOKEN_COOKIE] || "").trim();
}

function requireAuth(req, res, next) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = verifyToken(token);
  } catch (err) {
    logWarn(`Auth rejected [${req.method} ${req.path}]: ${err.message}`);
    return res.status(401).json({ error: "Authentication required" });
  }

  next();
}

function optionalAuth(req, res, next) {
  const token = getRequestToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (err) {
      logWarn(`optionalAuth rejected invalid token: ${err.message}`);
    }
  }

  next();
}

function requireMfa(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!req.user.mfa_enabled) {
    return res.status(403).json({
      error: "MFA setup required for this action.",
      mfa_required: true,
      requirement: "setup",
      setup_url: "/settings#settings-security"
    });
  }

  if (!req.user.mfa_authenticated) {
    return res.status(403).json({
      error: "MFA verification required for this action.",
      mfa_required: true,
      requirement: "verification",
      reauthenticate: true
    });
  }

  next();
}

function requireMfaIfEnabled(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.mfa_enabled && !req.user.mfa_authenticated) {
    return res.status(403).json({
      error: "MFA verification required for this action.",
      mfa_required: true,
      requirement: "verification",
      reauthenticate: true
    });
  }

  next();
}

module.exports = {
  signToken,
  verifyToken,
  requireAuth,
  optionalAuth,
  requireMfa,
  requireMfaIfEnabled
};
