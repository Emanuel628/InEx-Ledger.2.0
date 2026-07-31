"use strict";

// Golden-file regression suite: a fixed set of real-bank-statement-style
// lines with a known-correct expected outcome for each. Every categorization
// bug fix in this file's history added cases here specifically so a future
// keyword/scoring change can't silently regress one of them -- the fixture
// is the record of "this used to be broken, don't let it happen again."
//
// Keep additions here representative and deliberate, not padded for volume:
// a curated few hundred lines that each encode a real lesson is worth more
// than a mechanically-generated few thousand that don't.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createTransactionCategorizer } = require("../services/transactionCategorizationService.js");

const FIXTURE_PATH = path.join(__dirname, "fixtures", "statement-lines.json");
const MIN_ACCURACY = 0.97;

function loadFixtureLines() {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  return JSON.parse(raw);
}

// Full canonical category set per region (see api/utils/seedDefaultsForBusiness.js),
// so every keyword-rule target category actually exists for the categorizer to map into.
function makeFullCategories(region) {
  if (region === "CA") {
    return [
      "Sales Revenue", "Service Income", "GST/HST Collected", "Grants & Subsidies", "Other Income"
    ].map((name) => ({ id: `income:${name}`, name, kind: "income" })).concat([
      "Advertising", "Business Tax & Licenses", "Delivery & Freight", "GST/HST Paid", "Home Office",
      "Insurance", "Interest & Bank Charges", "Legal & Accounting Fees", "Meals & Entertainment",
      "Motor Vehicle", "Office Expenses", "Office Supplies", "Phone & Internet", "Property Taxes",
      "Rent", "Repairs & Maintenance", "Salaries & Wages", "Software & Subscriptions", "Travel",
      "Utilities", "Other Expense"
    ].map((name) => ({ id: `expense:${name}`, name, kind: "expense" }))).concat([
      { id: "imported-income", name: "Imported Income", kind: "income" },
      { id: "imported-expense", name: "Imported Expense", kind: "expense" }
    ]);
  }

  return [
    "Sales Revenue", "Service Income", "Interest Income", "Other Income"
  ].map((name) => ({ id: `income:${name}`, name, kind: "income" })).concat([
    "Advertising & Marketing", "Bank Fees", "Car & Truck Expenses", "Contract Labor", "Home Office",
    "Insurance", "Legal & Professional", "Meals", "Office Supplies", "Phone & Internet", "Rent",
    "Repairs & Maintenance", "Sales Tax", "Software & Subscriptions", "Supplies", "Travel",
    "Utilities", "Wages & Salaries", "Other Expense"
  ].map((name) => ({ id: `expense:${name}`, name, kind: "expense" }))).concat([
    { id: "imported-income", name: "Imported Income", kind: "income" },
    { id: "imported-expense", name: "Imported Expense", kind: "expense" }
  ]);
}

function evaluateLine(categorizer, line) {
  const result = categorizer({
    type: line.type,
    merchantName: line.merchant,
    description: line.description
  });

  const expectsImported = line.expectedCategory === "IMPORTED";
  const categoryOk = expectsImported
    ? /^Imported (Income|Expense)$/.test(result.categoryName)
    : result.categoryName === line.expectedCategory;
  const reasonOk = !line.expectedReason || result.reason === line.expectedReason;

  return { ok: categoryOk && reasonOk, actual: result };
}

test("golden-file statement-lines regression suite meets the accuracy floor", () => {
  const lines = loadFixtureLines();
  assert.ok(lines.length >= 100, "fixture should carry a meaningful number of cases");

  const categorizerByRegion = {
    US: createTransactionCategorizer({ categories: makeFullCategories("US"), region: "US" }),
    CA: createTransactionCategorizer({ categories: makeFullCategories("CA"), region: "CA" })
  };

  const failures = [];
  for (const line of lines) {
    const categorizer = categorizerByRegion[line.region] || categorizerByRegion.US;
    const { ok, actual } = evaluateLine(categorizer, line);
    if (!ok) {
      failures.push({
        merchant: line.merchant,
        description: line.description,
        region: line.region,
        expectedCategory: line.expectedCategory,
        expectedReason: line.expectedReason,
        actualCategory: actual.categoryName,
        actualReason: actual.reason
      });
    }
  }

  const accuracy = (lines.length - failures.length) / lines.length;
  assert.deepEqual(failures, [], `Miscategorized ${failures.length}/${lines.length}: ${JSON.stringify(failures, null, 2)}`);
  assert.ok(accuracy >= MIN_ACCURACY, `Accuracy ${(accuracy * 100).toFixed(1)}% fell below the ${MIN_ACCURACY * 100}% floor`);
});
