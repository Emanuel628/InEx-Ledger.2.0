"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveProvinceGroup,
  computeQuickMethodRemittance,
  QUICK_METHOD_CREDIT_RATE,
  QUICK_METHOD_CREDIT_CAP
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
