"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CCA_CLASSES,
  MACRS_TABLES,
  getCcaClass,
  getMacrsRate,
  computeCcaDeduction,
  computeMacrsDeduction,
  computeRecoveryYear
} = require("../utils/depreciationSchedules.js");

// ── CCA ──────────────────────────────────────────────────────────────────────

test("getCcaClass returns null for unknown class", () => {
  assert.equal(getCcaClass("Class 99"), null);
});

test("getCcaClass returns Class 12 with halfYearExempt=true", () => {
  const c = getCcaClass("Class 12");
  assert.equal(c.rate, 1.00);
  assert.equal(c.halfYearExempt, true);
});

test("CCA Class 8 applies half-year rule in first year", () => {
  // Class 8: 20% on declining balance; first year = 50% of UCC eligible
  const deduction = computeCcaDeduction({
    originalCost: 10000,
    priorDepreciation: 0,
    ccaClass: "Class 8",
    isFirstYear: true
  });
  // Eligible UCC = 10000 * 0.5 = 5000; deduction = 5000 * 0.20 = 1000
  assert.equal(deduction, 1000);
});

test("CCA Class 8 does NOT apply half-year rule after first year", () => {
  const deduction = computeCcaDeduction({
    originalCost: 10000,
    priorDepreciation: 1000,
    ccaClass: "Class 8",
    isFirstYear: false
  });
  // UCC = 9000; deduction = 9000 * 0.20 = 1800
  assert.equal(deduction, 1800);
});

test("CCA Class 12 is fully deductible in first year — no half-year rule", () => {
  // Class 12 is exempt from the half-year rule (CRA T4002 Chapter 4)
  const deduction = computeCcaDeduction({
    originalCost: 400,
    priorDepreciation: 0,
    ccaClass: "Class 12",
    isFirstYear: true
  });
  // Eligible UCC = 400 (no 50% restriction); deduction = 400 * 1.00 = 400
  assert.equal(deduction, 400);
});

test("CCA Class 50 applies half-year rule in first year", () => {
  const deduction = computeCcaDeduction({
    originalCost: 2000,
    priorDepreciation: 0,
    ccaClass: "Class 50",
    isFirstYear: true
  });
  // Eligible UCC = 1000; deduction = 1000 * 0.55 = 550
  assert.equal(deduction, 550);
});

// ── MACRS ─────────────────────────────────────────────────────────────────────

test("getMacrsRate returns 0 for unknown class", () => {
  assert.equal(getMacrsRate("99-year", 1), 0);
});

test("getMacrsRate returns correct rates for 5-year class", () => {
  assert.equal(getMacrsRate("5-year", 1), 0.2000);
  assert.equal(getMacrsRate("5-year", 2), 0.3200);
  assert.equal(getMacrsRate("5-year", 3), 0.1920);
  assert.equal(getMacrsRate("5-year", 6), 0.0576);
  assert.equal(getMacrsRate("5-year", 7), 0); // beyond table
});

test("computeMacrsDeduction year 1, no §179, no bonus", () => {
  // 5-year, $10,000 cost, year 1 rate = 20%
  const d = computeMacrsDeduction({ originalCost: 10000, macrsClass: "5-year", recoveryYear: 1 });
  assert.equal(d, 2000);
});

test("computeMacrsDeduction year 1 with §179 full expensing", () => {
  // §179 takes the full cost; MACRS on remaining basis = 0
  const d = computeMacrsDeduction({
    originalCost: 5000,
    macrsClass: "7-year",
    recoveryYear: 1,
    section179Amount: 5000
  });
  assert.equal(d, 5000);
});

test("computeMacrsDeduction year 1 with 60% bonus depreciation (2026 rate)", () => {
  // Cost = $10,000, bonus = 60%
  // bonus = 10000 * 0.60 = 6000; remaining basis = 4000
  // year 1 MACRS on 4000 (7-year, rate=14.29%) = 571.60
  // total = 6000 + 571.60 = 6571.60
  const d = computeMacrsDeduction({
    originalCost: 10000,
    macrsClass: "7-year",
    recoveryYear: 1,
    bonusDepreciationPct: 60
  });
  assert.equal(d, 6571.60);
});

// ── computeRecoveryYear ───────────────────────────────────────────────────────

test("computeRecoveryYear returns 1 when no prior depreciation", () => {
  assert.equal(computeRecoveryYear(0, 10000, "5-year", 0, 0), 1);
});

test("computeRecoveryYear correctly tracks 5-year asset across all recovery years", () => {
  // Accumulate deductions year by year and verify the next recovery year
  const cost = 10000;
  const cls = "5-year";
  const table = MACRS_TABLES[cls];
  let prior = 0;
  for (let yr = 1; yr < table.length; yr++) {
    prior += table[yr - 1] * cost;
    const next = computeRecoveryYear(prior, cost, cls, 0, 0);
    assert.equal(next, yr + 1, `after year ${yr}, next should be ${yr + 1}, got ${next}`);
  }
});

test("computeRecoveryYear correctly tracks 7-year asset across all recovery years", () => {
  const cost = 10000;
  const cls = "7-year";
  const table = MACRS_TABLES[cls];
  let prior = 0;
  for (let yr = 1; yr < table.length; yr++) {
    prior += table[yr - 1] * cost;
    const next = computeRecoveryYear(prior, cost, cls, 0, 0);
    assert.equal(next, yr + 1, `after year ${yr}, next should be ${yr + 1}, got ${next}`);
  }
});

test("computeRecoveryYear returns 1 when fully covered by §179", () => {
  // §179 covers the full cost — no MACRS basis remains
  assert.equal(computeRecoveryYear(10000, 10000, "7-year", 10000, 0), 1);
});

test("computeRecoveryYear handles 60% bonus depreciation correctly", () => {
  // Cost=10000, bonus=60% → bonus=6000, macrsBasis=4000
  // After year 1 MACRS on 4000 at 14.29% = 571.60; prior=6571.60
  const prior = 6571.60;
  const next = computeRecoveryYear(prior, 10000, "7-year", 0, 60);
  assert.equal(next, 2);
});
