const { createRouteLimiter } = require("./rate-limit.middleware.js");

function createGlobalLimiter() {
  return createRouteLimiter({
    windowMs: 60 * 1000,
    max: 300,
    keyPrefix: "rl:global",
    skip: (req) => req.path === "/billing/webhook"
  });
}

function createAuthLimiter() {
  return createRouteLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyPrefix: "rl:auth",
    keyStrategy: "ip",
    message: "Too many requests, please try again later."
  });
}

function createPasswordLimiter() {
  return createRouteLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes (was 1 hour — 5 attempts/hour was too permissive)
    max: 5,
    keyPrefix: "rl:auth:password",
    keyStrategy: "ip",
    message: "Too many password reset attempts, please try again later."
  });
}

function createMfaVerifyLimiter() {
  return createRouteLimiter({
    windowMs: 10 * 60 * 1000,
    max: 12,
    keyPrefix: "rl:auth:mfa",
    keyStrategy: "ip",
    message: "Too many MFA attempts, please try again shortly."
  });
}

function createExportGrantLimiter() {
  return createRouteLimiter({
    windowMs: 60 * 1000,
    max: 20,
    keyPrefix: "rl:export",
    message: "Too many export requests. Please try again later."
  });
}

function createSecureExportLimiter() {
  return createRouteLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyPrefix: "rl:export:secure",
    message: "Too many export requests. Please try again later."
  });
}

function createReceiptLimiter() {
  return createRouteLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyPrefix: "rl:receipt"
  });
}

function createTransactionLimiter() {
  return createRouteLimiter({
    windowMs: 60 * 1000,
    max: 120,
    keyPrefix: "rl:txn"
  });
}

function createBillingMutationLimiter() {
  return createRouteLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyPrefix: "rl:billing",
    message: "Too many billing requests, please try again later."
  });
}

function createBusinessDeleteLimiter() {
  return createRouteLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyPrefix: "rl:business-delete",
    message: "Too many deletion attempts, please try again later."
  });
}

module.exports = {
  createAuthLimiter,
  createBillingMutationLimiter,
  createBusinessDeleteLimiter,
  createExportGrantLimiter,
  createGlobalLimiter,
  createMfaVerifyLimiter,
  createPasswordLimiter,
  createReceiptLimiter,
  createSecureExportLimiter,
  createTransactionLimiter
};
