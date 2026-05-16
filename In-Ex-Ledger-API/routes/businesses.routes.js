const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { requireAuth, requireMfaIfEnabled } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createBusinessDeleteLimiter } = require("../middleware/rateLimitTiers.js");
const {
  resolveBusinessIdForUser,
  listBusinessesForUser,
  setActiveBusinessForUser,
  createBusinessForUserInTransaction
} = require("../api/utils/resolveBusinessIdForUser.js");
const {
  PLAN_V1,
  findBillingAnchorBusinessIdForUser,
  getSubscriptionSnapshotForBusiness,
  syncStripeSubscriptionForBusiness
} = require("../services/subscriptionService.js");
const { buildStripePriceEnvMap, buildStripePriceLookup } = require("../services/stripePriceConfig.js");
const { decryptTaxId, encryptTaxId } = require("../services/taxIdService.js");
const { verifyPassword } = require("../utils/authUtils.js");
const { isManagedReceiptPath } = require("../services/receiptStorage.js");
const {
  getPreferredLanguageForUser,
  buildBusinessLifecycleEmail
} = require("../services/emailI18nService.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { stripeRequest, stripeGet } = require("../services/stripeClient.js");
const { normalizeFiscalYearStart } = require("../utils/fiscalYear.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const businessDeleteLimiter = createBusinessDeleteLimiter();
const { addonPriceIds: STRIPE_ADDON_PRICE_IDS } = buildStripePriceLookup();
const { base: BASE_PRICE_ENV, addon: ADDON_PRICE_ENV } = buildStripePriceEnvMap();
const VALID_REGIONS = new Set(["US", "CA"]);
const VALID_LANGUAGES = new Set(["en", "es", "fr"]);
const CA_PROVINCES = new Set(["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"]);
const VALID_ACCOUNTING_METHODS = new Set(["cash", "accrual"]);
const VALID_GST_HST_METHODS = new Set(["regular", "quick"]);
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "InEx Ledger <noreply@inexledger.com>";
let resendClient = null;

function getResend() {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
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

function normalizeBillingCurrency(currency) {
  return String(currency || "usd").trim().toLowerCase() === "cad" ? "cad" : "usd";
}

function normalizeBillingInterval(interval) {
  return String(interval || "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";
}

function parseStripeUnitAmount(price) {
  const raw = price?.unit_amount_decimal ?? price?.unit_amount;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    throw new Error("Stripe price is missing a valid unit amount");
  }
  return numeric / 100;
}

async function buildVerifiedPricingTable(currency) {
  const normalizedCurrency = normalizeBillingCurrency(currency);
  const monthlyBaseEnv = BASE_PRICE_ENV.monthly?.[normalizedCurrency];
  const yearlyBaseEnv = BASE_PRICE_ENV.yearly?.[normalizedCurrency];
  const monthlyAddonEnv = ADDON_PRICE_ENV.monthly?.[normalizedCurrency];
  const yearlyAddonEnv = ADDON_PRICE_ENV.yearly?.[normalizedCurrency];

  const [monthlyBasePrice, yearlyBasePrice, monthlyAddonPrice, yearlyAddonPrice] = await Promise.all([
    stripeGet(`/prices/${encodeURIComponent(process.env[monthlyBaseEnv] || "")}`),
    stripeGet(`/prices/${encodeURIComponent(process.env[yearlyBaseEnv] || "")}`),
    stripeGet(`/prices/${encodeURIComponent(process.env[monthlyAddonEnv] || "")}`),
    stripeGet(`/prices/${encodeURIComponent(process.env[yearlyAddonEnv] || "")}`)
  ]);

  return {
    monthly: {
      base: parseStripeUnitAmount(monthlyBasePrice),
      addon: parseStripeUnitAmount(monthlyAddonPrice)
    },
    yearly: {
      base: parseStripeUnitAmount(yearlyBasePrice),
      addon: parseStripeUnitAmount(yearlyAddonPrice)
    }
  };
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

async function buildBusinessLifecycleDetails(subscription, businessCount) {
  const safeBusinessCount = Math.max(Number(businessCount) || 0, 0);
  const additionalBusinesses = Math.max(Number(subscription?.additionalBusinesses || 0), 0);
  const currency = normalizeBillingCurrency(subscription?.currency);
  const interval = normalizeBillingInterval(subscription?.billingInterval);
  const details = [
    { label: "Businesses now", value: String(safeBusinessCount) },
    { label: "Paid add-on slots", value: String(additionalBusinesses) }
  ];

  if (!subscription || subscription.effectiveTier !== PLAN_V1) {
    details.push({ label: "Updated monthly total", value: `${formatBillingCurrencyAmount(0, currency)} / month` });
    return details;
  }

  if (subscription.isTrialing) {
    details.push({ label: "Updated monthly total", value: `${formatBillingCurrencyAmount(0, currency)} during trial` });
    return details;
  }

  const pricing = await buildVerifiedPricingTable(currency);
  const activePricing = pricing[interval];
  const monthlyPricing = pricing.monthly;
  const billedTotal = activePricing.base + (activePricing.addon * additionalBusinesses);
  const monthlyEquivalent = monthlyPricing.base + (monthlyPricing.addon * additionalBusinesses);

  details.push({
    label: interval === "yearly" ? "Updated billed total" : "Updated monthly total",
    value: `${formatBillingCurrencyAmount(billedTotal, currency)} / ${interval === "yearly" ? "year" : "month"}`
  });

  if (interval === "yearly") {
    details.push({
      label: "Monthly equivalent",
      value: `${formatBillingCurrencyAmount(monthlyEquivalent, currency)} / month`
    });
  }

  return details;
}

async function sendBusinessLifecycleEmail({ userId, kind, businessName, subscription, businessCount }) {
  try {
    if (!userId) {
      return;
    }

    const contactResult = await pool.query(
      `SELECT email
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [userId]
    );
    const contact = contactResult.rows[0] || null;
    if (!contact?.email) {
      return;
    }

    const lang = await getPreferredLanguageForUser(userId);
    const details = [
      { label: "Business", value: businessName || "Business" },
      ...(await buildBusinessLifecycleDetails(subscription, businessCount))
    ];
    const actionUrl = buildAppUrl("/subscription");
    const emailContent = buildBusinessLifecycleEmail(lang, kind, {
      details,
      actionUrl
    });

    await getResend().emails.send({
      from: RESEND_FROM_EMAIL,
      to: contact.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    });
    logInfo("Business lifecycle email sent", { userId, kind, to: contact.email });
  } catch (err) {
    logWarn("Business lifecycle email failed", {
      userId,
      kind,
      err: err.message
    });
  }
}

async function updateAnchorAdditionalBusinesses(client, businessId, additionalBusinesses) {
  await client.query(
    `UPDATE business_subscriptions
        SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('additional_businesses', $2::integer),
            updated_at = NOW()
      WHERE business_id = $1`,
    [businessId, additionalBusinesses]
  );
}

async function migrateBillingAnchorSubscription(client, sourceBusinessId, targetBusinessId, additionalBusinesses) {
  const sourceResult = await client.query(
    `SELECT provider, plan_code, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
            trial_started_at, trial_ends_at, current_period_start, current_period_end,
            cancel_at_period_end, canceled_at, metadata_json
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [sourceBusinessId]
  );

  if (!sourceResult.rowCount) {
    return;
  }

  const source = sourceResult.rows[0];
  const nextMetadata = {
    ...(source?.metadata_json && typeof source.metadata_json === "object" ? source.metadata_json : {}),
    additional_businesses: additionalBusinesses
  };

  await client.query(
    `INSERT INTO business_subscriptions (
        id, business_id, provider, plan_code, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        trial_started_at, trial_ends_at, current_period_start, current_period_end,
        cancel_at_period_end, canceled_at, metadata_json
     )
     VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15::jsonb
     )
     ON CONFLICT (business_id) DO UPDATE
       SET provider = EXCLUDED.provider,
           plan_code = EXCLUDED.plan_code,
           status = EXCLUDED.status,
           stripe_customer_id = EXCLUDED.stripe_customer_id,
           stripe_subscription_id = EXCLUDED.stripe_subscription_id,
           stripe_price_id = EXCLUDED.stripe_price_id,
           trial_started_at = EXCLUDED.trial_started_at,
           trial_ends_at = EXCLUDED.trial_ends_at,
           current_period_start = EXCLUDED.current_period_start,
           current_period_end = EXCLUDED.current_period_end,
           cancel_at_period_end = EXCLUDED.cancel_at_period_end,
           canceled_at = EXCLUDED.canceled_at,
           metadata_json = EXCLUDED.metadata_json,
           updated_at = NOW()`,
    [
      crypto.randomUUID(),
      targetBusinessId,
      source.provider,
      source.plan_code,
      source.status,
      source.stripe_customer_id,
      source.stripe_subscription_id,
      source.stripe_price_id,
      source.trial_started_at,
      source.trial_ends_at,
      source.current_period_start,
      source.current_period_end,
      Boolean(source.cancel_at_period_end),
      source.canceled_at,
      JSON.stringify(nextMetadata)
    ]
  );
}

async function syncStripeBusinessSlotsAfterDelete({
  billingBusinessId,
  successorBusinessId,
  subscription,
  additionalBusinesses
}) {
  if (!billingBusinessId || !subscription?.stripeSubscriptionId) {
    return;
  }

  const stripeSub = await stripeGet(
    `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`
  );
  const items = Array.isArray(stripeSub.items?.data) ? stripeSub.items.data : [];
  const existingAddonItem = items.find((item) => STRIPE_ADDON_PRICE_IDS.has(item?.price?.id)) || null;
  const nextBusinessId = billingBusinessId;
  const movedAnchor = Boolean(subscription?.businessId && subscription.businessId !== billingBusinessId);

  let updatedSub = stripeSub;
  if (additionalBusinesses === 0 && existingAddonItem) {
    updatedSub = await stripeRequest(
      `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
      {
        "items[0][id]": existingAddonItem.id,
        "items[0][deleted]": "true",
        "metadata[business_id]": nextBusinessId,
        "metadata[additional_businesses]": additionalBusinesses,
        proration_behavior: "create_prorations"
      }
    );
  } else if (existingAddonItem) {
    updatedSub = await stripeRequest(
      `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
      {
        "items[0][id]": existingAddonItem.id,
        "items[0][quantity]": additionalBusinesses,
        "metadata[business_id]": nextBusinessId,
        "metadata[additional_businesses]": additionalBusinesses,
        proration_behavior: "create_prorations"
      }
    );
  } else if (movedAnchor) {
    updatedSub = await stripeRequest(
      `/subscriptions/${encodeURIComponent(subscription.stripeSubscriptionId)}`,
      {
        "metadata[business_id]": nextBusinessId,
        "metadata[additional_businesses]": additionalBusinesses
      }
    );
  }

  if (subscription?.stripeCustomerId && movedAnchor) {
    await stripeRequest(`/customers/${encodeURIComponent(subscription.stripeCustomerId)}`, {
      "metadata[business_id]": nextBusinessId
    });
  }

  await syncStripeSubscriptionForBusiness(nextBusinessId, updatedSub);
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
    business_type: row.business_type || null,
    operating_name: row.operating_name || null,
    business_activity_code: row.business_activity_code || null,
    accounting_method: row.accounting_method || null,
    material_participation: typeof row.material_participation === "boolean" ? row.material_participation : null,
    gst_hst_registered: row.gst_hst_registered === true,
    gst_hst_number: row.gst_hst_number || null,
    gst_hst_method: row.gst_hst_method || null,
    locked_through_date: row.locked_through_date || null,
    locked_period_note: row.locked_period_note || null,
    locked_period_updated_at: row.locked_period_updated_at || null
  };
}

async function fetchOwnedBusinessProfile(userId, businessId) {
  const result = await pool.query(
    `SELECT id, name, region, language, fiscal_year_start, province,
            business_type, tax_id, address, operating_name,
            business_activity_code, accounting_method, material_participation,
            gst_hst_registered, gst_hst_number, gst_hst_method,
            locked_through_date, locked_period_note,
            locked_period_updated_at, created_at
       FROM businesses
      WHERE id = $1
        AND user_id = $2
      LIMIT 1`,
    [businessId, userId]
  );

  return normalizeBusinessProfileRow(result.rows[0] || null);
}

async function updateOwnedBusinessProfile(userId, businessId, payload = {}) {
  const current = await fetchOwnedBusinessProfile(userId, businessId);
  if (!current) {
    return null;
  }

  const {
    name,
    region,
    language,
    fiscal_year_start,
    province,
    business_type,
    tax_id,
    address,
    operating_name,
    business_activity_code,
    accounting_method,
    material_participation,
    gst_hst_registered,
    gst_hst_number,
    gst_hst_method
  } = payload;

  const resolvedRegion = String(region || current.region || "US").trim().toUpperCase();
  const resolvedProvince = resolvedRegion === "CA"
    ? String(province || current.province || "").trim().toUpperCase() || null
    : null;
  const normalizedFiscalYear = Object.prototype.hasOwnProperty.call(payload, "fiscal_year_start")
    ? normalizeFiscalYearStart(fiscal_year_start)
    : { valid: true, value: current.fiscal_year_start };

  if (region && !VALID_REGIONS.has(resolvedRegion)) {
    return { error: "region must be 'US' or 'CA'" };
  }
  if (language && !VALID_LANGUAGES.has(String(language))) {
    return { error: "language must be 'en', 'es', or 'fr'" };
  }
  if (!normalizedFiscalYear.valid) {
    return { error: normalizedFiscalYear.error };
  }
  if (resolvedProvince && !CA_PROVINCES.has(resolvedProvince)) {
    return { error: "Invalid Canadian province code" };
  }
  if (resolvedRegion === "CA" && !resolvedProvince) {
    return { error: "Province is required for Canadian businesses." };
  }
  if (accounting_method && !VALID_ACCOUNTING_METHODS.has(String(accounting_method).trim().toLowerCase())) {
    return { error: "accounting_method must be 'cash' or 'accrual'" };
  }
  if (gst_hst_method && !VALID_GST_HST_METHODS.has(String(gst_hst_method).trim().toLowerCase())) {
    return { error: "gst_hst_method must be 'regular' or 'quick'" };
  }
  if (Object.prototype.hasOwnProperty.call(payload, "material_participation") && typeof material_participation !== "boolean") {
    return { error: "material_participation must be a boolean" };
  }
  if (Object.prototype.hasOwnProperty.call(payload, "gst_hst_registered") && typeof gst_hst_registered !== "boolean") {
    return { error: "gst_hst_registered must be a boolean" };
  }

  const normalizedTaxId = Object.prototype.hasOwnProperty.call(payload, "tax_id")
    ? normalizeOptionalTrimmedString(tax_id)
    : current.tax_id;
  const resolvedGstRegistered = Object.prototype.hasOwnProperty.call(payload, "gst_hst_registered")
    ? gst_hst_registered
    : current.gst_hst_registered;

  const result = await pool.query(
    `UPDATE businesses
        SET name = COALESCE($1, name),
            region = COALESCE($2, region),
            language = COALESCE($3, language),
            fiscal_year_start = COALESCE($4, fiscal_year_start),
            province = $5,
            business_type = $6,
            tax_id = $7,
            address = $8,
            operating_name = $9,
            business_activity_code = $10,
            accounting_method = $11,
            material_participation = $12,
            gst_hst_registered = $13,
            gst_hst_number = $14,
            gst_hst_method = $15
      WHERE id = $16
        AND user_id = $17
      RETURNING id, name, region, language, fiscal_year_start, province,
                business_type, tax_id, address, operating_name,
                business_activity_code, accounting_method, material_participation,
                gst_hst_registered, gst_hst_number, gst_hst_method,
                locked_through_date, locked_period_note,
                locked_period_updated_at, created_at`,
    [
      normalizeOptionalTrimmedString(name),
      resolvedRegion,
      language || null,
      normalizedFiscalYear.value,
      resolvedProvince,
      Object.prototype.hasOwnProperty.call(payload, "business_type")
        ? normalizeOptionalTrimmedString(business_type)
        : current.business_type,
      normalizedTaxId ? encryptTaxId(normalizedTaxId) : null,
      Object.prototype.hasOwnProperty.call(payload, "address")
        ? normalizeOptionalTrimmedString(address)
        : current.address,
      Object.prototype.hasOwnProperty.call(payload, "operating_name")
        ? normalizeOptionalTrimmedString(operating_name)
        : current.operating_name,
      Object.prototype.hasOwnProperty.call(payload, "business_activity_code")
        ? normalizeOptionalTrimmedString(business_activity_code)
        : current.business_activity_code,
      Object.prototype.hasOwnProperty.call(payload, "accounting_method")
        ? normalizeOptionalTrimmedString(String(accounting_method || "").toLowerCase())
        : current.accounting_method,
      Object.prototype.hasOwnProperty.call(payload, "material_participation")
        ? material_participation
        : current.material_participation,
      resolvedRegion === "CA" ? resolvedGstRegistered : false,
      resolvedRegion === "CA" && resolvedGstRegistered
        ? normalizeOptionalTrimmedString(gst_hst_number)
        : null,
      resolvedRegion === "CA" && resolvedGstRegistered
        ? normalizeOptionalTrimmedString(String(gst_hst_method || "").toLowerCase())
        : null,
      businessId,
      userId
    ]
  );

  return { business: normalizeBusinessProfileRow(result.rows[0] || null) };
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

router.get("/", async (req, res) => {
  try {
    const activeBusinessId = await resolveBusinessIdForUser(req.user);
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === activeBusinessId) || null;

    res.json({
      active_business_id: activeBusinessId,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    logError("GET /businesses error:", err.message);
    res.status(500).json({ error: "Failed to load businesses." });
  }
});

router.get("/:id/profile", async (req, res) => {
  try {
    const business = await fetchOwnedBusinessProfile(req.user.id, req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found." });
    }
    res.json(business);
  } catch (err) {
    logError("GET /businesses/:id/profile error:", err.message);
    res.status(500).json({ error: "Failed to load business profile." });
  }
});

router.put("/:id/profile", async (req, res) => {
  try {
    const result = await updateOwnedBusinessProfile(req.user.id, req.params.id, req.body ?? {});
    if (!result) {
      return res.status(404).json({ error: "Business not found." });
    }
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result.business);
  } catch (err) {
    logError("PUT /businesses/:id/profile error:", err.message);
    res.status(500).json({ error: "Failed to update business profile." });
  }
});

router.post("/", async (req, res) => {
  const validation = normalizeBusinessPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const client = await pool.connect();
  try {
    const activeBusinessId = await resolveBusinessIdForUser(req.user, { seedDefaults: false });
    const billingBusinessId =
      await findBillingAnchorBusinessIdForUser(req.user.id, activeBusinessId) || activeBusinessId;
    const subscription = await getSubscriptionSnapshotForBusiness(billingBusinessId);
    const maxBusinessesAllowed = Number(subscription?.maxBusinessesAllowed || 1);

    await client.query("BEGIN");
    const lockKey = BigInt("0x" + crypto.createHash("sha256").update(String(req.user.id)).digest("hex").slice(0, 15));
    await client.query("SELECT pg_advisory_xact_lock($1)", [String(lockKey)]);

    const businessCountResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM businesses WHERE user_id = $1",
      [req.user.id]
    );
    const businessCount = Number(businessCountResult.rows[0]?.count || 0);

    if (businessCount >= maxBusinessesAllowed) {
      await client.query("ROLLBACK");
      return res.status(402).json({
        error: buildBusinessLimitError(subscription, maxBusinessesAllowed),
        code: "additional_business_payment_required",
        max_businesses_allowed: maxBusinessesAllowed,
        current_business_count: businessCount,
        subscription
      });
    }

    const businessId = await createBusinessForUserInTransaction(client, req.user, validation.normalized);

    // Pre-seed the subscription so the new business inherits the anchor's state
    // instead of getting its own fresh 30-day trial.
    if (subscription.isPaid) {
      await client.query(
        `INSERT INTO business_subscriptions
           (id, business_id, provider, plan_code, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'stripe', $3, 'active', $4, $5)
         ON CONFLICT (business_id) DO NOTHING`,
        [crypto.randomUUID(), businessId, PLAN_V1,
         subscription.currentPeriodStart || new Date(),
         subscription.currentPeriodEnd || null]
      );
    } else if (subscription.isTrialing && subscription.trialEndsAt) {
      // Match the anchor's trial window — don't give the new business its own fresh trial
      await client.query(
        `INSERT INTO business_subscriptions
           (id, business_id, provider, plan_code, status,
            trial_started_at, trial_ends_at, current_period_start, current_period_end)
         VALUES ($1, $2, 'stripe', $3, 'trialing', $4, $5, $4, $5)
         ON CONFLICT (business_id) DO NOTHING`,
        [crypto.randomUUID(), businessId, PLAN_V1,
         subscription.trialStartedAt || new Date(),
         new Date(subscription.trialEndsAt)]
      );
    }

    await client.query("COMMIT");
    req.user.business_id = businessId;
    const nextBusinesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = nextBusinesses.find((business) => business.id === businessId) || null;
    const nextBillingBusinessId =
      await findBillingAnchorBusinessIdForUser(req.user.id, activeBusinessId) || activeBusinessId;
    const nextSubscription = nextBillingBusinessId
      ? await getSubscriptionSnapshotForBusiness(nextBillingBusinessId)
      : null;

    await sendBusinessLifecycleEmail({
      userId: req.user.id,
      kind: "added",
      businessName: activeBusiness?.name || validation.normalized.name,
      subscription: nextSubscription,
      businessCount: nextBusinesses.length
    });

    res.status(201).json({
      active_business_id: businessId,
      active_business: activeBusiness,
      businesses: nextBusinesses
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // noop
    }
    logError("POST /businesses error:", err.message);
    res.status(500).json({ error: "Failed to create business." });
  } finally {
    client.release();
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const updated = await setActiveBusinessForUser(req.user.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ error: "Business not found." });
    }

    req.user.business_id = req.params.id;
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === req.params.id) || null;

    res.json({
      active_business_id: req.params.id,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    logError("POST /businesses/:id/activate error:", err.message);
    res.status(500).json({ error: "Failed to switch business." });
  }
});

/**
 * DELETE /api/businesses/:id
 * Delete a business account and all its associated data.
 * Requires password confirmation. Cannot delete the user's only business.
 */
router.delete("/:id", businessDeleteLimiter, requireMfaIfEnabled, async (req, res) => {
  const { password } = req.body ?? {};
  const businessId = req.params.id;

  if (!password) {
    return res.status(400).json({ error: "Password is required to delete a business." });
  }

  try {
    // Verify that the business belongs to this user
    const ownerCheck = await pool.query(
      "SELECT id, name FROM businesses WHERE id = $1 AND user_id = $2 LIMIT 1",
      [businessId, req.user.id]
    );
    if (!ownerCheck.rowCount) {
      return res.status(404).json({ error: "Business not found." });
    }
    const businessName = ownerCheck.rows[0]?.name || "Business";

    const activeBusinessId = await resolveBusinessIdForUser(req.user, { seedDefaults: false });
    const billingBusinessId =
      await findBillingAnchorBusinessIdForUser(req.user.id, activeBusinessId) || activeBusinessId;
    const subscription = billingBusinessId
      ? await getSubscriptionSnapshotForBusiness(billingBusinessId)
      : null;

    // Prevent deletion of the user's only business
    const countCheck = await pool.query(
      "SELECT COUNT(*)::int AS count FROM businesses WHERE user_id = $1",
      [req.user.id]
    );
    const currentBusinessCount = Number(countCheck.rows[0]?.count || 0);
    if (currentBusinessCount <= 1) {
      return res.status(409).json({
        error: "You cannot delete your only business account. Delete your account instead."
      });
    }
    const nextBusinessCount = Math.max(currentBusinessCount - 1, 1);
    const nextAdditionalBusinesses = Math.max(nextBusinessCount - 1, 0);
    const successorBusinessResult = await pool.query(
      `SELECT id
         FROM businesses
        WHERE user_id = $1
          AND id <> $2
        ORDER BY
          CASE WHEN id = $3 THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
        LIMIT 1`,
      [req.user.id, businessId, activeBusinessId]
    );
    const successorBusinessId = successorBusinessResult.rows[0]?.id || null;

    // Verify the user's password
    const userRow = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1 LIMIT 1",
      [req.user.id]
    );
    if (!userRow.rowCount) {
      return res.status(404).json({ error: "User not found." });
    }
    const { match } = await verifyPassword(password, userRow.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    // Delete in a transaction. Must clear recurring_transactions before accounts/categories
    // because of ON DELETE RESTRICT on account_id and category_id.
    const client = await pool.connect();
    let storagePaths = [];
    let transactionCommitted = false;
    try {
      await client.query("BEGIN");

      // Collect receipt file paths before deleting DB rows.
      const receiptFiles = await client.query(
        "SELECT storage_path FROM receipts WHERE business_id = $1 AND storage_path IS NOT NULL",
        [businessId]
      );
      storagePaths = receiptFiles.rows
        .map((row) => row.storage_path)
        .filter((filePath) => isManagedReceiptPath(filePath));

      // Clear runs first (CASCADE would handle this, but be explicit)
      await client.query(
        "DELETE FROM recurring_transaction_runs WHERE business_id = $1",
        [businessId]
      );

      // Clear recurring templates (RESTRICT on account_id/category_id blocks cascade from accounts)
      await client.query(
        "DELETE FROM recurring_transactions WHERE business_id = $1",
        [businessId]
      );

      if (billingBusinessId && businessId === billingBusinessId && successorBusinessId) {
        await migrateBillingAnchorSubscription(
          client,
          billingBusinessId,
          successorBusinessId,
          nextAdditionalBusinesses
        );
      } else if (billingBusinessId) {
        await updateAnchorAdditionalBusinesses(client, billingBusinessId, nextAdditionalBusinesses);
      }

      // Delete the business — all remaining child rows cascade (transactions, receipts,
      // mileage, accounts, categories, exports, subscriptions)
      await client.query(
        "DELETE FROM businesses WHERE id = $1 AND user_id = $2",
        [businessId, req.user.id]
      );

      // If this was the active business, point to another one. Otherwise keep the current active business.
      await client.query(
        `UPDATE users
            SET active_business_id = CASE
              WHEN active_business_id = $2 THEN (
                SELECT id FROM businesses WHERE user_id = $1 ORDER BY created_at ASC, id ASC LIMIT 1
              )
              ELSE active_business_id
            END
          WHERE id = $1`,
        [req.user.id, businessId]
      );

      await client.query("COMMIT");
      transactionCommitted = true;

      await Promise.all(
        storagePaths.map(async (filePath) => {
          try {
            await fs.promises.unlink(filePath);
          } catch (unlinkErr) {
            if (unlinkErr.code !== "ENOENT") {
              logError("DELETE /businesses/:id: failed to unlink receipt file", {
                filePath,
                err: unlinkErr.message
              });
            }
          }
        })
      );

      const nextBillingBusinessId =
        billingBusinessId && businessId === billingBusinessId
          ? successorBusinessId
          : billingBusinessId;

      if (nextBillingBusinessId && subscription?.effectiveTier === PLAN_V1) {
        try {
          await syncStripeBusinessSlotsAfterDelete({
            billingBusinessId: nextBillingBusinessId,
            successorBusinessId,
            subscription,
            additionalBusinesses: nextAdditionalBusinesses
          });
        } catch (stripeErr) {
          logError("DELETE /businesses/:id: failed to sync Stripe business slots", {
            businessId,
            nextBillingBusinessId,
            err: stripeErr.message
          });
          throw stripeErr;
        }
      }
    } catch (err) {
      if (!transactionCommitted) {
        await client.query("ROLLBACK");
      }
      throw err;
    } finally {
      client.release();
    }

    const businesses = await listBusinessesForUser(req.user.id);
    const nextActiveBusinessId = await resolveBusinessIdForUser(req.user, { seedDefaults: false });
    const activeBusiness = businesses.find((business) => business.id === nextActiveBusinessId) || null;
    const nextBillingBusinessId =
      await findBillingAnchorBusinessIdForUser(req.user.id, nextActiveBusinessId) || nextActiveBusinessId;
    const nextSubscription = nextBillingBusinessId
      ? await getSubscriptionSnapshotForBusiness(nextBillingBusinessId)
      : null;

    await sendBusinessLifecycleEmail({
      userId: req.user.id,
      kind: "deleted",
      businessName,
      subscription: nextSubscription,
      businessCount: businesses.length
    });

    res.status(200).json({
      message: "Business deleted.",
      active_business_id: nextActiveBusinessId,
      active_business: activeBusiness,
      businesses,
      subscription: nextSubscription
    });
  } catch (err) {
    logError("DELETE /businesses/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete business." });
  }
});

module.exports = router;
