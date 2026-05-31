"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { computeTransactionReviewFlags } = require("../services/transactionReviewFlagService.js");

test("vehicle mileage flag is driven by vehicle evidence signals, not an unsupported tax_treatment value", () => {
  const flags = computeTransactionReviewFlags({
    id: "tx_1",
    type: "expense",
    category_id: "cat_1",
    category_name: "Office Supplies",
    tax_treatment: "vehicle",
    receipt_count: 0,
    review_status: "ready",
    region: "US",
    tax_map_us: "office_expense"
  });

  assert.ok(!flags.includes("ML"));
});

test("Imported Expense with a valid tax map still emits NC, not UM", () => {
  const flags = computeTransactionReviewFlags({
    id: "tx_ie",
    type: "expense",
    category_id: "cat_ie",
    category_name: "Imported Expense",
    receipt_count: 0,
    review_status: "ready",
    region: "US",
    tax_map_us: "other_expense"
  });

  assert.ok(flags.includes("NC"), "should be flagged as needs-category");
  assert.ok(!flags.includes("UM"), "should not be flagged as unmapped when category is imported placeholder");
});

test("Phone & Internet with valid tax map but no personal_use_pct emits AL not UM", () => {
  const flags = computeTransactionReviewFlags({
    id: "tx_phone",
    type: "expense",
    category_id: "cat_phone",
    category_name: "Phone & Internet",
    receipt_count: 1,
    review_status: "ready",
    region: "US",
    tax_map_us: "utilities",
    personal_use_pct: null
  });

  assert.ok(flags.includes("AL"), "should flag needs-allocation because personal_use_pct is absent");
  assert.ok(!flags.includes("UM"), "should not flag unmapped when tax map is present");
  assert.ok(!flags.includes("NC"), "should not flag uncategorized when category is real");
});

test("vehicle mileage flag still applies for obvious vehicle categories without receipts", () => {
  const flags = computeTransactionReviewFlags({
    id: "tx_2",
    type: "expense",
    category_id: "cat_2",
    category_name: "Vehicle Fuel",
    tax_treatment: "operating",
    receipt_count: 0,
    review_status: "ready",
    region: "US",
    tax_map_us: "vehicle_fuel"
  });

  assert.ok(flags.includes("ML"));
});
