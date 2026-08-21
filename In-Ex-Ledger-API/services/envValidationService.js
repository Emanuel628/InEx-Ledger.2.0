"use strict";

const { STRIPE_PRICE_ENTRIES } = require("./stripePriceConfig.js");

function isProductionEnvironment(nodeEnv = process.env.NODE_ENV) {
  return String(nodeEnv || "").trim().toLowerCase() === "production";
}

// Two tiers:
//   "core"       -- required in every environment; nothing meaningful works
//                   without these.
//   "production" -- required only in production, but unconditionally so
//                   (the feature is core and unconditionally mounted, not
//                   behind a flag). Each entry's reason names the specific
//                   failure mode on `main` today if it's missing.
//
// This registry is also the source for docs/PRODUCTION-READINESS.md's
// env-validation matrix -- keep the two in sync when this list changes.
const ENV_VARIABLE_REGISTRY = [
  { name: "DATABASE_URL", tier: "core", reason: "Database connection string; nothing works without it." },
  { name: "JWT_SECRET", tier: "core", reason: "Signs and verifies every auth token." },
  { name: "APP_BASE_URL", tier: "core", reason: "Builds absolute links used in emails and redirects." },
  { name: "RESEND_API_KEY", tier: "core", reason: "Required for all outbound transactional email." },

  { name: "CSRF_SECRET", tier: "production", reason: "Signs the CSRF double-submit token; middleware/csrf.middleware.js throws on every request if unset." },
  { name: "FIELD_ENCRYPTION_KEY", tier: "production", reason: "Encrypts sensitive stored fields (e.g. tax IDs) at rest." },
  { name: "STRIPE_SECRET_KEY", tier: "production", reason: "Required for every billing/Stripe API call." },
  { name: "STRIPE_WEBHOOK_SECRET", tier: "production", reason: "Verifies inbound Stripe webhook signatures; routes/billing.routes.js's POST /webhook rejects everything without it." },
  { name: "EXPORT_GRANT_SECRET", tier: "production", reason: "Signs short-lived export download grants." },
  { name: "RECEIPT_STORAGE_DIR", tier: "production", reason: "Filesystem path receipts are persisted to." },
  { name: "INEX_LEDGER_SUPPORT_SECRET", tier: "production", reason: "Shared secret gating the internal support API (see middleware/requireSupportSecret.js)." },
  {
    name: "REDIS_URL",
    tier: "production",
    reason: "middleware/rateLimiter.js's isRateLimitingRequired() is unconditionally true in production, so a missing REDIS_URL previously only failed by silently degrading to a per-instance in-memory limiter instead of failing startup."
  },
  { name: "EXPORT_PUBLIC_KEY_JWK", tier: "production", reason: "Public key for verifying secure export grants; crypto.routes.js degrades to 503 without it." },
  { name: "EXPORT_PRIVATE_KEY_JWK", tier: "production", reason: "Private key for signing secure export grants." }
];

// Feature-gated variables that are deliberately NOT in the required list.
// There is no code-level flag (no ENABLE_INBOUND_EMAIL-style toggle) to know
// whether a given deployment actually uses these features, so requiring
// them unconditionally would be guessing at product scope rather than
// validating a known contract. Both routes already fail closed with a
// clean 503 when unconfigured -- this is an ops-observability gap
// (findable only at request time, not startup), not a security gap.
const OPTIONAL_FEATURE_ENV_VARIABLES = [
  {
    names: ["SUPPORT_INBOUND_WEBHOOK_SECRET", "INBOUND_EMAIL_WEBHOOK_SECRET"],
    reason: "Gates the support-reply inbound email webhook (routes/supportEmail.routes.js's verifySupportInboundRequest). Unconfigured, the route returns 503 \"Support inbound webhook is not configured.\""
  },
  {
    names: ["INBOUND_EMAIL_WEBHOOK_SECRET"],
    reason: "Gates the general inbound email webhook (routes/email.routes.js). Unconfigured, the route returns a 503 in the same way."
  },
  {
    names: ["SUPPORT_REPLY_HMAC_SECRET"],
    reason: "Signs support-reply email links (services/emailPreferencesService.js, services/supportEmailService.js). Only exercised by the inbound-email features above."
  },
  {
    names: ["PDF_WORKER_URL", "PDF_WORKER_SECRET"],
    reason: "Would authenticate calls to the pdf-worker microservice via services/pdfWorkerClient.js's dispatchPdfJob, but nothing in routes/ or services/ currently calls dispatchPdfJob -- live PDF export goes through services/pdfGeneratorService.js's in-process generatePdfExportPair instead. Not currently required for any live code path; kept optional in case the worker is wired back in."
  }
];

function collectRequiredEnvironmentVariables(nodeEnv = process.env.NODE_ENV) {
  const core = ENV_VARIABLE_REGISTRY.filter((entry) => entry.tier === "core").map((entry) => entry.name);

  if (!isProductionEnvironment(nodeEnv)) {
    return core;
  }

  const production = ENV_VARIABLE_REGISTRY.filter((entry) => entry.tier === "production").map((entry) => entry.name);
  const stripePriceNames = STRIPE_PRICE_ENTRIES.map((entry) => entry.env);

  return [...new Set([...core, ...production, ...stripePriceNames])];
}

function validateEnvironmentOrThrow(nodeEnv = process.env.NODE_ENV) {
  const required = collectRequiredEnvironmentVariables(nodeEnv);
  const missing = required.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(", ")}`);
    error.code = "ENV_VALIDATION_FAILED";
    error.missing = missing;
    throw error;
  }
}

module.exports = {
  ENV_VARIABLE_REGISTRY,
  OPTIONAL_FEATURE_ENV_VARIABLES,
  collectRequiredEnvironmentVariables,
  isProductionEnvironment,
  validateEnvironmentOrThrow
};
