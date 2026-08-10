"use strict";

// Pure input-normalization/validation helpers for routes/billing.routes.js:
// parsing and validating the billing interval, currency, additional-business
// count, checkout return path, and trial/region signals that come in on
// checkout and portal requests. No database access, no Stripe API calls, no
// request/response objects -- kept side-effect-free so they're directly
// testable without a database or mocked pool.

const BILLING_INTERVALS = new Set(["monthly", "yearly"]);
const BILLING_CURRENCIES = new Set(["usd", "cad"]);
const MAX_ADDITIONAL_BUSINESSES = 100;

class BillingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BillingValidationError";
  }
}

function isEnvFlagEnabled(name, defaultValue = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  return !["0", "false", "no", "off"].includes(raw);
}

function normalizeTrialEndForCheckout(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return Math.floor(date.getTime() / 1000);
}

function normalizeBillingInterval(input) {
  if (!input) {
    return "monthly";
  }
  const value = String(input).toLowerCase();
  if (!BILLING_INTERVALS.has(value)) {
    throw new BillingValidationError("Invalid billing interval.");
  }
  return value;
}

function normalizeCurrency(input) {
  if (!input) {
    return "usd";
  }
  const value = String(input).toLowerCase();
  if (!BILLING_CURRENCIES.has(value)) {
    throw new BillingValidationError("Invalid currency.");
  }
  return value;
}

function normalizeOptionalBillingInterval(input) {
  if (!input) {
    return null;
  }
  try {
    return normalizeBillingInterval(input);
  } catch (_) {
    return null;
  }
}

function normalizeOptionalCurrency(input) {
  if (!input) {
    return null;
  }
  try {
    return normalizeCurrency(input);
  } catch (_) {
    return null;
  }
}

function normalizeAdditionalBusinesses(input) {
  if (input === undefined || input === null || input === "") {
    return 0;
  }
  const value = Number(input);
  if (!Number.isSafeInteger(value)) {
    throw new BillingValidationError("Additional businesses must be a whole number.");
  }
  if (value < 0 || value > MAX_ADDITIONAL_BUSINESSES) {
    throw new BillingValidationError(
      `Additional businesses must be between 0 and ${MAX_ADDITIONAL_BUSINESSES}.`
    );
  }
  return value;
}

function normalizeInternalReturnPath(value, fallback = "/subscription") {
  const next = String(value || "").trim();
  if (!next.startsWith("/") || next.startsWith("//") || /[\r\n]/.test(next)) {
    return fallback;
  }
  return next;
}

function buildCheckoutReturnPath(returnPath, checkoutState) {
  const normalizedPath = normalizeInternalReturnPath(returnPath, "/subscription");
  const parsed = new URL(normalizedPath, "https://app.inexledger.local");
  parsed.searchParams.set("checkout", checkoutState);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isTrialReupgradeAttempt(subscription) {
  return Boolean(
    subscription?.isTrialing &&
    (
      subscription.cancelAtPeriodEnd ||
      subscription.isTrialDowngradedToFree ||
      subscription.selectedPlanCode !== "v1" ||
      subscription.trialPlanSelection === "free"
    )
  );
}

function normalizeCountryCode(country) {
  const value = String(country || "").trim().toLowerCase();
  if (!value) {
    return null;
  }
  if (value === "ca" || value === "canada") {
    return "ca";
  }
  if (
    value === "us" ||
    value === "usa" ||
    value === "united states" ||
    value === "united states of america"
  ) {
    return "us";
  }
  return null;
}

function resolveCurrencyForCountry(countryCode) {
  return countryCode === "ca" ? "cad" : "usd";
}

module.exports = {
  BILLING_INTERVALS,
  BILLING_CURRENCIES,
  MAX_ADDITIONAL_BUSINESSES,
  BillingValidationError,
  isEnvFlagEnabled,
  normalizeTrialEndForCheckout,
  normalizeBillingInterval,
  normalizeCurrency,
  normalizeOptionalBillingInterval,
  normalizeOptionalCurrency,
  normalizeAdditionalBusinesses,
  normalizeInternalReturnPath,
  buildCheckoutReturnPath,
  isTrialReupgradeAttempt,
  normalizeCountryCode,
  resolveCurrencyForCountry
};
