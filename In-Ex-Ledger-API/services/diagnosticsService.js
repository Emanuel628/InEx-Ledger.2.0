"use strict";

const path = require("path");
const fs = require("fs");

let cachedVersion = null;

function readAppVersion() {
  if (cachedVersion !== null) return cachedVersion;
  try {
    const pkgPath = path.join(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    cachedVersion = pkg.version || null;
  } catch (_) {
    cachedVersion = null;
  }
  return cachedVersion;
}

function isConfigured(name) {
  return Boolean(String(process.env[name] || "").trim());
}

/**
 * Returns a safe diagnostics snapshot for support/admin views.
 * Strict rules:
 *  - Never returns secret values, customer data, IPs, or PII.
 *  - For env-driven things, returns booleans / counts only.
 *  - Designed to answer "is this thing configured?" not "what is it set to?"
 */
function buildDiagnostics({
  migrationStats = null,
  rateLimiting = null,
  receiptStorage = null,
  now = new Date()
} = {}) {
  const stripePricesEnvCount = Object.keys(process.env)
    .filter((k) => /^STRIPE_PRICE_/i.test(k) && String(process.env[k] || "").trim())
    .length;

  return {
    timestamp: now.toISOString(),
    app: {
      version: readAppVersion(),
      commit: process.env.RAILWAY_GIT_COMMIT_SHA
        || process.env.GIT_COMMIT
        || process.env.SOURCE_VERSION
        || null,
      node_env: process.env.NODE_ENV || "development",
      uptime_seconds: Math.round(process.uptime())
    },
    migrations: migrationStats
      ? {
          total: migrationStats.total || 0,
          applied_this_boot: migrationStats.applied || 0,
          skipped_this_boot: migrationStats.skipped || 0,
          last_applied_at: migrationStats.lastAppliedAt
            ? new Date(migrationStats.lastAppliedAt).toISOString()
            : null,
          last_checked_at: migrationStats.lastCheckedAt
            ? new Date(migrationStats.lastCheckedAt).toISOString()
            : null
        }
      : null,
    rate_limiting: rateLimiting
      ? {
          mode: rateLimiting.mode || "unknown",
          redis_configured: Boolean(rateLimiting.redisConfigured),
          redis_connected: Boolean(rateLimiting.redisConnected)
        }
      : null,
    receipt_storage: receiptStorage
      ? {
          mode: receiptStorage.mode || "unknown",
          configured: Boolean(receiptStorage.dirConfigured || receiptStorage.configured)
        }
      : null,
    email: {
      configured: isConfigured("RESEND_API_KEY"),
      from_configured: isConfigured("RESEND_FROM_EMAIL") || isConfigured("EMAIL_FROM")
    },
    stripe: {
      secret_configured: isConfigured("STRIPE_SECRET_KEY"),
      webhook_secret_configured: isConfigured("STRIPE_WEBHOOK_SECRET"),
      price_envs_set: stripePricesEnvCount
    },
    encryption: {
      field_encryption_key_configured: isConfigured("FIELD_ENCRYPTION_KEY"),
      export_grant_secret_configured: isConfigured("EXPORT_GRANT_SECRET")
    },
    auth: {
      jwt_secret_configured: isConfigured("JWT_SECRET"),
      csrf_secret_configured: isConfigured("CSRF_SECRET"),
      app_base_url_configured: isConfigured("APP_BASE_URL")
    }
  };
}

module.exports = {
  buildDiagnostics,
  __private: { readAppVersion, isConfigured }
};
