"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLAN_CODES,
  PLAN_NAMES,
  FEATURE_KEYS,
  ALL_FEATURE_KEYS,
  PLAN_FEATURES,
  PLAN_LIMITS,
  getPlanDefinition,
  planHasFeature,
  getPlanLimit
} = require("../config/planCatalog.js");

test("every plan explicitly defines every known feature key", () => {
  for (const planCode of [PLAN_CODES.BASIC, PLAN_CODES.PRO, PLAN_CODES.BUSINESS]) {
    const features = PLAN_FEATURES[planCode];
    assert.ok(features, `PLAN_FEATURES is missing an entry for "${planCode}"`);
    for (const featureKey of ALL_FEATURE_KEYS) {
      assert.equal(
        typeof features[featureKey],
        "boolean",
        `${planCode} does not explicitly define a boolean value for feature "${featureKey}"`
      );
    }
  }
});

test("unknown feature keys fail closed instead of default-allow", () => {
  // Non-production (test) environment: planHasFeature throws rather than
  // silently granting access, per the "no default-allow" requirement.
  assert.throws(() => planHasFeature(PLAN_CODES.BASIC, "not_a_real_feature"));
  assert.throws(() => planHasFeature(PLAN_CODES.PRO, "not_a_real_feature"));
});

test("unknown feature keys return false (not true) in production", () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal(planHasFeature(PLAN_CODES.BASIC, "not_a_real_feature"), false);
    assert.equal(planHasFeature(PLAN_CODES.PRO, "not_a_real_feature"), false);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("Basic numeric limits are 50 transactions and 25 receipts per month", () => {
  assert.equal(PLAN_LIMITS[PLAN_CODES.BASIC].transactions, 50);
  assert.equal(PLAN_LIMITS[PLAN_CODES.BASIC].receipts, 25);
  assert.equal(getPlanLimit(PLAN_CODES.BASIC, "transactions"), 50);
  assert.equal(getPlanLimit(PLAN_CODES.BASIC, "receipts"), 25);
});

test("Pro and Business are not subject to Basic's numeric limits", () => {
  assert.equal(getPlanLimit(PLAN_CODES.PRO, "transactions"), null);
  assert.equal(getPlanLimit(PLAN_CODES.PRO, "receipts"), null);
  assert.equal(getPlanLimit(PLAN_CODES.BUSINESS, "transactions"), null);
  assert.equal(getPlanLimit(PLAN_CODES.BUSINESS, "receipts"), null);
});

test("Basic gets core bookkeeping features but not Pro-only capabilities", () => {
  const definition = getPlanDefinition(PLAN_CODES.BASIC);
  assert.equal(definition.features[FEATURE_KEYS.TRANSACTIONS], true);
  assert.equal(definition.features[FEATURE_KEYS.RECEIPTS], true);
  assert.equal(definition.features[FEATURE_KEYS.CSV_IMPORTS], true);
  assert.equal(definition.features[FEATURE_KEYS.ACCOUNTS], true);
  assert.equal(definition.features[FEATURE_KEYS.CATEGORIES], true);
  assert.equal(definition.features[FEATURE_KEYS.MILEAGE], true);
  assert.equal(definition.features[FEATURE_KEYS.INVOICES], true);
  assert.equal(definition.features[FEATURE_KEYS.BASIC_ANALYTICS], true);
  assert.equal(definition.features[FEATURE_KEYS.BASIC_CSV_EXPORT], true);

  assert.equal(definition.features[FEATURE_KEYS.RECURRING_TRANSACTIONS], false);
  assert.equal(definition.features[FEATURE_KEYS.TAX_ESTIMATES], false);
  assert.equal(definition.features[FEATURE_KEYS.PDF_EXPORTS], false);
  assert.equal(definition.features[FEATURE_KEYS.ADVANCED_EXPORTS], false);
  assert.equal(definition.features[FEATURE_KEYS.EXPORT_HISTORY], false);
  assert.equal(definition.features[FEATURE_KEYS.EDGE_CASE_TOOLS], false);
  assert.equal(definition.features[FEATURE_KEYS.ADDITIONAL_BUSINESSES], false);
});

test("Pro gets every feature, including everything Basic has", () => {
  const definition = getPlanDefinition(PLAN_CODES.PRO);
  for (const featureKey of ALL_FEATURE_KEYS) {
    assert.equal(definition.features[featureKey], true, `Pro should have "${featureKey}"`);
  }
});

test("Business inherits Pro's full feature set", () => {
  const pro = getPlanDefinition(PLAN_CODES.PRO);
  const business = getPlanDefinition(PLAN_CODES.BUSINESS);
  assert.deepEqual(business.features, pro.features);
});

test("public plan names are Basic/Pro -- v1 is never a public display name", () => {
  assert.equal(PLAN_NAMES[PLAN_CODES.BASIC], "Basic");
  assert.equal(PLAN_NAMES[PLAN_CODES.PRO], "Pro");
  assert.equal(PLAN_NAMES[PLAN_CODES.BUSINESS], "Pro");
  assert.equal(getPlanDefinition(PLAN_CODES.BASIC).name, "Basic");
  assert.equal(getPlanDefinition(PLAN_CODES.PRO).name, "Pro");

  const allNames = Object.values(PLAN_NAMES);
  assert.ok(!allNames.includes("v1"), "internal code 'v1' leaked into a public plan name");
  assert.ok(!allNames.includes("free"), "internal code 'free' leaked into a public plan name");
});

test("internal DB plan codes are preserved for backward compatibility", () => {
  assert.equal(PLAN_CODES.BASIC, "free");
  assert.equal(PLAN_CODES.PRO, "v1");
  assert.equal(PLAN_CODES.BUSINESS, "business");
});

test("getPlanDefinition normalizes unrecognized/missing codes to Basic", () => {
  assert.equal(getPlanDefinition(undefined).code, PLAN_CODES.BASIC);
  assert.equal(getPlanDefinition(null).code, PLAN_CODES.BASIC);
  assert.equal(getPlanDefinition("something_unexpected").code, PLAN_CODES.BASIC);
});
