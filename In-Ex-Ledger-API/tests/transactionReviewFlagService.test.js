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
