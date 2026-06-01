"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeHomeOfficeDeduction,
  sumEligibleHomeOfficeExpenses,
  buildHomeOfficeWorksheet
} = require("../services/homeOfficeService.js");

test("actual method applies business-use percent to eligible expenses", () => {
  const result = computeHomeOfficeDeduction({
    region: "US",
    method: "actual",
    totalAreaSqft: 1000,
    officeAreaSqft: 200,
    monthsUsed: 12,
    eligibleExpensesTotal: 6000
  });
  assert.equal(result.supported, true);
  assert.equal(result.businessUsePct, 20);
  assert.equal(result.deduction, 1200); // 6000 * 20%
});

test("actual method prorates for partial-year use", () => {
  const result = computeHomeOfficeDeduction({
    region: "US",
    method: "actual",
    totalAreaSqft: 1000,
    officeAreaSqft: 200,
    monthsUsed: 6,
    eligibleExpensesTotal: 6000
  });
  assert.equal(result.deduction, 600); // 6000 * 20% * (6/12)
});

test("simplified method is $5/sq ft capped at 300 sq ft", () => {
  const result = computeHomeOfficeDeduction({
    region: "US",
    method: "simplified",
    officeAreaSqft: 350,
    monthsUsed: 12
  });
  assert.equal(result.supported, true);
  assert.equal(result.capApplied, true);
  assert.equal(result.cappedAreaSqft, 300);
  assert.equal(result.deduction, 1500); // 300 * $5
});

test("simplified method is rejected for Canada", () => {
  const result = computeHomeOfficeDeduction({
    region: "CA",
    method: "simplified",
    officeAreaSqft: 200
  });
  assert.equal(result.supported, false);
  assert.match(result.unsupportedReason, /Canada does not offer the US simplified/i);
});

test("actual method without area inputs is unsupported", () => {
  const result = computeHomeOfficeDeduction({
    region: "US",
    method: "actual",
    eligibleExpensesTotal: 5000
  });
  assert.equal(result.supported, false);
  assert.match(result.unsupportedReason, /total home area and the home-office area/i);
});

test("Canada actual method notes the income limitation / carry-forward", () => {
  const result = computeHomeOfficeDeduction({
    region: "CA",
    method: "actual",
    totalAreaSqft: 1200,
    officeAreaSqft: 120,
    eligibleExpensesTotal: 4000
  });
  assert.equal(result.supported, true);
  assert.equal(result.businessUsePct, 10);
  assert.equal(result.deduction, 400);
  assert.match(result.note, /carries forward|income/i);
});

test("sumEligibleHomeOfficeExpenses totals only home-office expense rows", () => {
  const categories = [
    { id: "c_home", name: "Home Office" },
    { id: "c_other", name: "Office Supplies" }
  ];
  const transactions = [
    { type: "expense", category_id: "c_home", amount: 500 },
    { type: "expense", category_id: "c_home", amount: 250 },
    { type: "expense", category_id: "c_other", amount: 99 },
    { type: "income", category_id: "c_home", amount: 1000 }
  ];
  const { total, count } = sumEligibleHomeOfficeExpenses(transactions, categories);
  assert.equal(total, 750);
  assert.equal(count, 2);
});

test("buildHomeOfficeWorksheet aggregates the ledger and computes the deduction", () => {
  const schedule = buildHomeOfficeWorksheet({
    region: "US",
    taxYear: 2026,
    worksheet: { method: "actual", total_area_sqft: 1000, office_area_sqft: 250, months_used: 12, tax_year: 2026 },
    categories: [{ id: "c_home", name: "Business Use of Home" }],
    transactions: [
      { type: "expense", category_id: "c_home", amount: 400 },
      { type: "expense", category_id: "c_home", amount: 400 }
    ]
  });
  assert.equal(schedule.supported, true);
  assert.equal(schedule.eligibleExpenseCount, 2);
  assert.equal(schedule.eligibleExpensesTotal, 800);
  assert.equal(schedule.businessUsePct, 25);
  assert.equal(schedule.deduction, 200); // 800 * 25%
});

test("buildHomeOfficeWorksheet returns null when there is no worksheet row", () => {
  assert.equal(buildHomeOfficeWorksheet({ worksheet: null }), null);
});
