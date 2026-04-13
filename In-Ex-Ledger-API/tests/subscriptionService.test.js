const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://local:test@localhost:5432/inex_ledger_test";

const {
  PLAN_FREE,
  PLAN_V1,
  deriveEffectiveState
} = require("../services/subscriptionService.js");

function isoDateFromNow(daysOffset) {
  return new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000).toISOString();
}

test("deriveEffectiveState keeps active trials on v1", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_trial",
    business_id: "biz_trial",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "trialing",
    trial_ends_at: isoDateFromNow(14),
    current_period_end: isoDateFromNow(14)
  });

  assert.equal(snapshot.effectiveTier, PLAN_V1);
  assert.equal(snapshot.effectiveStatus, "trialing");
  assert.equal(snapshot.isTrialing, true);
  assert.equal(snapshot.isPaid, false);
});

test("deriveEffectiveState downgrades expired trials to free", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_expired_trial",
    business_id: "biz_trial_expired",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "trialing",
    trial_ends_at: isoDateFromNow(-1),
    current_period_end: isoDateFromNow(-1)
  });

  assert.equal(snapshot.effectiveTier, PLAN_FREE);
  assert.equal(snapshot.effectiveStatus, "trial_expired");
  assert.equal(snapshot.isTrialing, false);
  assert.equal(snapshot.isPaid, false);
});

test("deriveEffectiveState keeps active paid plans on v1", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_paid",
    business_id: "biz_paid",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "active",
    current_period_end: isoDateFromNow(30),
    cancel_at_period_end: false
  });

  assert.equal(snapshot.effectiveTier, PLAN_V1);
  assert.equal(snapshot.effectiveStatus, "active");
  assert.equal(snapshot.isPaid, true);
  assert.equal(snapshot.cancelAtPeriodEnd, false);
});

test("deriveEffectiveState preserves grace-period access for canceling subscriptions", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_canceling",
    business_id: "biz_canceling",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "active",
    current_period_end: isoDateFromNow(7),
    cancel_at_period_end: true
  });

  assert.equal(snapshot.effectiveTier, PLAN_V1);
  assert.equal(snapshot.effectiveStatus, "active");
  assert.equal(snapshot.isPaid, true);
  assert.equal(snapshot.cancelAtPeriodEnd, true);
});

test("deriveEffectiveState keeps past_due subscriptions active only during the configured grace period", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_past_due_grace",
    business_id: "biz_past_due_grace",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "past_due",
    current_period_end: isoDateFromNow(3),
    metadata_json: {
      past_due_started_at: isoDateFromNow(-2)
    }
  });

  assert.equal(snapshot.effectiveTier, PLAN_V1);
  assert.equal(snapshot.effectiveStatus, "past_due");
  assert.equal(snapshot.isPaid, true);
});

test("deriveEffectiveState downgrades past_due subscriptions after the grace period expires", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_past_due_expired",
    business_id: "biz_past_due_expired",
    provider: "stripe",
    plan_code: PLAN_V1,
    status: "past_due",
    current_period_end: isoDateFromNow(3),
    metadata_json: {
      past_due_started_at: isoDateFromNow(-10)
    }
  });

  assert.equal(snapshot.effectiveTier, PLAN_FREE);
  assert.equal(snapshot.effectiveStatus, "past_due");
  assert.equal(snapshot.isPaid, false);
});

test("deriveEffectiveState keeps explicit free plans on free", () => {
  const snapshot = deriveEffectiveState({
    id: "sub_free",
    business_id: "biz_free",
    provider: "stripe",
    plan_code: PLAN_FREE,
    status: "free"
  });

  assert.equal(snapshot.effectiveTier, PLAN_FREE);
  assert.equal(snapshot.effectiveStatus, "free");
  assert.equal(snapshot.isPaid, false);
  assert.equal(snapshot.isTrialing, false);
});
