"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
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
} = require("../services/billingInputValidationService.js");

test("isEnvFlagEnabled treats 0/false/no/off as disabled and anything else truthy as enabled", () => {
  const original = process.env.TEST_BILLING_FLAG;
  try {
    for (const off of ["0", "false", "no", "off", "FALSE", "Off"]) {
      process.env.TEST_BILLING_FLAG = off;
      assert.equal(isEnvFlagEnabled("TEST_BILLING_FLAG"), false, `expected ${off} to be disabled`);
    }
    for (const on of ["1", "true", "yes", "enabled"]) {
      process.env.TEST_BILLING_FLAG = on;
      assert.equal(isEnvFlagEnabled("TEST_BILLING_FLAG"), true, `expected ${on} to be enabled`);
    }
    delete process.env.TEST_BILLING_FLAG;
    assert.equal(isEnvFlagEnabled("TEST_BILLING_FLAG"), false);
    assert.equal(isEnvFlagEnabled("TEST_BILLING_FLAG", true), true);
  } finally {
    if (original === undefined) {
      delete process.env.TEST_BILLING_FLAG;
    } else {
      process.env.TEST_BILLING_FLAG = original;
    }
  }
});

test("normalizeTrialEndForCheckout returns end-of-day epoch seconds, or null for an invalid date", () => {
  const seconds = normalizeTrialEndForCheckout("2026-06-15");
  const asDate = new Date(seconds * 1000);
  assert.equal(asDate.getHours(), 23);
  assert.equal(asDate.getMinutes(), 59);
  assert.equal(asDate.getSeconds(), 59);
  assert.equal(normalizeTrialEndForCheckout("not-a-date"), null);
});

test("normalizeBillingInterval defaults to monthly, accepts yearly, rejects anything else", () => {
  assert.equal(normalizeBillingInterval(undefined), "monthly");
  assert.equal(normalizeBillingInterval(""), "monthly");
  assert.equal(normalizeBillingInterval("yearly"), "yearly");
  assert.equal(normalizeBillingInterval("YEARLY"), "yearly");
  assert.throws(() => normalizeBillingInterval("weekly"), BillingValidationError);
});

test("normalizeCurrency defaults to usd, accepts cad, rejects anything else", () => {
  assert.equal(normalizeCurrency(undefined), "usd");
  assert.equal(normalizeCurrency("CAD"), "cad");
  assert.throws(() => normalizeCurrency("eur"), BillingValidationError);
});

test("normalizeOptionalBillingInterval/Currency swallow invalid input as null instead of throwing", () => {
  assert.equal(normalizeOptionalBillingInterval("weekly"), null);
  assert.equal(normalizeOptionalBillingInterval("yearly"), "yearly");
  assert.equal(normalizeOptionalBillingInterval(""), null);
  assert.equal(normalizeOptionalCurrency("eur"), null);
  assert.equal(normalizeOptionalCurrency("cad"), "cad");
});

test("normalizeAdditionalBusinesses accepts 0-100 whole numbers and rejects everything else", () => {
  assert.equal(normalizeAdditionalBusinesses(undefined), 0);
  assert.equal(normalizeAdditionalBusinesses(""), 0);
  assert.equal(normalizeAdditionalBusinesses("5"), 5);
  assert.equal(normalizeAdditionalBusinesses(100), 100);
  assert.throws(() => normalizeAdditionalBusinesses(101), BillingValidationError);
  assert.throws(() => normalizeAdditionalBusinesses(-1), BillingValidationError);
  assert.throws(() => normalizeAdditionalBusinesses(1.5), BillingValidationError);
  assert.throws(() => normalizeAdditionalBusinesses("not-a-number"), BillingValidationError);
});

test("normalizeInternalReturnPath rejects protocol-relative and CRLF-injected paths", () => {
  assert.equal(normalizeInternalReturnPath("/subscription?x=1"), "/subscription?x=1");
  assert.equal(normalizeInternalReturnPath("//evil.com"), "/subscription");
  assert.equal(normalizeInternalReturnPath("https://evil.com"), "/subscription");
  assert.equal(normalizeInternalReturnPath("/ok\r\nSet-Cookie: x=1"), "/subscription");
  assert.equal(normalizeInternalReturnPath("", "/fallback"), "/fallback");
});

test("buildCheckoutReturnPath appends a checkout query param onto the normalized path", () => {
  assert.equal(buildCheckoutReturnPath("/subscription", "success"), "/subscription?checkout=success");
  assert.equal(buildCheckoutReturnPath("/subscription?existing=1", "cancelled"), "/subscription?existing=1&checkout=cancelled");
  assert.equal(buildCheckoutReturnPath("//evil.com", "success"), "/subscription?checkout=success");
});

test("isTrialReupgradeAttempt is true only for a trialing subscription with a disqualifying signal", () => {
  assert.equal(isTrialReupgradeAttempt({ isTrialing: true, cancelAtPeriodEnd: true }), true);
  assert.equal(isTrialReupgradeAttempt({ isTrialing: true, isTrialDowngradedToFree: true }), true);
  assert.equal(isTrialReupgradeAttempt({ isTrialing: true, selectedPlanCode: "free" }), true);
  assert.equal(isTrialReupgradeAttempt({ isTrialing: true, trialPlanSelection: "free" }), true);
  assert.equal(isTrialReupgradeAttempt({ isTrialing: true, selectedPlanCode: "v1" }), false);
  assert.equal(isTrialReupgradeAttempt({ isTrialing: false, selectedPlanCode: "free" }), false);
  assert.equal(isTrialReupgradeAttempt(null), false);
});

test("normalizeCountryCode recognizes US/Canada spellings and returns null otherwise", () => {
  assert.equal(normalizeCountryCode("CA"), "ca");
  assert.equal(normalizeCountryCode("Canada"), "ca");
  assert.equal(normalizeCountryCode("US"), "us");
  assert.equal(normalizeCountryCode("United States"), "us");
  assert.equal(normalizeCountryCode("United States of America"), "us");
  assert.equal(normalizeCountryCode("France"), null);
  assert.equal(normalizeCountryCode(""), null);
  assert.equal(normalizeCountryCode(null), null);
});

test("resolveCurrencyForCountry maps Canada to cad and everything else to usd", () => {
  assert.equal(resolveCurrencyForCountry("ca"), "cad");
  assert.equal(resolveCurrencyForCountry("us"), "usd");
  assert.equal(resolveCurrencyForCountry(null), "usd");
});
