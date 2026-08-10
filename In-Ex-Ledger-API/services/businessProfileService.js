"use strict";

// Pure/near-pure helpers for routes/businesses.routes.js: building the app
// base URL, normalizing billing currency/interval and currency-amount
// formatting, validating a new-business payload, normalizing an owned
// business profile row (decrypting its tax ID/GST-HST number), and building
// the business-limit-reached error message. No database access, no Stripe
// API calls, no request/response objects -- kept side-effect-free so
// they're directly testable without a database or mocked Stripe client.

const { decryptTaxId } = require("./taxIdService.js");
const { decryptGstHstNumber } = require("./gstHstNumberService.js");

function buildAppUrl(path) {
  const base = (process.env.APP_BASE_URL || "").trim();
  if (!base) {
    throw new Error("APP_BASE_URL is not configured");
  }
  const parsed = new URL(base);
  const isLocalhost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";

  if (parsed.protocol !== "https:" && !isLocalhost) {
    throw new Error("APP_BASE_URL must use HTTPS");
  }
  if (parsed.hostname === "inexledger.com") {
    parsed.hostname = "www.inexledger.com";
  }
  const normalizedBase = parsed.toString().replace(/\/+$/, "");
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function normalizeBillingCurrency(currency) {
  return String(currency || "usd").trim().toLowerCase() === "cad" ? "cad" : "usd";
}

function normalizeBillingInterval(interval) {
  return String(interval || "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
}

function normalizeOptionalBillingInterval(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "yearly" ? "yearly" : normalized === "monthly" ? "monthly" : null;
}

function normalizeOptionalCurrency(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "cad" ? "cad" : normalized === "usd" ? "usd" : null;
}

function formatBillingCurrencyAmount(amount, currency) {
  const normalizedCurrency = String(currency || "usd").toUpperCase();
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) {
    return `${normalizedCurrency} 0.00`;
  }
  const locale = normalizedCurrency === "CAD" ? "en-CA" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch (_) {
    return `${normalizedCurrency} ${numeric.toFixed(2)}`;
  }
}

function normalizeBusinessPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  const region = String(payload.region || "US").trim().toUpperCase();
  const language = String(payload.language || "en").trim().toLowerCase();

  if (!name) {
    return { valid: false, error: "Business name is required." };
  }
  if (!["US", "CA"].includes(region)) {
    return { valid: false, error: "Region must be US or CA." };
  }
  if (!["en", "es", "fr"].includes(language)) {
    return { valid: false, error: "Language must be en, es, or fr." };
  }

  return { valid: true, normalized: { name, region, language } };
}

function normalizeOptionalTrimmedString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeBusinessProfileRow(row) {
  if (!row) {
    return null;
  }

  return {
    ...row,
    tax_id: decryptTaxId(row.tax_id),
    contact_full_name: row.contact_full_name || "",
    business_type: row.business_type || null,
    operating_name: row.operating_name || null,
    business_activity_code: row.business_activity_code || null,
    accounting_method: row.accounting_method || null,
    material_participation: typeof row.material_participation === "boolean" ? row.material_participation : null,
    gst_hst_registered: row.gst_hst_registered === true,
    gst_hst_number: decryptGstHstNumber(row.gst_hst_number),
    gst_hst_method: row.gst_hst_method || null,
    locked_through_date: row.locked_through_date || null,
    locked_period_note: row.locked_period_note || null,
    locked_period_updated_at: row.locked_period_updated_at || null
  };
}

function buildBusinessLimitError(subscription, maxBusinessesAllowed) {
  const hasProAccess = subscription?.effectiveTier === "v1";

  if (hasProAccess) {
    return maxBusinessesAllowed <= 1
      ? "Your Pro plan currently includes 1 business. Add an additional business slot in Subscription to continue."
      : `Your Pro plan currently allows up to ${maxBusinessesAllowed} businesses. Increase your additional business slots in Subscription to continue.`;
  }

  return maxBusinessesAllowed <= 1
    ? "Your current plan includes 1 business. Upgrade to Pro and add an additional business slot to continue."
    : `Your current plan allows up to ${maxBusinessesAllowed} businesses. Upgrade your business access in Subscription to continue.`;
}

module.exports = {
  buildAppUrl,
  normalizeBillingCurrency,
  normalizeBillingInterval,
  normalizeOptionalBillingInterval,
  normalizeOptionalCurrency,
  formatBillingCurrencyAmount,
  normalizeBusinessPayload,
  normalizeOptionalTrimmedString,
  normalizeBusinessProfileRow,
  buildBusinessLimitError
};
