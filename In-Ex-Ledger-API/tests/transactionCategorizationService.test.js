"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTransactionCategorizer,
  resolveCanonicalCategoryTemplate,
  getImportedFallbackCategoryName
} = require("../services/transactionCategorizationService.js");

function makeCategories(region = "US") {
  if (region === "CA") {
    return [
      { id: "c1", name: "Motor Vehicle", kind: "expense" },
      { id: "c2", name: "Software & Subscriptions", kind: "expense" },
      { id: "c3", name: "Imported Expense", kind: "expense" },
      { id: "c4", name: "Service Income", kind: "income" },
      { id: "c5", name: "Imported Income", kind: "income" }
    ];
  }
  return [
    { id: "u1", name: "Car & Truck Expenses", kind: "expense" },
    { id: "u2", name: "Software & Subscriptions", kind: "expense" },
    { id: "u3", name: "Imported Expense", kind: "expense" },
    { id: "u4", name: "Service Income", kind: "income" },
    { id: "u5", name: "Imported Income", kind: "income" }
  ];
}

test("categorizer learns a stable merchant-to-category mapping from prior business history", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US",
    historyRows: [
      { merchant_name: "OpenAI", description: "OPENAI API", category_name: "Software & Subscriptions", category_kind: "expense" },
      { merchant_name: "OpenAI", description: "OPENAI CREDITS", category_name: "Software & Subscriptions", category_kind: "expense" }
    ]
  });

  const result = categorize({
    type: "expense",
    merchantName: "OpenAI",
    description: "OPENAI *API usage May"
  });

  assert.equal(result.categoryName, "Software & Subscriptions");
  assert.equal(result.reason, "merchant_history");
});

test("categorizer ignores low-signal generic history keys and falls back to canonical rules", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US",
    historyRows: [
      { merchant_name: "", description: "PAYMENT", category_name: "Software & Subscriptions", category_kind: "expense" },
      { merchant_name: "", description: "PAYMENT", category_name: "Software & Subscriptions", category_kind: "expense" }
    ]
  });

  const result = categorize({
    type: "expense",
    merchantName: "Shell",
    description: "Shell fuel purchase"
  });

  assert.equal(result.categoryName, "Car & Truck Expenses");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer maps canonical vehicle rules to seeded US and Canada category names", () => {
  const usCategorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US"
  });
  const caCategorize = createTransactionCategorizer({
    categories: makeCategories("CA"),
    region: "CA"
  });

  assert.equal(
    usCategorize({ type: "expense", description: "Shell fuel purchase", merchantName: "Shell" }).categoryName,
    "Car & Truck Expenses"
  );
  assert.equal(
    caCategorize({ type: "expense", description: "Shell fuel purchase", merchantName: "Shell" }).categoryName,
    "Motor Vehicle"
  );
});

test("categorizer uses imported fallback buckets for review-only transfer and card-payment patterns", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US"
  });

  const result = categorize({
    type: "expense",
    description: "ONLINE PAYMENT THANK YOU",
    merchantName: ""
  });

  assert.equal(result.categoryName, "Imported Expense");
  assert.equal(result.reason, "review_only_pattern");
  assert.equal(getImportedFallbackCategoryName("expense"), "Imported Expense");
});

test("categorizer uses provider category hints when descriptions are weak", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US"
  });

  const result = categorize({
    type: "expense",
    description: "ACH DEBIT",
    merchantName: "",
    categoryGuess: "INTERNET_SOFTWARE"
  });

  assert.equal(result.categoryName, "Software & Subscriptions");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer applies persisted business mapping rules before history and generic rules", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US",
    mappingRules: [
      {
        transaction_kind: "expense",
        match_field: "merchant_name",
        match_value_normalized: "openai",
        category_name: "Software & Subscriptions"
      }
    ],
    historyRows: [
      { merchant_name: "OpenAI", description: "OPENAI API", category_name: "Car & Truck Expenses", category_kind: "expense" },
      { merchant_name: "OpenAI", description: "OPENAI API", category_name: "Car & Truck Expenses", category_kind: "expense" }
    ]
  });

  const result = categorize({
    type: "expense",
    merchantName: "OpenAI",
    description: "OPENAI API MAY"
  });

  assert.equal(result.categoryName, "Software & Subscriptions");
  assert.equal(result.reason, "mapping_rule");
});

test("resolveCanonicalCategoryTemplate preserves seeded defaults and imported fallbacks", () => {
  assert.deepEqual(resolveCanonicalCategoryTemplate("Software & Subscriptions", "expense", "US"), {
    color: "blue",
    tax_map_us: "software_subscriptions",
    tax_map_ca: null
  });

  assert.deepEqual(resolveCanonicalCategoryTemplate("Imported Income", "income", "CA"), {
    color: "slate",
    tax_map_us: null,
    tax_map_ca: "other_income"
  });
});
