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
      { id: "c9", name: "Sales Revenue", kind: "income" },
      { id: "c10", name: "Interest & Bank Charges", kind: "expense" },
      { id: "c11", name: "Delivery & Freight", kind: "expense" },
      { id: "c12", name: "Legal & Accounting Fees", kind: "expense" },
      { id: "c13", name: "Business Tax & Licenses", kind: "expense" },
      { id: "c14", name: "Utilities", kind: "expense" },
      { id: "c15", name: "Other Expense", kind: "expense" }
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
    { id: "u9", name: "Sales Revenue", kind: "income" },
    { id: "u10", name: "Bank Fees", kind: "expense" },
    { id: "u11", name: "Supplies", kind: "expense" },
    { id: "u12", name: "Legal & Professional", kind: "expense" },
    { id: "u13", name: "Sales Tax", kind: "expense" },
    { id: "u14", name: "Utilities", kind: "expense" },
    { id: "u15", name: "Repairs & Maintenance", kind: "expense" },
    { id: "u16", name: "Insurance", kind: "expense" }
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

test("categorizer does not use the raw category_guess field as keyword text", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US"
  });

  // categoryGuess is a bank/Plaid raw guess, not merchant or description
  // text. It used to get merged into the same haystack the keyword matcher
  // scans, so a generic bank label like "INTERNET_SOFTWARE" could fire the
  // Software rule's own (now-removed) bare "software"/"internet" keywords
  // even with no real merchant or description signal at all. With merchant
  // and description both empty/uninformative, this should land in Imported.
  const result = categorize({
    type: "expense",
    description: "ACH DEBIT",
    merchantName: "",
    categoryGuess: "INTERNET_SOFTWARE"
  });

  assert.equal(result.categoryName, "Imported Expense");
  assert.equal(result.reason, "fallback_imported");
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
  // Only a description-field hit (no merchant-field match), which clears the
  // minimum score to auto-map but is correctly labeled "low" confidence —
  // weaker evidence than an actual merchant-name hit.
  assert.equal(result.confidence, "low");
});

test("categorizer carries legacy CSV merchant coverage into the active import mapper", () => {
  const usCategorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const caCategorize = createTransactionCategorizer({ categories: makeCategories("CA"), region: "CA" });

  assert.equal(usCategorize({ type: "expense", merchantName: "FedEx", description: "Courier service" }).categoryName, "Supplies");
  assert.equal(caCategorize({ type: "expense", merchantName: "Canada Post", description: "Postage" }).categoryName, "Delivery & Freight");
  assert.equal(usCategorize({ type: "expense", merchantName: "Monthly Banking", description: "Account service fee" }).categoryName, "Bank Fees");
  assert.equal(caCategorize({ type: "expense", merchantName: "Service Ontario", description: "Business license renewal" }).categoryName, "Business Tax & Licenses");
  assert.equal(usCategorize({ type: "expense", merchantName: "Microsoft 365", description: "Annual subscription" }).categoryName, "Software & Subscriptions");
  assert.equal(caCategorize({ type: "expense", merchantName: "Bell Canada", description: "Business internet" }).categoryName, "Phone & Internet");
});

// Regression tests: auto-mapping accuracy audit fixes

test("categorizer never maps 'Capital One Mobile Payment' to Car & Truck Expenses (mobil/mobile substring bug)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Capital One", description: "Mobile Payment" });
  assert.notEqual(result.categoryName, "Car & Truck Expenses");
  assert.equal(result.categoryName, "Imported Expense");
  assert.equal(result.reason, "card_issuer_payment");
});

test("categorizer maps 'T-Mobile' to Phone & Internet, never Car & Truck Expenses", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "T-Mobile", description: "Monthly wireless bill" });
  assert.equal(result.categoryName, "Phone & Internet");
});

test("categorizer maps 'Mint Mobile' to Phone & Internet, never Car & Truck Expenses", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Mint Mobile", description: "Wireless plan" });
  assert.equal(result.categoryName, "Phone & Internet");
});

test("categorizer still maps a real standalone 'Mobil' gas station to Car & Truck Expenses (control — no regression)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Mobil", description: "Mobil 12345 Gas Station" });
  assert.equal(result.categoryName, "Car & Truck Expenses");
});

test("categorizer does not let a 'mobile payment' description match the 'Mobil' gas station keyword", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "T-Mobile", description: "Mobile payment received" });
  assert.notEqual(result.categoryName, "Car & Truck Expenses");
});

test("categorizer maps 'Circle K Gas' to Car & Truck Expenses (fuel-qualified, no regression)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Circle K Gas", description: "Fuel purchase" });
  assert.equal(result.categoryName, "Car & Truck Expenses");
});

for (const merchant of ["Walmart Supercenter", "Target", "Costco Wholesale", "Sams Club", "Best Buy", "IKEA"]) {
  test(`categorizer leaves ambiguous big-box retailer '${merchant}' in Imported Expense`, () => {
    const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
    const result = categorize({ type: "expense", merchantName: merchant, description: "Purchase" });
    assert.equal(result.categoryName, "Imported Expense");
    assert.equal(result.reason, "ambiguous_retailer");
  });
}

for (const merchant of ["7-Eleven", "Circle K", "Wawa", "Sheetz", "Kum & Go", "Casey's", "Royal Farms"]) {
  test(`categorizer leaves convenience-store/fuel hybrid '${merchant}' in Imported Expense instead of Car & Truck Expenses`, () => {
    const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
    const result = categorize({ type: "expense", merchantName: merchant, description: "Purchase" });
    assert.notEqual(result.categoryName, "Car & Truck Expenses");
    assert.equal(result.categoryName, "Imported Expense");
  });
}

test("categorizer still maps fuel-qualified ambiguous retailers to Car & Truck Expenses (control — no regression)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "Costco Gas", description: "Fuel purchase" }).categoryName, "Car & Truck Expenses");
  assert.equal(categorize({ type: "expense", merchantName: "Sheetz Fuel", description: "Fuel purchase" }).categoryName, "Car & Truck Expenses");
  assert.equal(categorize({ type: "expense", merchantName: "Sams Club Fuel", description: "" }).categoryName, "Car & Truck Expenses");
});

test("categorizer does not auto-map bare generic single-word keywords alone", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "food" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "phone" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "internet" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "subscription" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "software" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "marketing" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Unknown Merchant", description: "vehicle" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "income", merchantName: "Some Company", description: "payout" }).categoryName, "Imported Income");
});

test("categorizer does not let soft repeated keywords stack into a false-confidence score", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "", description: "FOOD MEAL DINING PURCHASE" });
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer routes Capital One / Chase / Amex issuer-plus-payment lines to review instead of an expense category", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "Capital One", description: "Autopay" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Chase", description: "Credit Crd Payment" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Amex", description: "Epayment" }).categoryName, "Imported Expense");
});

test("categorizer still maps 'TD Insurance' / 'RBC Insurance' to Insurance (control — issuer+payment check doesn't hijack insurance brands)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "TD Insurance", description: "Business liability premium" }).categoryName, "Insurance");
  assert.equal(categorize({ type: "expense", merchantName: "RBC Insurance", description: "Business liability premium" }).categoryName, "Insurance");
});

test("categorizer routes Interac e-Transfer / Zelle / Venmo to Imported Income instead of Service Income", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "income", merchantName: "", description: "Interac e-Transfer received" }).categoryName, "Imported Income");
  assert.equal(categorize({ type: "income", merchantName: "Zelle", description: "Payment received" }).categoryName, "Imported Income");
  assert.equal(categorize({ type: "income", merchantName: "Venmo", description: "Payment received" }).categoryName, "Imported Income");
});

test("categorizer no longer auto-maps bare processor names ('stripe', 'paypal', 'square') to Service Income", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "income", merchantName: "Stripe", description: "" }).categoryName, "Imported Income");
  assert.equal(categorize({ type: "income", merchantName: "PayPal", description: "" }).categoryName, "Imported Income");
  assert.equal(categorize({ type: "income", merchantName: "Square", description: "" }).categoryName, "Imported Income");
});

test("categorizer maps industrial MRO suppliers to Repairs & Maintenance, not Office Supplies", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Grainger", description: "Industrial supplies" });
  assert.equal(result.categoryName, "Repairs & Maintenance");
});

test("categorizer no longer maps fintech expense-card platforms to Software & Subscriptions", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "Ramp", description: "Ramp Card" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Brex", description: "" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "Bill.com", description: "" }).categoryName, "Imported Expense");
});

test("categorizer maps CA Contract Labor merchants to Other Expense, not Legal & Accounting Fees", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("CA"), region: "CA" });
  const result = categorize({ type: "expense", merchantName: "Upwork", description: "Contractor payment" });
  assert.equal(result.categoryName, "Other Expense");
});

test("categorizer requires at least two consistent history rows before trusting a merchant/description pattern", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US",
    historyRows: [
      { merchant_name: "Unusual Vendor Co", description: "One-time correction", category_name: "Software & Subscriptions", category_kind: "expense" }
    ]
  });

  const result = categorize({ type: "expense", merchantName: "Unusual Vendor Co", description: "Recurring charge" });
  assert.notEqual(result.reason, "merchant_history");
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer does not learn history for ambiguous retailers even from repeated rows", () => {
  const categorize = createTransactionCategorizer({
    categories: makeCategories("US"),
    region: "US",
    historyRows: [
      { merchant_name: "Walmart", description: "Grocery run", category_name: "Office Supplies", category_kind: "expense" },
      { merchant_name: "Walmart", description: "Grocery run", category_name: "Office Supplies", category_kind: "expense" },
      { merchant_name: "Walmart", description: "Grocery run", category_name: "Office Supplies", category_kind: "expense" }
    ]
  });

  const result = categorize({ type: "expense", merchantName: "Walmart", description: "Grocery run" });
  assert.notEqual(result.categoryName, "Office Supplies");
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer falls back to Imported when a canonical rule's category doesn't exist on the business", () => {
  const categoriesWithoutSupplies = [
    { id: "u1", name: "Car & Truck Expenses", kind: "expense" },
    { id: "u3", name: "Imported Expense", kind: "expense" }
  ];
  const categorize = createTransactionCategorizer({ categories: categoriesWithoutSupplies, region: "US" });
  const result = categorize({ type: "expense", merchantName: "FedEx", description: "Courier service" });
  assert.equal(result.categoryName, "Imported Expense");
  assert.equal(result.reason, "fallback_imported");
});

// Regression tests: mapping-hardening pass (issuer aliases, blocklist growth,
// merchant-only soft keywords)

test("categorizer still maps a real 'Tony's Pizza' merchant to Meals (control — merchant-field soft keywords still count)", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({ type: "expense", merchantName: "Tony's Pizza Shop", description: "Order 4471" });
  assert.equal(result.categoryName, "Meals");
});

test("categorizer does not let a description-only soft meal word plus a provider hint clear the auto-map floor", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({
    type: "expense",
    merchantName: "",
    description: "coffee meeting reimbursement",
    categoryGuess: "FOOD_AND_DRINK"
  });
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer does not let a description-only bare 'gas' plus a provider hint clear the auto-map floor", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  const result = categorize({
    type: "expense",
    merchantName: "",
    description: "gas reimbursement",
    categoryGuess: "AUTOMOTIVE"
  });
  assert.equal(result.categoryName, "Imported Expense");
});

test("categorizer routes bare RBC/TD/BMO ticker + payment idiom to review without hijacking their insurance products", () => {
  const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
  assert.equal(categorize({ type: "expense", merchantName: "RBC", description: "RBC Bill Payment" }).categoryName, "Imported Expense");
  assert.equal(categorize({ type: "expense", merchantName: "TD", description: "TD Pre-Authorized Payment" }).categoryName, "Imported Expense");
});

for (const merchant of ["Kroger", "Safeway", "Whole Foods Market", "CVS Pharmacy", "Walgreens", "Dollar General", "Macy's"]) {
  test(`categorizer leaves grocery/pharmacy/discount retailer '${merchant}' in Imported Expense`, () => {
    const categorize = createTransactionCategorizer({ categories: makeCategories("US"), region: "US" });
    const result = categorize({ type: "expense", merchantName: merchant, description: "Purchase" });
    assert.equal(result.categoryName, "Imported Expense");
    assert.equal(result.reason, "ambiguous_retailer");
  });
}
