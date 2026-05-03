const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createBillingMutationLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setFreePlanForBusiness
} = require("../services/subscriptionService.js");
const { buildStripePriceEnvMap } = require("../services/stripePriceConfig.js");
const {
  getPreferredLanguageForUser,
  buildBillingLifecycleEmail
} = require("../services/emailI18nService.js");
const {
  normalizeIpAddress,
  fetchIpLocation
} = require("../services/signInSecurityService.js");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2026-02-25.clover";

const billingMutationLimiter = createBillingMutationLimiter();

const BILLING_INTERVALS = new Set(["monthly", "yearly"]);
const BILLING_CURRENCIES = new Set(["usd", "cad"]);
const MAX_ADDITIONAL_BUSINESSES = 100;
const BILLING_CONTEXT_CACHE_TTL_MS = 15 * 60 * 1000;
const STRIPE_PRICE_CACHE_TTL_MS = 15 * 60 * 1000;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "InEx Ledger <noreply@inexledger.com>";

const { base: BASE_PRICE_ENV, addon: ADDON_PRICE_ENV } = buildStripePriceEnvMap();
const billingContextCache = new Map();
const stripePriceCache = new Map();
let resendClient = null;

class BillingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "BillingValidationError";
  }
}

function getResend() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const billingReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => "stripe-webhook"
});

// Stripe can retry failed deliveries for up to 72 h; keep IDs for 7 days so a
// late retry is never treated as a new event.
const _WEBHOOK_IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const _WEBHOOK_IDEMPOTENCY_CLEANUP_PROBABILITY = 0.01;

async function reserveWebhookEvent(eventId) {
  if (!eventId) {
    logWarn("Stripe webhook missing event id; skipping processing");
    return false;
  }

  const insertResult = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, processed_at)
     VALUES ($1, NOW())
     ON CONFLICT (event_id) DO NOTHING`,
    [eventId]
  );

  // Opportunistic TTL cleanup to keep this table bounded with minimal overhead.
  if (Math.random() < _WEBHOOK_IDEMPOTENCY_CLEANUP_PROBABILITY) {
    await pool.query(
      `DELETE FROM stripe_webhook_events
        WHERE processed_at < NOW() - ($1::bigint * INTERVAL '1 millisecond')`,
      [_WEBHOOK_IDEMPOTENCY_TTL_MS]
    );
  }

  return insertResult.rowCount > 0;
}

async function releaseWebhookEvent(eventId) {
  if (!eventId) {
    return;
  }

  await pool.query(
    `DELETE FROM stripe_webhook_events
      WHERE event_id = $1`,
    [eventId]
  );
}

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

function getVerifiedClientIp(req) {
  return normalizeIpAddress(req?.ip || req?.socket?.remoteAddress || "");
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

async function resolveBillingContext(req) {
  const ipAddress = getVerifiedClientIp(req);
  const cached = ipAddress ? billingContextCache.get(ipAddress) : null;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const location = await fetchIpLocation(ipAddress);
  const countryCode = normalizeCountryCode(location?.country);
  const context = {
    ipAddress: ipAddress || null,
    countryCode,
    currency: resolveCurrencyForCountry(countryCode),
    source: countryCode ? "ip_geolocation" : "default_usd"
  };

  if (ipAddress) {
    billingContextCache.set(ipAddress, {
      value: context,
      expiresAt: Date.now() + BILLING_CONTEXT_CACHE_TTL_MS
    });
  }

  return context;
}

function resolveStripePriceSelection({ billingInterval, currency, additionalBusinesses }) {
  const interval = normalizeBillingInterval(billingInterval);
  const normalizedCurrency = normalizeCurrency(currency);
  const baseEnv = BASE_PRICE_ENV[interval]?.[normalizedCurrency];
  if (!baseEnv) {
    throw new BillingValidationError("Unsupported billing interval or currency.");
  }
  const basePriceId = requireEnvValue(baseEnv);
  let addonPriceId = null;
  if (additionalBusinesses > 0) {
    const addonEnv = ADDON_PRICE_ENV[interval]?.[normalizedCurrency];
    if (!addonEnv) {
      throw new BillingValidationError("Additional business pricing is not configured.");
    }
    addonPriceId = requireEnvValue(addonEnv);
  }
  return {
    billingInterval: interval,
    currency: normalizedCurrency,
    basePriceId,
    addonPriceId
  };
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

async function stripeRequest(path, payload) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION
    },
    body: encodeFormBody(payload)
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

async function stripeGet(path) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Stripe-Version": STRIPE_API_VERSION
    }
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

function parseStripeUnitAmount(price) {
  const raw = price?.unit_amount_decimal ?? price?.unit_amount;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error("Stripe price is missing a valid unit amount");
  }
  return numeric / 100;
}

async function fetchStripePrice(priceId) {
  const cached = stripePriceCache.get(priceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const price = await stripeGet(`/prices/${encodeURIComponent(priceId)}`);
  stripePriceCache.set(priceId, {
    value: price,
    expiresAt: Date.now() + STRIPE_PRICE_CACHE_TTL_MS
  });
  return price;
}

async function buildVerifiedPricingTable(currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  const monthlyBaseEnv = BASE_PRICE_ENV.monthly?.[normalizedCurrency];
  const yearlyBaseEnv = BASE_PRICE_ENV.yearly?.[normalizedCurrency];
  const monthlyAddonEnv = ADDON_PRICE_ENV.monthly?.[normalizedCurrency];
  const yearlyAddonEnv = ADDON_PRICE_ENV.yearly?.[normalizedCurrency];

  const [monthlyBasePrice, yearlyBasePrice, monthlyAddonPrice, yearlyAddonPrice] = await Promise.all([
    fetchStripePrice(requireEnvValue(monthlyBaseEnv)),
    fetchStripePrice(requireEnvValue(yearlyBaseEnv)),
    fetchStripePrice(requireEnvValue(monthlyAddonEnv)),
    fetchStripePrice(requireEnvValue(yearlyAddonEnv))
  ]);

  return {
    monthly: {
      base: parseStripeUnitAmount(monthlyBasePrice),
      addon: parseStripeUnitAmount(monthlyAddonPrice),
      labelKey: "subscription_billing_monthly"
    },
    yearly: {
      base: parseStripeUnitAmount(yearlyBasePrice),
      addon: parseStripeUnitAmount(yearlyAddonPrice),
      labelKey: "subscription_billing_yearly"
    }
  };
}

async function findBusinessByStripeCustomerId(stripeCustomerId) {
  const result = await pool.query(
    `SELECT business_id
       FROM business_subscriptions
      WHERE stripe_customer_id = $1
      LIMIT 1`,
    [stripeCustomerId]
  );
  return result.rows[0]?.business_id || null;
}

async function ensureStripeCustomer(businessId, user) {
  const existing = await pool.query(
    `SELECT stripe_customer_id
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [businessId]
  );

  const stripeCustomerId = existing.rows[0]?.stripe_customer_id;
  if (stripeCustomerId) {
    return stripeCustomerId;
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

  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function formatBillingCurrencyAmount(amountMinor, currency) {
  const normalizedCurrency = String(currency || "usd").toUpperCase();
  const value = Number(amountMinor || 0) / 100;
  if (!Number.isFinite(value)) {
    return `${normalizedCurrency} 0.00`;
  }
  const locale = normalizedCurrency === "CAD" ? "en-CA" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: normalizedCurrency }).format(value);
  } catch (_) {
    return `${normalizedCurrency} ${value.toFixed(2)}`;
  }
}

function formatBillingIntervalLabel(interval) {
  return String(interval || "").toLowerCase() === "yearly" ? "Yearly" : "Monthly";
}

function formatDateLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

async function findBillingContactByBusinessId(businessId) {
  if (!businessId) {
    return null;
  }
  const result = await pool.query(
    `SELECT u.id AS user_id,
            u.email,
            COALESCE(u.display_name, u.full_name, u.email) AS display_name,
            b.name AS business_name
       FROM businesses b
       JOIN users u ON u.id = b.user_id
      WHERE b.id = $1
      LIMIT 1`,
    [businessId]
  );
  return result.rows[0] || null;
}

async function sendBillingEmail({ businessId, kind, details, actionUrl, invoiceUrl }) {
  try {
    const contact = await findBillingContactByBusinessId(businessId);
    if (!contact?.email) {
      return;
    }
    const lang = await getPreferredLanguageForUser(contact.user_id);
    const billingUrl = buildAppUrl("/subscription");
    const emailContent = buildBillingLifecycleEmail(lang, kind, {
      details,
      actionUrl,
      invoiceUrl,
      billingUrl
    });
    await getResend().emails.send({
      from: RESEND_FROM_EMAIL,
      to: contact.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });
    logInfo("Billing lifecycle email sent", { businessId, kind, to: contact.email });
  } catch (err) {
    logWarn("Billing lifecycle email failed", {
      businessId,
      kind,
      err: err.message
    });
  }
}

router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    let subscription = await getSubscriptionSnapshotForBusiness(businessId);

    if (!subscription.isPaid && subscription.stripeCustomerId) {
      try {
        const latest = await stripeGet(
          `/subscriptions?customer=${encodeURIComponent(subscription.stripeCustomerId)}&status=all&limit=5`
        );
        const subscriptions = Array.isArray(latest?.data) ? latest.data : [];
        const stripeSubscription =
          subscriptions.find((item) => ["active", "trialing", "past_due", "canceled"].includes(String(item?.status || ""))) || null;

        if (stripeSubscription) {
          await syncStripeSubscriptionForBusiness(businessId, stripeSubscription);
          subscription = await getSubscriptionSnapshotForBusiness(businessId);
        }
      } catch (syncErr) {
        logWarn("GET /api/billing/subscription self-heal sync skipped:", {
          businessId,
          err: syncErr.message
        });
      }
    }

    res.json({ subscription });
  } catch (err) {
    logError("GET /api/billing/subscription error:", err.message);
    res.status(500).json({ error: "Failed to load subscription." });
  }
});

router.get("/pricing-context", billingReadLimiter, async (req, res) => {
  try {
    const context = await resolveBillingContext(req);
    res.json({
      currency: context.currency,
      country_code: context.countryCode,
      source: context.source
    });
  } catch (err) {
    logError("GET /api/billing/pricing-context error:", err.message);
    res.status(500).json({ error: "Failed to load pricing context." });
  }
});

router.get("/pricing", billingReadLimiter, async (req, res) => {
  try {
    const context = await resolveBillingContext(req);
    const pricing = await buildVerifiedPricingTable(context.currency);
    res.json({
      currency: context.currency,
      country_code: context.countryCode,
      source: context.source,
      pricing
    });
  } catch (err) {
    logError("GET /api/billing/pricing error:", err.message);
    res.status(500).json({ error: "Failed to load billing pricing." });
  }
});

// ── Mock V1 (dev/staging only) ────────────────────────────────────────────────
// These two routes let developers activate V1 access without going through
// Stripe. Gate them behind ENABLE_MOCK_BILLING=true so they are unreachable
// in production.

router.get("/mock-v1", async (_req, res) => {
  res.json({ enabled: process.env.ENABLE_MOCK_BILLING === "true" });
});

router.post("/mock-v1", requireAuth, requireCsrfProtection, async (req, res) => {
  if (process.env.ENABLE_MOCK_BILLING !== "true") {
    return res.status(403).json({ error: "Mock billing is not enabled in this environment." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    await pool.query(
      `UPDATE business_subscriptions
          SET plan_code = 'v1',
              status    = 'active',
              current_period_start = NOW(),
              current_period_end   = NOW() + INTERVAL '2 years',
              cancel_at_period_end = false,
              updated_at = NOW()
        WHERE business_id = $1`,
      [businessId]
    );
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    logInfo("Mock V1 activated for business", businessId);
    res.json({ subscription });
  } catch (err) {
    logError("POST /api/billing/mock-v1 error:", err.message);
    res.status(500).json({ error: "Failed to activate mock V1." });
  }
});

router.post("/checkout-session", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    // Block when any live Stripe subscription exists — including subscriptions
    // scheduled to cancel at period end (cancel_at_period_end=true).  Allowing
    // checkout in that state creates a second parallel subscription and double
    // billing.  isCanceledWithRemainingAccess means Stripe already deleted the
    // subscription; the user may create a new one while keeping access through
    // the paid period.
    if (subscription.isPaid && !subscription.isCanceledWithRemainingAccess) {
      return res.status(409).json({
        error: "Business is already on an active paid plan. Use the billing portal to manage your subscription."
      });
    }

    const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);
    const billingContext = await resolveBillingContext(req);
    const requestedCurrency = String(req.body?.currency || "").trim().toLowerCase();
    if (
      requestedCurrency &&
      BILLING_CURRENCIES.has(requestedCurrency) &&
      requestedCurrency !== billingContext.currency
    ) {
      logWarn("Ignored client-supplied billing currency in favor of verified billing context", {
        userId: req.user?.id,
        businessId,
        requestedCurrency,
        resolvedCurrency: billingContext.currency,
        billingSource: billingContext.source
      });
    }
    const priceSelection = resolveStripePriceSelection({
      billingInterval: req.body?.billingInterval,
      currency: billingContext.currency,
      additionalBusinesses
    });

    const customerId = await ensureStripeCustomer(businessId, req.user);
    const sessionPayload = {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceSelection.basePriceId,
      "line_items[0][quantity]": 1,
      success_url: buildAppUrl("/subscription?checkout=success"),
      cancel_url: buildAppUrl("/subscription?checkout=cancel"),
      "metadata[business_id]": businessId,
      "metadata[user_id]": req.user.id,
      "metadata[plan_code]": "v1",
      "metadata[billing_interval]": priceSelection.billingInterval,
      "metadata[currency]": priceSelection.currency,
      "metadata[currency_source]": billingContext.source,
      "metadata[country_code]": billingContext.countryCode || "unknown",
      "metadata[additional_businesses]": additionalBusinesses,
      "subscription_data[metadata][plan_code]": "v1",
      "subscription_data[metadata][billing_interval]": priceSelection.billingInterval,
      "subscription_data[metadata][currency]": priceSelection.currency,
      "subscription_data[metadata][currency_source]": billingContext.source,
      "subscription_data[metadata][country_code]": billingContext.countryCode || "unknown",
      "subscription_data[metadata][additional_businesses]": additionalBusinesses
    };

    if (priceSelection.addonPriceId) {
      sessionPayload["line_items[1][price]"] = priceSelection.addonPriceId;
      sessionPayload["line_items[1][quantity]"] = additionalBusinesses;
      sessionPayload["metadata[addon_price_id]"] = priceSelection.addonPriceId;
      sessionPayload["subscription_data[metadata][addon_price_id]"] = priceSelection.addonPriceId;
    }

    const session = await stripeRequest("/checkout/sessions", sessionPayload);
    logInfo("Billing checkout session created", {
      userId: req.user?.id,
      businessId,
      currency: priceSelection.currency,
      billingInterval: priceSelection.billingInterval,
      additionalBusinesses
    });

    res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    logError("POST /api/billing/checkout-session error:", err.message);
    const status = err instanceof BillingValidationError ? 400 : 500;
    res.status(status).json({
      error: status === 400 ? err.message : "Failed to start checkout."
    });
  }
});

router.post("/customer-portal", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const customerId = await ensureStripeCustomer(businessId, req.user);
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: customerId,
      return_url: buildAppUrl("/subscription")
    });
    logInfo("Billing portal session created", {
      userId: req.user?.id,
      businessId
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    logError("POST /api/billing/customer-portal error:", err.message);
    res.status(500).json({ error: "Failed to open billing portal." });
  }
});

router.post("/cancel", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    if (!subscription.stripeSubscriptionId) {
      // No Stripe subscription — just downgrade to free immediately
      await setFreePlanForBusiness(businessId);
      const updated = await getSubscriptionSnapshotForBusiness(businessId);
      await sendBillingEmail({
        businessId,
        kind: "canceling",
        details: [
          { label: "Plan", value: "Basic" },
          { label: "Effective", value: "Immediate" }
        ],
        actionUrl: buildAppUrl("/subscription")
      });
      return res.status(200).json({ subscription: updated });
    }

    // Cancel at period end via Stripe
    await stripeRequest(`/subscriptions/${subscription.stripeSubscriptionId}`, {
      cancel_at_period_end: true
    });

    // Sync the updated state from Stripe
    const stripeSubResponse = await fetch(
      `${STRIPE_API_BASE}/subscriptions/${subscription.stripeSubscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${getStripeSecretKey()}`,
          "Stripe-Version": STRIPE_API_VERSION
        }
      }
    );
    const stripeSub = await stripeSubResponse.json().catch(() => null);
    if (stripeSub && !stripeSub.error) {
      await syncStripeSubscriptionForBusiness(businessId, stripeSub);
    }

    const updated = await getSubscriptionSnapshotForBusiness(businessId);
    await sendBillingEmail({
      businessId,
      kind: "canceling",
      details: [
        { label: "Plan", value: updated.effectiveTierName || "Pro" },
        { label: "Access until", value: formatDateLabel(updated.currentPeriodEnd) }
      ],
      actionUrl: buildAppUrl("/subscription")
    });
    logInfo("Billing cancellation scheduled", {
      userId: req.user?.id,
      businessId,
      stripeSubscriptionId: subscription.stripeSubscriptionId || null,
      cancelAtPeriodEnd: true
    });
    res.status(200).json({ subscription: updated });
  } catch (err) {
    logError("POST /api/billing/cancel error:", err.message);
    res.status(500).json({ error: "Failed to cancel subscription." });
  }
});

function getAddonPriceIds() {
  const ids = new Set();
  for (const intervalKey of Object.keys(ADDON_PRICE_ENV)) {
    const intervalMap = ADDON_PRICE_ENV[intervalKey];
    for (const currencyKey of Object.keys(intervalMap || {})) {
      const envVar = intervalMap[currencyKey];
      const priceId = process.env[envVar];
      if (priceId) ids.add(priceId);
    }
  }
  return ids;
}

async function resolveAddonPriceIdForSubscription(businessId) {
  const result = await pool.query(
    "SELECT metadata_json FROM business_subscriptions WHERE business_id = $1 LIMIT 1",
    [businessId]
  );
  const meta =
    result.rows[0]?.metadata_json && typeof result.rows[0].metadata_json === "object"
      ? result.rows[0].metadata_json
      : {};
  const billingInterval = meta.billing_interval || "monthly";
  const currency = meta.currency || "usd";
  const addonEnv = ADDON_PRICE_ENV[billingInterval]?.[currency];
  if (!addonEnv) {
    throw new BillingValidationError(
      "Additional business pricing is not configured for your billing interval and currency."
    );
  }
  return requireEnvValue(addonEnv);
}

router.patch("/additional-businesses", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const hasActiveProAccess =
      subscription.effectiveTier === "v1" &&
      (subscription.isPaid || subscription.isTrialing);

    if (!hasActiveProAccess) {
      return res.status(403).json({
        error: "Additional business slots require an active Pro subscription."
      });
    }
    if (subscription.cancelAtPeriodEnd) {
      return res.status(409).json({
        error: "Cannot change business slots while cancellation is pending. Resume Pro to make changes."
      });
    }
    if (subscription.isCanceledWithRemainingAccess) {
      return res.status(409).json({
        error: "Your Pro subscription has already been canceled. Start a new Pro subscription before changing business slots."
      });
    }
    if (!subscription.stripeSubscriptionId) {
      return res.status(409).json({ error: "No active Stripe subscription found." });
    }

    const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);

    const stripeSub = await stripeGet(
      `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`
    );
    const items = Array.isArray(stripeSub.items?.data) ? stripeSub.items.data : [];
    const addonPriceIds = getAddonPriceIds();
    const existingAddonItem = items.find((item) => addonPriceIds.has(item?.price?.id)) || null;

    let updatedSub;
    if (additionalBusinesses === 0 && !existingAddonItem) {
      updatedSub = stripeSub;
    } else if (additionalBusinesses === 0 && existingAddonItem) {
      updatedSub = await stripeRequest(
        `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
        {
          "items[0][id]": existingAddonItem.id,
          "items[0][deleted]": "true",
          proration_behavior: "create_prorations"
        }
      );
    } else if (existingAddonItem) {
      updatedSub = await stripeRequest(
        `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
        {
          "items[0][id]": existingAddonItem.id,
          "items[0][quantity]": additionalBusinesses,
          proration_behavior: "create_prorations"
        }
      );
    } else {
      const addonPriceId = await resolveAddonPriceIdForSubscription(businessId);
      updatedSub = await stripeRequest(
        `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
        {
          "items[0][price]": addonPriceId,
          "items[0][quantity]": additionalBusinesses,
          proration_behavior: "create_prorations"
        }
      );
    }

    await syncStripeSubscriptionForBusiness(businessId, updatedSub);
    const updated = await getSubscriptionSnapshotForBusiness(businessId);
    logInfo("Business slots updated", {
      userId: req.user?.id,
      businessId,
      previousAdditionalBusinesses: subscription.additionalBusinesses,
      newAdditionalBusinesses: additionalBusinesses
    });
    res.status(200).json({ subscription: updated });
  } catch (err) {
    logError("PATCH /api/billing/additional-businesses error:", err.message);
    const status = err instanceof BillingValidationError ? 400 : 500;
    res.status(status).json({
      error: status === 400 ? err.message : "Failed to update business slots."
    });
  }
});

router.get("/history", billingReadLimiter, requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subRow = await pool.query(
      "SELECT stripe_customer_id FROM business_subscriptions WHERE business_id = $1 LIMIT 1",
      [businessId]
    );

    const stripeCustomerId = subRow.rows[0]?.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.status(200).json({ invoices: [] });
    }

    const response = await fetch(
      `${STRIPE_API_BASE}/invoices?customer=${stripeCustomerId}&limit=24&status=paid`,
      {
        headers: {
          Authorization: `Bearer ${getStripeSecretKey()}`,
          "Stripe-Version": STRIPE_API_VERSION
        }
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Failed to fetch billing history");
    }

    const invoices = (payload?.data || []).map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      period_start: inv.period_start,
      period_end: inv.period_end,
      created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf
    }));

    res.status(200).json({ invoices });
  } catch (err) {
    logError("GET /api/billing/history error:", err.message);
    res.status(500).json({ error: "Failed to load billing history." });
  }
});

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300; // 5-minute replay window

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const parts = String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  // Collect ALL v1= values — Stripe sends multiple signatures during secret
  // rotation and the webhook is valid if any one of them matches.
  const v1Signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Missing Stripe signature");
  }

  const timestampSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Stripe webhook timestamp is outside the acceptable tolerance window");
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const compare = Buffer.from(expected, "utf8");
  const isValid = v1Signatures.some((v1) => {
    const actual = Buffer.from(v1, "utf8");
    return actual.length === compare.length && crypto.timingSafeEqual(actual, compare);
  });
  if (!isValid) {
    throw new Error("Invalid Stripe signature");
  }
}

router.post("/webhook", webhookLimiter, async (req, res) => {
  // Signature verification — only 400 on invalid signature, never on internal errors
  try {
    verifyWebhookSignature(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    logWarn("Stripe webhook signature rejected:", err.message);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    logWarn("Stripe webhook payload parse error:", err.message);
    return res.status(400).json({ error: "Invalid webhook payload" });
  }

  // Idempotency: reserve event ID before acknowledging. This ensures that if
  // the DB is temporarily unavailable, Stripe receives a non-2xx response and
  // retries the delivery instead of silently losing the event.
  let reserved;
  try {
    reserved = await reserveWebhookEvent(event.id);
  } catch (err) {
    logError("Stripe webhook idempotency reservation failed:", {
      eventId: event.id,
      err: err.message
    });
    return res.status(500).json({ error: "Webhook processing temporarily unavailable" });
  }

  if (!reserved) {
    logInfo("Stripe webhook duplicate skipped:", event.id, event.type);
    return res.status(200).json({ received: true, duplicate: true });
  }

  const object = event?.data?.object || {};

  try {
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const businessId =
        object?.metadata?.business_id ||
        (await findBusinessByStripeCustomerId(object.customer));
      if (businessId) {
        await syncStripeSubscriptionForBusiness(businessId, object);
        logInfo("Stripe subscription synced:", event.type, "business:", businessId);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const businessId =
        object?.metadata?.business_id ||
        (await findBusinessByStripeCustomerId(object.customer));
      if (businessId) {
        // Stripe fires customer.subscription.deleted both for immediate
        // cancellations and for cancel-at-period-end subscriptions that have
        // now lapsed.  For immediate cancellations the current_period_end is
        // still in the future — the user paid through that date and must keep
        // access.  Sync the canceled state so deriveEffectiveState can use
        // isCanceledWithRemainingAccess to preserve V1 access until the period
        // end.  Only call setFreePlanForBusiness when the period has already
        // passed (i.e., the subscription truly expired).
        const periodEndSeconds = object?.current_period_end;
        const periodEndMs = periodEndSeconds ? periodEndSeconds * 1000 : 0;
        if (periodEndMs > Date.now()) {
          await syncStripeSubscriptionForBusiness(businessId, object);
          logInfo(
            "Stripe subscription deleted mid-period — synced canceled state, access preserved until period end for business:",
            businessId
          );
        } else {
          await setFreePlanForBusiness(businessId);
          logInfo("Stripe subscription deleted — set free plan for business:", businessId);
        }
      }
    } else if (event.type === "checkout.session.completed") {
      const subscriptionId = object?.subscription;
      const businessId =
        object?.metadata?.business_id ||
        (object?.customer ? await findBusinessByStripeCustomerId(object.customer) : null);
      if (subscriptionId && businessId) {
        if (object?.customer) {
          await updateStripeCustomerForBusiness(businessId, object.customer);
        }
        const subResponse = await fetch(
          `${STRIPE_API_BASE}/subscriptions/${subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${getStripeSecretKey()}`,
              "Stripe-Version": STRIPE_API_VERSION
            }
          }
        );
        const sub = await subResponse.json().catch(() => null);
        if (sub && !sub.error) {
          await syncStripeSubscriptionForBusiness(businessId, sub);
          await sendBillingEmail({
            businessId,
            kind: "activated",
            details: [
              { label: "Plan", value: "Pro" },
              { label: "Billing", value: formatBillingIntervalLabel(sub?.metadata?.billing_interval) },
              { label: "Additional businesses", value: String(Number(sub?.metadata?.additional_businesses) || 0) },
              { label: "Access through", value: formatDateLabel(sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null) }
            ],
            actionUrl: buildAppUrl("/subscription")
          });
          logInfo("Stripe checkout.session.completed synced for business:", businessId);
        }
      }
    } else if (event.type === "invoice.payment_succeeded") {
      const subscriptionId = object?.subscription;
      const businessId = object?.customer
        ? await findBusinessByStripeCustomerId(object.customer)
        : null;
      if (subscriptionId && businessId) {
        const subResponse = await fetch(
          `${STRIPE_API_BASE}/subscriptions/${subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${getStripeSecretKey()}`,
              "Stripe-Version": STRIPE_API_VERSION
            }
          }
        );
        const sub = await subResponse.json().catch(() => null);
        if (sub && !sub.error) {
          await syncStripeSubscriptionForBusiness(businessId, sub);
          await sendBillingEmail({
            businessId,
            kind: "charged",
            details: [
              { label: "Amount", value: formatBillingCurrencyAmount(object?.amount_paid, object?.currency) },
              { label: "Plan", value: "Pro" },
              { label: "Billing", value: formatBillingIntervalLabel(sub?.metadata?.billing_interval) },
              { label: "Paid on", value: formatDateLabel(object?.status_transitions?.paid_at ? new Date(object.status_transitions.paid_at * 1000) : object?.created ? new Date(object.created * 1000) : null) }
            ],
            actionUrl: object?.hosted_invoice_url || buildAppUrl("/subscription"),
            invoiceUrl: object?.hosted_invoice_url || object?.invoice_pdf || ""
          });
          logInfo("Stripe invoice.payment_succeeded synced for business:", businessId);
        }
      }
    } else if (event.type === "invoice.payment_failed") {
      // Stripe also fires customer.subscription.updated (status → past_due) which
      // handles the DB sync. Log here for observability and alerting.
      const customerId = object?.customer;
      const businessId = customerId
        ? await findBusinessByStripeCustomerId(customerId)
        : null;
      logWarn(
        "Stripe invoice.payment_failed — business:",
        businessId || "unknown",
        "invoice:",
        object?.id
      );
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    try {
      await releaseWebhookEvent(event.id);
    } catch (releaseErr) {
      logError("Stripe webhook idempotency release failed:", {
        eventId: event.id,
        err: releaseErr.message
      });
    }
    logError(
      "Stripe webhook processing error — event:",
      event.id,
      "type:",
      event.type,
      "error:",
      err.message
    );
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

module.exports = router;
