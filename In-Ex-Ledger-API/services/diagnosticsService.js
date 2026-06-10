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

function isAnyConfigured(...names) {
  return names.some((name) => isConfigured(name));
}

/**
 * Pull the domain out of an email value, tolerating "Name <user@domain>" and
 * plus-addressed locals. Returns null when no domain can be found. Used only
 * to compare domains for a configuration-sanity hint — never returned raw.
 */
function emailDomain(value) {
  const raw = String(value || "").trim();
  const bracket = raw.match(/<([^>]+)>/);
  const address = (bracket ? bracket[1] : raw).trim();
  const at = address.lastIndexOf("@");
  if (at < 1) return null;
  return address.slice(at + 1).replace(/[<>]/g, "").trim().toLowerCase() || null;
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
      from_configured: isConfigured("RESEND_FROM_EMAIL") || isConfigured("EMAIL_FROM"),
      // Inbound (reply) readiness. Inbound delivery is independent of sending,
      // so these can all be false even when outbound works. When any of these
      // is false, customer/support email replies cannot be routed back into
      // the app (Resend never receives the reply, or never posts the webhook).
      inbound: buildInboundEmailDiagnostics()
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

/**
 * Reports whether the invoice/support inbound-reply path is fully wired.
 * Booleans only — never the addresses or secrets themselves.
 *
 *  - invoice_reply_routing_configured: a Reply-To base address is set, so
 *    outbound invoices carry a plus-addressed Reply-To that inbound can match.
 *  - support_reply_routing_configured: same for support threads.
 *  - webhook_secret_configured: the inbound webhook signature secret is set,
 *    so a real Resend (Svix) webhook can be verified instead of 401'd.
 *  - reply_token_secret_configured: the HMAC used to sign/verify reply tokens.
 *  - reply_domain_differs_from_send_domain: HINT — when the Reply-To domain
 *    matches the From domain, the From domain must also have inbound MX records
 *    configured in Resend. A "noreply@" sending domain usually does NOT, which
 *    is the most common reason replies never reach Resend.
 */
function buildInboundEmailDiagnostics() {
  const invoiceReplyConfigured = isConfigured("INVOICE_REPLY_BASE_EMAIL");
  const supportReplyConfigured = isConfigured("SUPPORT_REPLY_BASE_EMAIL");
  const webhookSecretConfigured = isAnyConfigured(
    "INBOUND_EMAIL_WEBHOOK_SECRET",
    "SUPPORT_INBOUND_WEBHOOK_SECRET"
  );
  const replyTokenSecretConfigured = isAnyConfigured(
    "INVOICE_REPLY_HMAC_SECRET",
    "SUPPORT_REPLY_HMAC_SECRET",
    "CSRF_SECRET"
  );

  const fromDomain = emailDomain(
    process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM
  );
  const replyDomain = emailDomain(process.env.INVOICE_REPLY_BASE_EMAIL);

  return {
    ready:
      invoiceReplyConfigured && webhookSecretConfigured && replyTokenSecretConfigured,
    invoice_reply_routing_configured: invoiceReplyConfigured,
    support_reply_routing_configured: supportReplyConfigured,
    webhook_secret_configured: webhookSecretConfigured,
    reply_token_secret_configured: replyTokenSecretConfigured,
    reply_domain_differs_from_send_domain:
      Boolean(fromDomain && replyDomain && fromDomain !== replyDomain)
  };
}

module.exports = {
  buildDiagnostics,
  __private: { readAppVersion, isConfigured, emailDomain, buildInboundEmailDiagnostics }
};
