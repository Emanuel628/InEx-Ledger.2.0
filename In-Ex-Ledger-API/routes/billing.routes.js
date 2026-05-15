const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createBillingMutationLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setTrialPlanSelectionForBusiness,
  setFreePlanForBusiness
} = require("../services/subscriptionService.js");
const { buildStripePriceEnvMap, buildStripePriceLookup } = require("../services/stripePriceConfig.js");
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
const { addonPriceIds: STRIPE_ADDON_PRICE_IDS, metadataByPriceId: STRIPE_PRICE_METADATA_BY_ID } = buildStripePriceLookup();
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

function getConfiguredPriceId(envName, unavailableMessage) {
  if (!envName) {
    throw new BillingValidationError(unavailableMessage);
  }
  try {
    return requireEnvValue(envName);
  } catch (_) {
    throw new BillingValidationError(unavailableMessage);
  }
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
  const basePriceId = getConfiguredPriceId(
    baseEnv,
    "Pricing is not configured yet for the selected billing interval and currency."
  );
  let addonPriceId = null;
  if (additionalBusinesses > 0) {
    const addonEnv = ADDON_PRICE_ENV[interval]?.[normalizedCurrency];
    addonPriceId = getConfiguredPriceId(
      addonEnv,
      "Additional business pricing is not configured yet for the selected billing interval and currency."
    );
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

function escapeStripeSearchLiteral(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

async function findStripeCustomerByBusinessId(businessId) {
  if (!businessId) {
    return null;
  }

  const query = `metadata['business_id']:'${escapeStripeSearchLiteral(businessId)}'`;
  const payload = await stripeGet(
    `/customers/search?query=${encodeURIComponent(query)}&limit=1`
  );
  const customers = Array.isArray(payload?.data) ? payload.data : [];
  return customers[0] || null;
}

async function ensureStripeCustomer(businessId, user) {
  await getSubscriptionSnapshotForBusiness(businessId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockKey = BigInt("0x" + crypto.createHash("sha256").update(`stripe-customer:${businessId}`).digest("hex").slice(0, 15));
    await client.query("SELECT pg_advisory_xact_lock($1)", [String(lockKey)]);

    const existing = await client.query(
      `SELECT stripe_customer_id
         FROM business_subscriptions
        WHERE business_id = $1
        LIMIT 1`,
      [businessId]
    );

    const stripeCustomerId = existing.rows[0]?.stripe_customer_id;
    if (stripeCustomerId) {
      await client.query("COMMIT");
      return stripeCustomerId;
    }

    try {
      const existingStripeCustomer = await findStripeCustomerByBusinessId(businessId);
      if (existingStripeCustomer?.id) {
        await client.query(
          `UPDATE business_subscriptions
              SET stripe_customer_id = $2,
                  updated_at = NOW()
            WHERE business_id = $1`,
          [businessId, existingStripeCustomer.id]
        );
        await client.query("COMMIT");
        return existingStripeCustomer.id;
      }
    } catch (searchErr) {
      logWarn("Stripe customer metadata search failed before create", {
        businessId,
        userId: user?.id,
        err: searchErr.message
      });
    }

    const customer = await stripeRequest("/customers", {
      email: user.email,
      name: user.display_name || user.full_name || user.email,
      "metadata[business_id]": businessId,
      "metadata[user_id]": user.id
    });

    await client.query(
      `UPDATE business_subscriptions
          SET stripe_customer_id = $2,
              updated_at = NOW()
        WHERE business_id = $1`,
      [businessId, customer.id]
    );
    await client.query("COMMIT");
    return customer.id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function resolveBillingBusinessScope(user) {
  const activeBusinessId = await resolveBusinessIdForUser(user);
  const billingBusinessId =
    await findBillingAnchorBusinessIdForUser(user?.id, activeBusinessId) || activeBusinessId;
  return {
    activeBusinessId,
    billingBusinessId
  };
}

function hasBlockingStripeSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") {
    return false;
  }
  const status = String(subscription.status || "").toLowerCase();
  if (["active", "trialing", "past_due", "unpaid"].includes(status)) {
    return true;
  }
  return false;
}

async function findBlockingStripeSubscriptionForCustomer(stripeCustomerId) {
  if (!stripeCustomerId) {
    return null;
  }

  const latest = await stripeGet(
    `/subscriptions?customer=${encodeURIComponent(stripeCustomerId)}&status=all&limit=10`
  );
  const subscriptions = Array.isArray(latest?.data) ? latest.data : [];
  return subscriptions.find((item) => hasBlockingStripeSubscription(item)) || null;
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
  if (parsed.hostname === "inexledger.com") {
    parsed.hostname = "www.inexledger.com";
  }
  const normalizedBase = parsed.toString().replace(/\/+$/, "");
  return `${normalizedBase}${path.startsWith("/") ? path : `/${path}`}`;
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

function summarizeDefaultPaymentMethod(paymentMethod) {
  if (!paymentMethod || typeof paymentMethod !== "object") {
    return null;
  }

  if (paymentMethod.type === "card" && paymentMethod.card) {
    return {
      type: "card",
      brand: paymentMethod.card.brand || "card",
      last4: paymentMethod.card.last4 || "",
      expMonth: paymentMethod.card.exp_month || null,
      expYear: paymentMethod.card.exp_year || null
    };
  }

  if (paymentMethod.type === "us_bank_account" && paymentMethod.us_bank_account) {
    return {
      type: "us_bank_account",
      bankName: paymentMethod.us_bank_account.bank_name || "Bank account",
      last4: paymentMethod.us_bank_account.last4 || ""
    };
  }

  return {
    type: paymentMethod.type || "unknown"
  };
}

async function fetchBillingInvoicesForCustomer(stripeCustomerId, limit = 24) {
  if (!stripeCustomerId) {
    return [];
  }

  const payload = await stripeGet(
    `/invoices?customer=${encodeURIComponent(stripeCustomerId)}&limit=${Math.max(1, Math.min(limit, 24))}`
  );

  return (payload?.data || []).map((inv) => ({
    id: inv.id,
    number: inv.number,
    amount_paid: inv.amount_paid,
    amount_due: inv.amount_due,
    currency: inv.currency,
    status: inv.status,
    period_start: inv.period_start,
    period_end: inv.period_end,
    created: inv.created,
    hosted_invoice_url: inv.hosted_invoice_url,
    invoice_pdf: inv.invoice_pdf
  }));
}

async function fetchBillingOverviewForBusiness(billingBusinessId) {
  const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
  const stripeCustomerId = subscription?.stripeCustomerId || null;
  let paymentMethod = null;
  let invoices = [];

  if (stripeCustomerId) {
    const customer = await stripeGet(
      `/customers/${encodeURIComponent(stripeCustomerId)}?expand[]=invoice_settings.default_payment_method`
    );
    paymentMethod = summarizeDefaultPaymentMethod(customer?.invoice_settings?.default_payment_method || null);
    invoices = await fetchBillingInvoicesForCustomer(stripeCustomerId, 24);
  }

  return {
    subscription,
    paymentMethod,
    invoices,
    portalAvailable: Boolean(stripeCustomerId)
  };
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
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    let subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    if (!subscription.isPaid && subscription.stripeCustomerId) {
      try {
        const stripeSubscription = await findBlockingStripeSubscriptionForCustomer(subscription.stripeCustomerId);

        if (stripeSubscription) {
          await syncStripeSubscriptionForBusiness(billingBusinessId, stripeSubscription);
          subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
        }
      } catch (syncErr) {
        logWarn("GET /api/billing/subscription self-heal sync skipped:", {
          businessId: billingBusinessId,
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

function isMockBillingAllowed() {
  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const mockEnabled = process.env.ENABLE_MOCK_BILLING === "true";
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  const isLiveStripeKey = /^sk_live_/i.test(stripeSecretKey);
  return mockEnabled && !isProduction && !isLiveStripeKey;
}

router.get("/mock-v1", requireAuth, async (_req, res) => {
  if (!isMockBillingAllowed()) {
    return res.status(404).json({ error: "Not found." });
  }
  res.json({ enabled: true });
});

router.post("/mock-v1", requireAuth, requireCsrfProtection, async (req, res) => {
  if (!isMockBillingAllowed()) {
    return res.status(404).json({ error: "Not found." });
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
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    let subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);

    if (isTrialReupgradeAttempt(subscription)) {
      await pool.query(
        `UPDATE business_subscriptions
            SET cancel_at_period_end = false,
                canceled_at = NULL,
                updated_at = NOW()
          WHERE business_id = $1
            AND status = 'trialing'`,
        [billingBusinessId]
      );
      logInfo("Normalized downgraded trial before checkout", {
        businessId: billingBusinessId,
        userId: req.user?.id,
        selectedPlanCode: subscription.selectedPlanCode,
        trialPlanSelection: subscription.trialPlanSelection
      });
      subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    }

    const blockingStatus = getCheckoutBlockingStatus(subscription);
    if (subscription.stripeSubscriptionId && (blockingStatus === "past_due" || blockingStatus === "unpaid")) {
      return res.status(409).json({
        error: blockingStatus === "unpaid"
          ? "This account has an unpaid Stripe subscription. Update the payment method in Subscription before starting another checkout."
          : "This account already has a past-due Stripe subscription. Resolve the existing billing issue in Subscription before starting another checkout."
      });
    }

    if (subscription.isPaid && !subscription.cancelAtPeriodEnd && !subscription.isCanceledWithRemainingAccess) {
      return res.status(409).json({
        error: "This account already has paid Pro access or an overlapping paid period. Use Subscription to manage it instead of starting another checkout."
      });
    }

    if (subscription.cancelAtPeriodEnd && subscription.stripeSubscriptionId && !subscription.isTrialing) {
      return res.status(409).json({
        error: "This Pro subscription is already active and scheduled to end. Use Keep Pro active instead of starting another checkout."
      });
    }

    const billingContext = await resolveBillingContext(req);
    const requestedCurrency = String(req.body?.currency || "").trim().toLowerCase();
    if (
        requestedCurrency &&
        BILLING_CURRENCIES.has(requestedCurrency) &&
        requestedCurrency !== billingContext.currency
    ) {
      logWarn("Ignored client-supplied billing currency in favor of verified billing context", {
        userId: req.user?.id,
        businessId: billingBusinessId,
        requestedCurrency,
        resolvedCurrency: billingContext.currency,
        billingSource: billingContext.source
      });
    }
    const checkoutCurrency = resolveCheckoutCurrency(subscription, billingContext);
    if (checkoutCurrency !== billingContext.currency) {
      logInfo("Using existing subscription currency for checkout", {
        userId: req.user?.id,
        businessId: billingBusinessId,
        subscriptionCurrency: checkoutCurrency,
        resolvedCurrency: billingContext.currency,
        billingSource: billingContext.source
      });
    }
    const priceSelection = resolveStripePriceSelection({
      billingInterval: req.body?.billingInterval,
      currency: checkoutCurrency,
      additionalBusinesses
    });

    const customerId = await ensureStripeCustomer(billingBusinessId, req.user);
    const blockingSubscription = await findBlockingStripeSubscriptionForCustomer(customerId);
    if (blockingSubscription) {
      if (!subscription.isPaid) {
        await syncStripeSubscriptionForBusiness(billingBusinessId, blockingSubscription);
      }
      return res.status(409).json({
        error: "This account already has an active or overlapping Stripe subscription. Manage it from Subscription instead of starting another checkout."
      });
    }
    const sessionPayload = {
      mode: "subscription",
      customer: customerId,
      allow_promotion_codes: true,
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

    if (subscription.isTrialing && subscription.trialEndsAt) {
      const trialEndUnix = Math.floor(new Date(subscription.trialEndsAt).getTime() / 1000);
      if (trialEndUnix > Math.floor(Date.now() / 1000)) {
        sessionPayload["subscription_data[trial_end]"] = trialEndUnix;
      }
    }

    const session = await stripeRequest("/checkout/sessions", sessionPayload, {
      idempotencyKey: buildCheckoutIdempotencyKey({
        businessId: billingBusinessId,
        billingInterval: priceSelection.billingInterval,
        currency: priceSelection.currency,
        additionalBusinesses,
        userId: req.user?.id
      })
    });
    logInfo("Billing checkout session created", {
      userId: req.user?.id,
      businessId: billingBusinessId,
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
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const customerId = await ensureStripeCustomer(billingBusinessId, req.user);
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: customerId,
      return_url: buildAppUrl("/subscription")
    });
    logInfo("Billing portal session created", {
      userId: req.user?.id,
      businessId: billingBusinessId
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    logError("POST /api/billing/customer-portal error:", err.message);
    res.status(500).json({ error: "Failed to open billing portal." });
  }
});

router.post("/resume", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    let subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    if (subscription.isTrialing) {
      await setTrialPlanSelectionForBusiness(
        billingBusinessId,
        "v1",
        normalizeAdditionalBusinesses(subscription.additionalBusinesses)
      );
      subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
      return res.status(200).json({ subscription });
    }

    if (!subscription.cancelAtPeriodEnd) {
      return res.status(200).json({ subscription });
    }

    if (!subscription.stripeSubscriptionId) {
      await pool.query(
        `UPDATE business_subscriptions
            SET cancel_at_period_end = false,
                canceled_at = NULL,
                updated_at = NOW()
          WHERE business_id = $1`,
        [billingBusinessId]
      );
      subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
      return res.status(200).json({ subscription });
    }

    await stripeRequest(`/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`, {
      cancel_at_period_end: false,
      proration_behavior: "none"
    });
    const stripeSubscription = await stripeGet(
      `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`
    );
    await syncStripeSubscriptionForBusiness(billingBusinessId, stripeSubscription);
    subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    res.status(200).json({ subscription });
  } catch (err) {
    logError("POST /api/billing/resume error:", err.message);
    res.status(500).json({ error: "Failed to resume subscription." });
  }
});

router.post("/cancel", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);

    if (subscription.isTrialing && !subscription.stripeSubscriptionId) {
      await setTrialPlanSelectionForBusiness(billingBusinessId, "free");
      const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);
      return res.status(200).json({ subscription: updated });
    }

    if (!subscription.stripeSubscriptionId) {
      // No Stripe subscription — just downgrade to free immediately
      await setFreePlanForBusiness(billingBusinessId);
      const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);
      await sendBillingEmail({
        businessId: billingBusinessId,
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
      await syncStripeSubscriptionForBusiness(billingBusinessId, stripeSub);
    }

    const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    await sendBillingEmail({
      businessId: billingBusinessId,
      kind: "canceling",
      details: [
        { label: "Plan", value: updated.effectiveTierName || "Pro" },
        { label: "Access until", value: formatDateLabel(updated.currentPeriodEnd) }
      ],
      actionUrl: buildAppUrl("/subscription")
    });
    logInfo("Billing cancellation scheduled", {
      userId: req.user?.id,
      businessId: billingBusinessId,
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
  return new Set(STRIPE_ADDON_PRICE_IDS);
}

function resolveSubscriptionBillingTerms(subscription, stripeSub) {
  const stripeItems = Array.isArray(stripeSub?.items?.data) ? stripeSub.items.data : [];
  const addonItem = stripeItems.find((item) => STRIPE_ADDON_PRICE_IDS.has(item?.price?.id)) || null;
  const baseItem = stripeItems.find((item) => !STRIPE_ADDON_PRICE_IDS.has(item?.price?.id)) || null;
  const subscriptionMeta = stripeSub?.metadata && typeof stripeSub.metadata === "object"
    ? stripeSub.metadata
    : {};
  const basePriceMeta = baseItem?.price?.id ? STRIPE_PRICE_METADATA_BY_ID.get(baseItem.price.id) : null;
  const addonPriceMeta = addonItem?.price?.id ? STRIPE_PRICE_METADATA_BY_ID.get(addonItem.price.id) : null;
  const stripePriceCurrency = normalizeOptionalCurrency(baseItem?.price?.currency || addonItem?.price?.currency);
  const stripeRecurringInterval = normalizeOptionalBillingInterval(
    baseItem?.price?.recurring?.interval || addonItem?.price?.recurring?.interval
  );

  return {
    billingInterval: normalizeOptionalBillingInterval(subscription?.billingInterval) ||
      normalizeOptionalBillingInterval(subscriptionMeta.billing_interval) ||
      normalizeOptionalBillingInterval(basePriceMeta?.billingInterval) ||
      normalizeOptionalBillingInterval(addonPriceMeta?.billingInterval) ||
      stripeRecurringInterval ||
      "monthly",
    currency: normalizeOptionalCurrency(subscription?.currency) ||
      normalizeOptionalCurrency(subscriptionMeta.currency) ||
      normalizeOptionalCurrency(basePriceMeta?.currency) ||
      normalizeOptionalCurrency(addonPriceMeta?.currency) ||
      stripePriceCurrency ||
      "usd"
  };
}

function resolveAddonPriceIdForSubscription(subscription, stripeSub) {
  const { billingInterval, currency } = resolveSubscriptionBillingTerms(subscription, stripeSub);
  const addonEnv = ADDON_PRICE_ENV[billingInterval]?.[currency];
  return getConfiguredPriceId(
    addonEnv,
    "Additional business pricing is not configured yet for your billing interval and currency."
  );
}

function resolveCheckoutCurrency(subscription, billingContext) {
  const subscriptionCurrency = normalizeOptionalCurrency(subscription?.currency);
  if (subscriptionCurrency) {
    return subscriptionCurrency;
  }
  return normalizeCurrency(billingContext?.currency || "usd");
}

function getCheckoutBlockingStatus(subscription = {}) {
  return String(subscription?.effectiveStatus || subscription?.status || "").trim().toLowerCase();
}

function buildCheckoutIdempotencyKey({ businessId, billingInterval, currency, additionalBusinesses, userId }) {
  const digest = crypto
    .createHash("sha256")
    .update([
      "checkout",
      businessId,
      billingInterval,
      currency,
      String(additionalBusinesses),
      userId || "anonymous"
    ].join(":"))
    .digest("hex")
    .slice(0, 32);

  return `checkout:${businessId}:${digest}`;
}

router.patch("/additional-businesses", requireAuth, requireCsrfProtection, billingMutationLimiter, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    const hasActiveProAccess =
      subscription.effectiveTier === "v1" &&
      (subscription.isPaid || subscription.isTrialing);

    if (!hasActiveProAccess) {
      return res.status(403).json({
        error: "Additional business slots require an active Pro subscription."
      });
    }
    if (subscription.cancelAtPeriodEnd && !subscription.isTrialing) {
      return res.status(409).json({
        error: "Cannot change business slots while cancellation is pending. Resume Pro to make changes."
      });
    }
    if (subscription.isCanceledWithRemainingAccess) {
      return res.status(409).json({
        error: "Your Pro subscription has already been canceled. Start a new Pro subscription before changing business slots."
      });
    }
    if (subscription.isTrialing && !subscription.stripeSubscriptionId) {
      const additionalBusinesses = normalizeAdditionalBusinesses(req.body?.additionalBusinesses);
      await pool.query(
        `UPDATE business_subscriptions
            SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('additional_businesses', $2::integer),
                updated_at = NOW()
          WHERE business_id = $1`,
        [billingBusinessId, additionalBusinesses]
      );
      const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);
      logInfo("Trial business slots updated locally", {
        userId: req.user?.id,
        businessId: billingBusinessId,
        newAdditionalBusinesses: additionalBusinesses
      });
      return res.status(200).json({ subscription: updated });
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
      const addonPriceId = resolveAddonPriceIdForSubscription(subscription, stripeSub);
      updatedSub = await stripeRequest(
        `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
        {
          "items[0][price]": addonPriceId,
          "items[0][quantity]": additionalBusinesses,
          proration_behavior: "create_prorations"
        }
      );
    }

    await syncStripeSubscriptionForBusiness(billingBusinessId, updatedSub);
    const updated = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    logInfo("Business slots updated", {
      userId: req.user?.id,
      businessId: billingBusinessId,
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

router.get("/overview", billingReadLimiter, requireAuth, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const overview = await fetchBillingOverviewForBusiness(billingBusinessId);
    res.status(200).json(overview);
  } catch (err) {
    logError("GET /api/billing/overview error:", err.message);
    res.status(500).json({ error: "Failed to load billing overview." });
  }
});

router.get("/history", billingReadLimiter, requireAuth, async (req, res) => {
  try {
    const { billingBusinessId } = await resolveBillingBusinessScope(req.user);
    const subRow = await pool.query(
      "SELECT stripe_customer_id FROM business_subscriptions WHERE business_id = $1 LIMIT 1",
      [billingBusinessId]
    );

    const stripeCustomerId = subRow.rows[0]?.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.status(200).json({ invoices: [] });
    }

    const invoices = await fetchBillingInvoicesForCustomer(stripeCustomerId, 24);
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
      const customerId = object?.customer;
      const businessId = customerId
        ? await findBusinessByStripeCustomerId(customerId)
        : null;
      if (businessId) {
        await sendBillingEmail({
          businessId,
          kind: "payment_failed",
          details: [
            { label: "Amount due", value: formatBillingCurrencyAmount(object?.amount_due, object?.currency) },
            { label: "Invoice", value: String(object?.number || object?.id || "-") },
            { label: "Attempted on", value: formatDateLabel(object?.created ? new Date(object.created * 1000) : null) }
          ],
          actionUrl: buildAppUrl("/subscription"),
          invoiceUrl: object?.hosted_invoice_url || object?.invoice_pdf || ""
        });
      }
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
