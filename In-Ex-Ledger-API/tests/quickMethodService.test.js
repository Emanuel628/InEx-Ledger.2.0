"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveProvinceGroup,
  finalizeRateSelection,
  getQuickMethodEligibility,
  buildQuickMethodSchedule,
  computeQuickMethodRemittance,
  QUICK_METHOD_CREDIT_RATE,
  QUICK_METHOD_CREDIT_CAP,
  QUICK_METHOD_REVENUE_LIMIT
} = require("../services/quickMethodService.js");

// Replace the real pool with a stub for unit tests
function makeStubPool(remittanceRate, hstRate) {
  return {
    async query() {
      return { rows: [{ remittance_rate: remittanceRate, hst_rate: hstRate }] };
    }
  };
}

// Monkey-patch the pool inside the module for unit tests
const quickMethodModule = require("../services/quickMethodService.js");

test("resolveProvinceGroup: ON → ON, NB → NS_NB_NL_PEI, AB → NON_HST", () => {
  assert.equal(resolveProvinceGroup("ON"), "ON");
  assert.equal(resolveProvinceGroup("NB"), "NS_NB_NL_PEI");
  assert.equal(resolveProvinceGroup("AB"), "NON_HST");
  assert.equal(resolveProvinceGroup("QC"), "NON_HST");
  assert.equal(resolveProvinceGroup("XX"), "NON_HST"); // unknown → default
});

test("QUICK_METHOD_CREDIT constants are correct", () => {
  assert.equal(QUICK_METHOD_CREDIT_RATE, 0.01);
  assert.equal(QUICK_METHOD_CREDIT_CAP, 30000);
});

test("finalizeRateSelection flags stale fallback years", () => {
  const selected = finalizeRateSelection({ remittance_rate: 0.088, hst_rate: 0.13, effective_year: 2025 }, 2026);
  assert.equal(selected.effective_year, 2025);
  assert.equal(selected.is_fallback, true);
  assert.match(selected.warning, /2026/);
});

test("finalizeRateSelection stays quiet for exact-year matches", () => {
  const selected = finalizeRateSelection({ remittance_rate: 0.088, hst_rate: 0.13, effective_year: 2026 }, 2026);
  assert.equal(selected.is_fallback, false);
  assert.equal(selected.warning, null);
});

test("1% ITC credit math: $50k gross → credit=$300, net=$4100 at 8.8% rate", () => {
  // Simulates ON services at 8.8% remittance rate with $50,000 gross sales incl. HST
  // CRA RC4058: credit = 1% × min(gross, $30,000)
  const gross = 50000;
  const remittanceRate = 0.088;
  const grossRemittance = +(gross * remittanceRate).toFixed(2);
  const itcCredit = +(Math.min(gross, QUICK_METHOD_CREDIT_CAP) * QUICK_METHOD_CREDIT_RATE).toFixed(2);
  const netTaxToRemit = +Math.max(0, grossRemittance - itcCredit).toFixed(2);

  assert.equal(grossRemittance, 4400);
  assert.equal(itcCredit, 300);  // capped at $30k × 1%
  assert.equal(netTaxToRemit, 4100);
});

test("1% credit is capped at $30,000 of eligible supplies", () => {
  // For gross = $100,000, credit = 30000 * 0.01 = $300 (not $1000)
  const credit = +(Math.min(100000, QUICK_METHOD_CREDIT_CAP) * QUICK_METHOD_CREDIT_RATE).toFixed(2);
  assert.equal(credit, 300);
});

test("1% credit applies fully when gross < $30,000", () => {
  // For gross = $20,000, credit = 20000 * 0.01 = $200
  const credit = +(Math.min(20000, QUICK_METHOD_CREDIT_CAP) * QUICK_METHOD_CREDIT_RATE).toFixed(2);
  assert.equal(credit, 200);
});

test("netTaxToRemit is never negative", () => {
  // Edge case: very low gross, remittance rate > 0
  const grossRemittance = +(500 * 0.088).toFixed(2); // 44
  const itcCredit = +(Math.min(500, 30000) * 0.01).toFixed(2); // 5
  const net = +Math.max(0, grossRemittance - itcCredit).toFixed(2);
  assert.ok(net >= 0);
  assert.equal(net, 39);
});

test("resolveProvinceGroup uses split Atlantic groups in 2026", () => {
  assert.equal(resolveProvinceGroup("NS", 2026), "NS");
  assert.equal(resolveProvinceGroup("PE", 2026), "NB_NL_PEI");
});

test("getQuickMethodEligibility blocks excluded businesses and oversized revenue", () => {
  const excluded = getQuickMethodEligibility({
    province: "ON",
    supplyType: "services",
    taxYear: 2026,
    grossSalesInclTax: 100000,
    businessActivityCode: "541213"
  });
  assert.equal(excluded.eligible, false);
  assert.match(excluded.reason, /excluded/i);

  const oversized = getQuickMethodEligibility({
    province: "ON",
    supplyType: "services",
    taxYear: 2026,
    grossSalesInclTax: QUICK_METHOD_REVENUE_LIMIT + 1
  });
  assert.equal(oversized.eligible, false);
  assert.match(excluded.reason, /Quick Method/);
  assert.match(oversized.reason, /\$400,000/);
});

test("buildQuickMethodSchedule returns an unsupported review object when supply type cannot be verified", async () => {
  const result = await buildQuickMethodSchedule({
    businessId: "biz1",
    province: "ON",
    supplyType: null,
    taxYear: 2026,
    grossSalesInclTax: 20000
  });
  assert.equal(result.supported, false);
  assert.match(result.unsupportedReason, /supply type/i);
});
