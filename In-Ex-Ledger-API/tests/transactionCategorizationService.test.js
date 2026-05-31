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
      { id: "c5", name: "Imported Income", kind: "income" },
      { id: "c6", name: "Meals & Entertainment", kind: "expense" },
      { id: "c7", name: "Phone & Internet", kind: "expense" },
      { id: "c8", name: "Advertising", kind: "expense" },
      { id: "c9", name: "Sales Revenue", kind: "income" }
    ];
  }
  return [
    { id: "u1", name: "Car & Truck Expenses", kind: "expense" },
    { id: "u2", name: "Software & Subscriptions", kind: "expense" },
    { id: "u3", name: "Imported Expense", kind: "expense" },
    { id: "u4", name: "Service Income", kind: "income" },
    { id: "u5", name: "Imported Income", kind: "income" },
    { id: "u6", name: "Meals", kind: "expense" },
    { id: "u7", name: "Phone & Internet", kind: "expense" },
    { id: "u8", name: "Advertising & Marketing", kind: "expense" },
    { id: "u9", name: "Sales Revenue", kind: "income" }
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
        id: "rule-openai",
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
  assert.equal(result.ruleId, "rule-openai");
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

// Regression tests: merchant scoring and normalization fixes

test("categorizer maps 'Adobe Systems *Photoshop Sub' to Software & Subscriptions", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Adobe Systems", description: "*Photoshop Sub" });
  assert.equal(result.categoryName, "Software & Subscriptions");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer maps 'OpenAI *ChatGPT Plus Sub USD' to Software & Subscriptions", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "OpenAI", description: "*ChatGPT Plus Sub USD" });
  assert.equal(result.categoryName, "Software & Subscriptions");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer maps 'Uber* Eats Business Lunch' to Meals", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Uber* Eats", description: "Business Lunch" });
  assert.equal(result.categoryName, "Meals");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer maps 'Shell Oil 48293 New Jersey' to Car & Truck Expenses", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Shell Oil 48293", description: "New Jersey" });
  assert.equal(result.categoryName, "Car & Truck Expenses");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer maps 'Stripe Payout - Bulk Sales' to Sales Revenue, not Service Income", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "income", merchantName: "Stripe", description: "Payout - Bulk Sales" });
  assert.equal(result.categoryName, "Sales Revenue");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer does not auto-map broad merchant 'Amazon.com*Amzn.pmts' without supporting hints", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Amazon.com", description: "Amzn.pmts USD 138.45" });
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer still maps 'Comcast Business Internet' to Phone & Internet (control — no regression)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Comcast Business", description: "Internet" });
  assert.equal(result.categoryName, "Phone & Internet");
  assert.equal(result.reason, "canonical_rule");
});

test("categorizer still maps 'Facebook Ads - Campaign 1' to Advertising & Marketing (control — no regression)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Facebook", description: "Ads - Campaign 1" });
  assert.equal(result.categoryName, "Advertising & Marketing");
  assert.equal(result.reason, "canonical_rule");
  assert.equal(result.confidence, "medium");
});
