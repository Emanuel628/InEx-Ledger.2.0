const crypto = require("crypto");
const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createBillingMutationLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness
} = require("../services/subscriptionService.js");
const { buildStripePriceEnvMap } = require("../services/stripePriceConfig.js");
const { pool } = require("../db.js");
const { logError, logInfo, logWarn } = require("../utils/logger.js");

const router = express.Router();
const billingMutationLimiter = createBillingMutationLimiter();

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2026-02-25.clover";
const BILLING_INTERVALS = new Set(["monthly", "yearly"]);
const BILLING_CURRENCIES = new Set(["usd", "cad"]);
const MAX_ADDITIONAL_BUSINESSES = 100;
const { base: BASE_PRICE_ENV, addon: ADDON_PRICE_ENV } = buildStripePriceEnvMap();

function getStripeSecretKey() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return process.env.STRIPE_SECRET_KEY;
}

function requireEnvValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function encodeFormBody(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

async function stripeRequest(path, payload, options = {}) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.idempotencyKey ? { "Idempotency-Key": String(options.idempotencyKey) } : {})
    },
    body: encodeFormBody(payload)
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }
  return json;
}

function normalizeBillingInterval(input) {
  const value = String(input || "monthly").toLowerCase();
  if (!BILLING_INTERVALS.has(value)) {
    throw new Error("Invalid billing interval.");
  }
  return value;
}

function normalizeCurrency(input) {
  const value = String(input || "usd").toLowerCase();
  if (!BILLING_CURRENCIES.has(value)) {
    throw new Error("Invalid currency.");
  }
  return value;
}

function normalizeAdditionalBusinesses(input) {
  if (input === undefined || input === null || input === "") {
    return 0;
  }
  const value = Number(input);
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ADDITIONAL_BUSINESSES) {
    throw new Error(`Additional businesses must be between 0 and ${MAX_ADDITIONAL_BUSINESSES}.`);
  }
  return value;
}

function resolveCurrencyForCountry(countryCode) {
  return String(countryCode || "").toLowerCase() === "ca" ? "cad" : "usd";
}

function normalizeCountryCode(country) {
  const value = String(country || "").trim().toLowerCase();
  if (value === "ca" || value === "canada") return "ca";
  if (value === "us" || value === "usa" || value === "united states" || value === "united states of america") return "us";
  return null;
}

async function resolveBillingContext(req) {
  // Keep this override conservative. The main route has the full geo cache;
  // this edge-case path uses explicit client currency only if valid, otherwise
  // defaults to USD. Stripe still confirms final currency/pricing at checkout.
  const requestedCurrency = String(req.body?.currency || "").trim().toLowerCase();
  if (BILLING_CURRENCIES.has(requestedCurrency)) {
    return { currency: requestedCurrency, countryCode: null, source: "client_requested_validated" };
  }
  return { currency: resolveCurrencyForCountry(normalizeCountryCode(null)), countryCode: null, source: "default_usd" };
}

function resolveStripePriceSelection({ billingInterval, currency, additionalBusinesses }) {
  const interval = normalizeBillingInterval(billingInterval);
  const normalizedCurrency = normalizeCurrency(currency);
  const baseEnv = BASE_PRICE_ENV[interval]?.[normalizedCurrency];
  if (!baseEnv) {
    throw new Error("Unsupported billing interval or currency.");
  }
  const basePriceId = requireEnvValue(baseEnv);
  let addonPriceId = null;
  if (additionalBusinesses > 0) {
    const addonEnv = ADDON_PRICE_ENV[interval]?.[normalizedCurrency];
    if (!addonEnv) {
      throw new Error("Additional business pricing is not configured.");
    }
    addonPriceId = requireEnvValue(addonEnv);
  }
  return { billingInterval: interval, currency: normalizedCurrency, basePriceId, addonPriceId };
}

function buildAppUrl(path) {
  const base = (process.env.APP_BASE_URL || "").trim();
  if (!base) {
    throw new Error("APP_BASE_URL is not configured");
  }
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function resolveBillingBusinessScope(user) {
  const activeBusinessId = await resolveBusinessIdForUser(user);
  const billingBusinessId =
    await findBillingAnchorBusinessIdForUser(user?.id, activeBusinessId) || activeBusinessId;
  return { activeBusinessId, billingBusinessId };
}

async function ensureStripeCustomer(businessId, user) {
  const existing = await pool.query(
    `SELECT stripe_customer_id
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [businessId]
  );
  const existingCustomerId = existing.rows[0]?.stripe_customer_id;
  if (existingCustomerId) {
    return existingCustomerId;
  }

  const customer = await stripeRequest("/customers", {
    email: user.email,
    name: user.display_name || user.full_name || user.email,
    "metadata[business_id]": businessId,
    "metadata[user_id]": user.id
  });

  await updateStripeCustomerForBusiness(businessId, customer.id);
  return customer.id;
}

function isDowngradedActiveTrial(subscription) {
  return Boolean(
    subscription?.isTrialing &&
    (subscription.isTrialDowngradedToFree || subscription.selectedPlanCode !== "v1")
  );
}

router.post("/checkout-session", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res, next) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    if (!isDowngradedActiveTrial(subscription)) {
      return next();
    }

    const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);
    const billingContext = await resolveBillingContext(req);
    const priceSelection = resolveStripePriceSelection({
      billingInterval: req.body?.billingInterval,
      currency: billingContext.currency,
      additionalBusinesses
    });
    const customerId = await ensureStripeCustomer(billingBusinessId, req.user);

    const sessionPayload = {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceSelection.basePriceId,
      "line_items[0][quantity]": 1,
      success_url: buildAppUrl("/subscription?checkout=success"),
      cancel_url: buildAppUrl("/subscription?checkout=cancel"),
      "metadata[business_id]": billingBusinessId,
      "metadata[user_id]": req.user.id,
      "metadata[plan_code]": "v1",
      "metadata[billing_interval]": priceSelection.billingInterval,
      "metadata[currency]": priceSelection.currency,
      "metadata[currency_source]": billingContext.source,
      "metadata[country_code]": billingContext.countryCode || "unknown",
      "metadata[additional_businesses]": additionalBusinesses,
      "metadata[checkout_reason]": "trial_downgrade_to_pro",
      "subscription_data[metadata][plan_code]": "v1",
      "subscription_data[metadata][billing_interval]": priceSelection.billingInterval,
      "subscription_data[metadata][currency]": priceSelection.currency,
      "subscription_data[metadata][currency_source]": billingContext.source,
      "subscription_data[metadata][country_code]": billingContext.countryCode || "unknown",
      "subscription_data[metadata][additional_businesses]": additionalBusinesses,
      "subscription_data[metadata][checkout_reason]": "trial_downgrade_to_pro"
    };

    if (priceSelection.addonPriceId) {
      sessionPayload["line_items[1][price]"] = priceSelection.addonPriceId;
      sessionPayload["line_items[1][quantity]"] = additionalBusinesses;
      sessionPayload["metadata[addon_price_id]"] = priceSelection.addonPriceId;
      sessionPayload["subscription_data[metadata][addon_price_id]"] = priceSelection.addonPriceId;
    }

    if (subscription.trialEndsAt) {
      const trialEndUnix = Math.floor(new Date(subscription.trialEndsAt).getTime() / 1000);
      if (trialEndUnix > Math.floor(Date.now() / 1000)) {
        sessionPayload["subscription_data[trial_end]"] = trialEndUnix;
      }
    }

    const session = await stripeRequest("/checkout/sessions", sessionPayload, {
      idempotencyKey: `checkout:trial-downgrade:${billingBusinessId}:${priceSelection.billingInterval}:${priceSelection.currency}:${additionalBusinesses}:${crypto.randomUUID()}`
    });

    logInfo("Trial-downgraded account sent through normal Stripe checkout", {
      userId: req.user?.id,
      businessId: billingBusinessId,
      currency: priceSelection.currency,
      billingInterval: priceSelection.billingInterval,
      additionalBusinesses
    });

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    logError("POST /api/billing/checkout-session trial-downgrade override error:", err.message);
    return res.status(500).json({ error: "Failed to start checkout." });
  }
});

module.exports = router;
