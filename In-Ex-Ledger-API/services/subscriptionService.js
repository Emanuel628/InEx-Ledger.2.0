const crypto = require("crypto");
const { pool } = require("../db.js");

const DEFAULT_TRIAL_DAYS = Number(process.env.DEFAULT_TRIAL_DAYS || 30);
const PLAN_FREE = "free";
const PLAN_V1 = "v1";

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
     RETURNING *`,
    [crypto.randomUUID(), businessId, PLAN_V1, now, trialEndsAt]
  );

  return inserted.rows[0];
}

function deriveEffectiveState(row) {
  const now = Date.now();
  const trialEndsAt = row?.trial_ends_at ? new Date(row.trial_ends_at) : null;
  const currentPeriodEnd = row?.current_period_end ? new Date(row.current_period_end) : null;
  const isTrialing = Boolean(row?.status === "trialing" && trialEndsAt && trialEndsAt.getTime() > now);
  const isActivePaid =
    Boolean((row?.status === "active" || row?.status === "past_due") &&
    row?.plan_code === PLAN_V1 &&
    (!currentPeriodEnd || currentPeriodEnd.getTime() > now));
  const isGracePeriod =
    Boolean(row?.cancel_at_period_end &&
    row?.plan_code === PLAN_V1 &&
    currentPeriodEnd &&
    currentPeriodEnd.getTime() > now);

  let effectiveTier = PLAN_FREE;
  let effectiveStatus = row?.status || "inactive";

  if (isTrialing) {
    effectiveTier = PLAN_V1;
    effectiveStatus = "trialing";
  } else if (isActivePaid || isGracePeriod) {
    effectiveTier = PLAN_V1;
    effectiveStatus = row.status;
  } else if (row?.status === "trialing" && trialEndsAt && trialEndsAt.getTime() <= now) {
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
    status: row?.status || "inactive",
    effectiveTier,
    effectiveStatus,
    isTrialing,
    isPaid: Boolean(isActivePaid || isGracePeriod),
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    stripeCustomerId: row?.stripe_customer_id || null,
    stripeSubscriptionId: row?.stripe_subscription_id || null,
    stripePriceId: row?.stripe_price_id || null,
    trialStartedAt: row?.trial_started_at || null,
    trialEndsAt: row?.trial_ends_at || null,
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
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  const primaryItem = items[0] || {};
  const trialEndsAt = subscription?.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const currentPeriodStart = subscription?.current_period_start
    ? new Date(subscription.current_period_start * 1000)
    : null;
  const currentPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  const canceledAt = subscription?.canceled_at ? new Date(subscription.canceled_at * 1000) : null;

  await ensureBusinessSubscription(businessId);
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
      subscription?.status || "active",
      subscription?.customer || null,
      subscription?.id || null,
      primaryItem?.price?.id || null,
      trialEndsAt,
      currentPeriodStart,
      currentPeriodEnd,
      Boolean(subscription?.cancel_at_period_end),
      canceledAt,
      JSON.stringify({ raw_status: subscription?.status || null })
    ]
  );
}

async function setFreePlanForBusiness(businessId) {
  await ensureBusinessSubscription(businessId);
  await pool.query(
    `UPDATE business_subscriptions
        SET plan_code = $2,
            status = 'free',
            cancel_at_period_end = false,
            canceled_at = NOW(),
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
  ensureBusinessSubscription,
  deriveEffectiveState,
  getSubscriptionSnapshotForBusiness,
  getSubscriptionSnapshotForUser,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setFreePlanForBusiness,
  hasFeatureAccess
};
