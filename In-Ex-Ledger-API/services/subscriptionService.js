const crypto = require("crypto");
const { pool } = require("../db.js");
const { buildStripePriceLookup } = require("./stripePriceConfig.js");

const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS || 30);
const BILLING_PAST_DUE_GRACE_DAYS = Number(process.env.BILLING_PAST_DUE_GRACE_DAYS || 7);
const PLAN_FREE = "free";
const PLAN_V1 = "v1";
const PLAN_BASIC = PLAN_FREE;
const PLAN_PRO = PLAN_V1;
const PLAN_BUSINESS = "business";

function getPlanDisplayName(tier) {
  if (tier === PLAN_V1) return "Pro";
  if (tier === PLAN_BUSINESS) return "Business";
  return "Basic";
}


function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolvePastDueStartedAt(row) {
  const metadata = row?.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
  return normalizeDate(metadata.past_due_started_at);
}

async function ensureBusinessSubscription(businessId) {
  const existing = await pool.query(
    `SELECT id, business_id, provider, plan_code, status, stripe_customer_id,
            stripe_subscription_id, stripe_price_id, trial_started_at, trial_ends_at,
            current_period_start, current_period_end, cancel_at_period_end, canceled_at,
            metadata_json
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [businessId]
  );

  if (existing.rowCount) {
    return existing.rows[0];
  }

  const now = new Date();
  const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);
  const inserted = await pool.query(
    `INSERT INTO business_subscriptions (
        id,
        business_id,
        provider,
        plan_code,
        status,
        trial_started_at,
        trial_ends_at,
        current_period_start,
        current_period_end
     )
     VALUES ($1, $2, 'stripe', $3, 'trialing', $4, $5, $4, $5)
     ON CONFLICT (business_id) DO NOTHING
     RETURNING *`,
    [crypto.randomUUID(), businessId, PLAN_V1, now, trialEndsAt]
  );

  if (inserted.rowCount) {
    return inserted.rows[0];
  }

  // A concurrent request inserted the row between our SELECT and INSERT.
  // Fetch and return the row that won the race.
  const fallback = await pool.query(
    `SELECT id, business_id, provider, plan_code, status, stripe_customer_id,
            stripe_subscription_id, stripe_price_id, trial_started_at, trial_ends_at,
            current_period_start, current_period_end, cancel_at_period_end, canceled_at,
            metadata_json
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [businessId]
  );
  if (!fallback.rowCount) {
    throw new Error(`ensureBusinessSubscription: no subscription row found for business ${businessId} after conflict`);
  }
  return fallback.rows[0];
}

function deriveEffectiveState(row) {
  const now = Date.now();
  const trialEndsAt = normalizeDate(row?.trial_ends_at);
  const trialStartedAt = normalizeDate(row?.trial_started_at);
  const resolvedTrialEndsAt = trialEndsAt || (trialStartedAt ? addDays(trialStartedAt, DEFAULT_TRIAL_DAYS) : null);
  const currentPeriodEnd = normalizeDate(row?.current_period_end);
  const pastDueStartedAt = resolvePastDueStartedAt(row);
  const pastDueGraceEndsAt = pastDueStartedAt ? addDays(pastDueStartedAt, BILLING_PAST_DUE_GRACE_DAYS) : null;
  const isTrialing = Boolean(
    row?.status === "trialing" && resolvedTrialEndsAt && resolvedTrialEndsAt.getTime() > now
  );
  const isActivePaid =
    Boolean(row?.status === "active" &&
    row?.plan_code === PLAN_V1 &&
    (!currentPeriodEnd || currentPeriodEnd.getTime() > now));
  const isPastDueGracePeriod =
    Boolean(row?.status === "past_due" &&
    row?.plan_code === PLAN_V1 &&
    pastDueGraceEndsAt &&
    pastDueGraceEndsAt.getTime() > now);
  const isGracePeriod =
    Boolean(row?.cancel_at_period_end &&
    row?.plan_code === PLAN_V1 &&
    currentPeriodEnd &&
    currentPeriodEnd.getTime() > now);
  // Stripe fires customer.subscription.updated (status → "canceled") when a
  // subscription is cancelled immediately mid-period, before current_period_end.
  // Neither isActivePaid (requires "active") nor isGracePeriod (requires
  // cancel_at_period_end) matches this state, so without this check the user
  // would lose access immediately even though they paid through period end.
  const isCanceledWithRemainingAccess =
    Boolean(row?.status === "canceled" &&
    row?.plan_code === PLAN_V1 &&
    currentPeriodEnd &&
    currentPeriodEnd.getTime() > now);

  let effectiveTier = PLAN_FREE;
  let effectiveStatus = row?.status || "inactive";

  if (isTrialing) {
    effectiveTier = PLAN_V1;
    effectiveStatus = "trialing";
  } else if (isActivePaid || isGracePeriod || isPastDueGracePeriod || isCanceledWithRemainingAccess) {
    effectiveTier = PLAN_V1;
    effectiveStatus = row.status;
  } else if (row?.status === "trialing" && resolvedTrialEndsAt && resolvedTrialEndsAt.getTime() <= now) {
    effectiveTier = PLAN_FREE;
    effectiveStatus = "trial_expired";
  } else if (row?.plan_code === PLAN_FREE) {
    effectiveTier = PLAN_FREE;
    effectiveStatus = row?.status || "free";
  }

  return {
    id: row?.id || null,
    businessId: row?.business_id || null,
    provider: row?.provider || "stripe",
    planCode: row?.plan_code || PLAN_FREE,
    planName: getPlanDisplayName(row?.plan_code || PLAN_FREE),
    status: row?.status || "inactive",
    effectiveTier,
    effectiveTierName: getPlanDisplayName(effectiveTier),
    effectiveStatus,
    isTrialing,
    isPaid: Boolean(isActivePaid || isGracePeriod || isPastDueGracePeriod || isCanceledWithRemainingAccess),
    isCanceledWithRemainingAccess,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    stripeCustomerId: row?.stripe_customer_id || null,
    stripeSubscriptionId: row?.stripe_subscription_id || null,
    stripePriceId: row?.stripe_price_id || null,
    trialStartedAt: row?.trial_started_at || null,
    trialEndsAt: resolvedTrialEndsAt || null,
    currentPeriodStart: row?.current_period_start || null,
    currentPeriodEnd: row?.current_period_end || null
  };
}

async function getSubscriptionSnapshotForBusiness(businessId) {
  const row = await ensureBusinessSubscription(businessId);
  return deriveEffectiveState(row);
}

async function getSubscriptionSnapshotForUser(user) {
  const businessId = user?.business_id;
  if (!businessId) {
    return null;
  }
  return getSubscriptionSnapshotForBusiness(businessId);
}

async function updateStripeCustomerForBusiness(businessId, stripeCustomerId) {
  await pool.query(
    `UPDATE business_subscriptions
        SET stripe_customer_id = $2,
            updated_at = NOW()
      WHERE business_id = $1`,
    [businessId, stripeCustomerId]
  );
}

async function syncStripeSubscriptionForBusiness(businessId, subscription) {
  const { basePriceIds, addonPriceIds, metadataByPriceId } = buildStripePriceLookup();
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const baseItem = items.find((item) => basePriceIds.has(item?.price?.id)) || null;
  const addonItem = items.find((item) => addonPriceIds.has(item?.price?.id)) || null;
  const stripeMetadata = subscription?.metadata || {};
  const basePriceMeta = baseItem?.price?.id ? metadataByPriceId.get(baseItem.price.id) : null;
  const addonPriceMeta = addonItem?.price?.id ? metadataByPriceId.get(addonItem.price.id) : null;
  const addonQuantityValue = Number(addonItem?.quantity);
  const addonQuantity = Number.isSafeInteger(addonQuantityValue) ? addonQuantityValue : null;
  const metadataQuantityValue = Number(stripeMetadata.additional_businesses);
  const metadataQuantity = Number.isSafeInteger(metadataQuantityValue) ? metadataQuantityValue : null;
  const additionalBusinesses = addonQuantity ?? metadataQuantity ?? 0;
  const billingInterval =
    stripeMetadata.billing_interval || basePriceMeta?.billingInterval || addonPriceMeta?.billingInterval || null;
  const currency =
    stripeMetadata.currency || basePriceMeta?.currency || addonPriceMeta?.currency || null;
  const addonPriceId = addonItem?.price?.id || stripeMetadata.addon_price_id || null;
  const trialEndsAt = subscription?.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const currentPeriodStart = subscription?.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null;
  const currentPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const canceledAt = subscription?.canceled_at ? new Date(subscription.canceled_at * 1000) : null;
  const currentSnapshot = await ensureBusinessSubscription(businessId);
  const currentMetadata =
    currentSnapshot?.metadata_json && typeof currentSnapshot.metadata_json === "object"
      ? currentSnapshot.metadata_json
      : {};
  const nextStatus = subscription?.status || "active";
  const pastDueStartedAt =
    nextStatus === "past_due"
      ? currentSnapshot?.status === "past_due" && currentMetadata.past_due_started_at
        ? currentMetadata.past_due_started_at
        : new Date().toISOString()
      : null;

  await pool.query(
    `UPDATE business_subscriptions
        SET plan_code = $2,
            status = $3,
            stripe_customer_id = $4,
            stripe_subscription_id = $5,
            stripe_price_id = $6,
            trial_started_at = COALESCE(trial_started_at, NOW()),
            trial_ends_at = $7,
            current_period_start = $8,
            current_period_end = $9,
            cancel_at_period_end = $10,
            canceled_at = $11,
            metadata_json = $12::jsonb,
            updated_at = NOW()
      WHERE business_id = $1`,
    [
      businessId,
      PLAN_V1,
      nextStatus,
      subscription?.customer || null,
      subscription?.id || null,
      baseItem?.price?.id || null,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      Boolean(subscription?.cancel_at_period_end),
      canceledAt,
      JSON.stringify({
        raw_status: subscription?.status || null,
        billing_interval: billingInterval,
        currency,
        additional_businesses: additionalBusinesses,
        addon_price_id: addonPriceId,
        past_due_started_at: pastDueStartedAt
      })
    ]
  );
}

async function setFreePlanForBusiness(businessId) {
  await ensureBusinessSubscription(businessId);
  await pool.query(
    `UPDATE business_subscriptions
        SET plan_code = $2,
            status = 'free',
            stripe_subscription_id = NULL,
            stripe_price_id = NULL,
            current_period_start = NULL,
            current_period_end = NULL,
            cancel_at_period_end = false,
            canceled_at = NOW(),
            metadata_json = '{}'::jsonb,
            updated_at = NOW()
      WHERE business_id = $1`,
    [businessId, PLAN_FREE]
  );
}

function hasFeatureAccess(subscription, feature) {
  const tier = subscription?.effectiveTier || PLAN_FREE;
  const v1Features = new Set([
    "receipts",
    "pdf_exports",
    "advanced_exports",
    "tax_estimates",
    "recurring_transactions"
  ]);

  if (!v1Features.has(feature)) {
    return true;
  }

  return tier === PLAN_V1;
}

module.exports = {
  PLAN_FREE,
  PLAN_V1,
  PLAN_BASIC,
  PLAN_PRO,
  PLAN_BUSINESS,
  ensureBusinessSubscription,
  deriveEffectiveState,
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setFreePlanForBusiness,
  hasFeatureAccess,
  getPlanDisplayName
};
