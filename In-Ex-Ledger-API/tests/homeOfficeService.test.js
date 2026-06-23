"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeHomeOfficeDeduction,
  sumEligibleHomeOfficeExpenses,
  buildHomeOfficeWorksheet,
  isEligibleHomeOfficeCategory
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

test("months_used of 0 prorates to a $0 deduction (not a silent full year)", () => {
  const actual = computeHomeOfficeDeduction({
    region: "US",
    method: "actual",
    totalAreaSqft: 1000,
    officeAreaSqft: 200,
    monthsUsed: 0,
    eligibleExpensesTotal: 6000
  });
  assert.equal(actual.monthsUsed, 0);
  assert.equal(actual.deduction, 0);

  const simplified = computeHomeOfficeDeduction({
    region: "US",
    method: "simplified",
    officeAreaSqft: 300,
    monthsUsed: 0
  });
  assert.equal(simplified.deduction, 0);
});

test("missing or non-numeric months_used defaults to a full year", () => {
  const base = {
    region: "US",
    method: "actual",
    totalAreaSqft: 1000,
    officeAreaSqft: 200,
    eligibleExpensesTotal: 6000
  };
  assert.equal(computeHomeOfficeDeduction({ ...base }).deduction, 1200);
  assert.equal(computeHomeOfficeDeduction({ ...base, monthsUsed: "abc" }).deduction, 1200);
  assert.equal(computeHomeOfficeDeduction({ ...base, monthsUsed: null }).deduction, 1200);
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

test("sumEligibleHomeOfficeExpenses totals ledger categories that are eligible for home-office allocation", () => {
  const categories = [
    { id: "c_home", name: "Home Office" },
    { id: "c_rent", name: "Rent", tax_map_us: "rent_lease_other" },
    { id: "c_util", name: "Utilities", tax_map_us: "utilities" },
    { id: "c_other", name: "Office Supplies", tax_map_us: "office_expense" }
  ];
  const transactions = [
    { type: "expense", category_id: "c_home", amount: 500 },
    { type: "expense", category_id: "c_rent", amount: 250 },
    { type: "expense", category_id: "c_util", amount: 100 },
    { type: "expense", category_id: "c_other", amount: 99 },
    { type: "income", category_id: "c_home", amount: 1000 }
  ];
  const { total, count } = sumEligibleHomeOfficeExpenses(transactions, categories, { region: "US" });
  assert.equal(total, 850);
  assert.equal(count, 3);
});

test("isEligibleHomeOfficeCategory stays conservative for Canada phone/internet", () => {
  assert.equal(
    isEligibleHomeOfficeCategory({ name: "Phone & Internet", tax_map_ca: "other_expense" }, "CA"),
    true
  );
  assert.equal(
    isEligibleHomeOfficeCategory({ name: "Other Expense", tax_map_ca: "other_expense" }, "CA"),
    false
  );
});

test("buildHomeOfficeWorksheet aggregates the ledger and computes the deduction", () => {
  const schedule = buildHomeOfficeWorksheet({
    region: "US",
    taxYear: 2026,
    worksheet: { method: "actual", total_area_sqft: 1000, office_area_sqft: 250, months_used: 12, tax_year: 2026 },
    categories: [
      { id: "c_home", name: "Business Use of Home" },
      { id: "c_rent", name: "Rent", tax_map_us: "rent_lease_other" },
      { id: "c_util", name: "Utilities", tax_map_us: "utilities" }
    ],
    transactions: [
      { type: "expense", category_id: "c_home", amount: 400 },
      { type: "expense", category_id: "c_rent", amount: 400 },
      { type: "expense", category_id: "c_util", amount: 200 }
    ]
  });
  assert.equal(schedule.supported, true);
  assert.equal(schedule.eligibleExpenseCount, 3);
  assert.equal(schedule.eligibleExpensesTotal, 1000);
  assert.equal(schedule.businessUsePct, 25);
  assert.equal(schedule.deduction, 250); // 1000 * 25%
});

test("buildHomeOfficeWorksheet returns null when there is no worksheet row", () => {
  assert.equal(buildHomeOfficeWorksheet({ worksheet: null }), null);
});
