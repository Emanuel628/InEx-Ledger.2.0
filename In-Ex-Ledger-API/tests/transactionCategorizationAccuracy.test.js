"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createTransactionCategorizer } = require("../services/transactionCategorizationService.js");

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

// Realistic bank/card-statement-style merchant + description strings — not bare
// keywords — so these exercise the same normalization (POS codes, store
// numbers, city/state suffixes) a real CSV import would produce.
const US_CASES = [
  { merchant: "WENDYS #4521", description: "WENDYS #4521 COLUMBUS OH", expected: "Meals" },
  { merchant: "MCDONALDS F41823", description: "MCDONALDS F41823 Q02", expected: "Meals" },
  { merchant: "STARBUCKS STORE 05123", description: "STARBUCKS STORE 05123", expected: "Meals" },
  { merchant: "BURGER KING #9981", description: "BURGER KING #9981 TAMPA FL", expected: "Meals" },
  { merchant: "TACO BELL 034521", description: "TACO BELL 034521", expected: "Meals" },
  { merchant: "CHIPOTLE 2214", description: "CHIPOTLE ONLINE 2214", expected: "Meals" },
  { merchant: "CHICK-FIL-A #01234", description: "CHICK-FIL-A #01234 ATLANTA GA", expected: "Meals" },
  { merchant: "DUNKIN #341055", description: "DUNKIN #341055", expected: "Meals" },
  { merchant: "PANERA BREAD #4471", description: "PANERA BREAD #4471", expected: "Meals" },
  { merchant: "FIVE GUYS 00231", description: "FIVE GUYS 00231", expected: "Meals" },
  { merchant: "DOMINOS PIZZA #7734", description: "DOMINOS PIZZA #7734 ONLINE", expected: "Meals" },
  { merchant: "IHOP #2091", description: "IHOP #2091 DENVER CO", expected: "Meals" },
  { merchant: "LOWES #00234", description: "LOWES #00234 HOME CENTER", expected: "Repairs & Maintenance" },
  { merchant: "STAPLES #0234", description: "STAPLES #0234 OFFICE SUPPLIES", expected: "Office Supplies" },
  { merchant: "THE HOME DEPOT #4471", description: "THE HOME DEPOT #4471", expected: "Repairs & Maintenance" },
  { merchant: "HARBOR FREIGHT TOOLS #341", description: "HARBOR FREIGHT TOOLS #341", expected: "Repairs & Maintenance" },
  { merchant: "SHELL OIL 48293", description: "SHELL OIL 48293 NEW JERSEY", expected: "Car & Truck Expenses" },
  { merchant: "CHEVRON 00934581", description: "CHEVRON 00934581", expected: "Car & Truck Expenses" },
  { merchant: "CIRCLE K #2734", description: "CIRCLE K #2734", expected: "Car & Truck Expenses" },
  { merchant: "WAWA #123", description: "WAWA #123", expected: "Car & Truck Expenses" },
  { merchant: "CASEYS #4471", description: "CASEYS GEN STORE #4471", expected: "Car & Truck Expenses" },
  { merchant: "7-ELEVEN #4471", description: "7-ELEVEN #4471", expected: "Car & Truck Expenses" },
  { merchant: "SHEETZ #00341", description: "SHEETZ #00341 FUEL", expected: "Car & Truck Expenses" },
  { merchant: "JIFFY LUBE #3341", description: "JIFFY LUBE #3341 OIL CHANGE", expected: "Car & Truck Expenses" },
  { merchant: "DISCOUNT TIRE #341", description: "DISCOUNT TIRE #341", expected: "Car & Truck Expenses" },
  { merchant: "HERTZ RENT A CAR", description: "HERTZ RENT A CAR RES 88341", expected: "Travel" },
  { merchant: "MARRIOTT HOTELS", description: "MARRIOTT HOTELS DOWNTOWN", expected: "Travel" },
  { merchant: "DELTA AIR LINES", description: "DELTA AIR LINES 0067234", expected: "Travel" },
  { merchant: "EXPEDIA.COM", description: "EXPEDIA.COM 84412 TRAVEL", expected: "Travel" },
  { merchant: "AIRBNB", description: "AIRBNB HMXYZ123", expected: "Travel" },
  { merchant: "ADOBE SYSTEMS", description: "ADOBE SYSTEMS *PHOTOSHOP SUB", expected: "Software & Subscriptions" },
  { merchant: "OPENAI", description: "OPENAI *CHATGPT PLUS SUB USD", expected: "Software & Subscriptions" },
  { merchant: "GITHUB", description: "GITHUB, INC. SUBSCRIPTION", expected: "Software & Subscriptions" },
  { merchant: "SLACK", description: "SLACK T-12345 MONTHLY", expected: "Software & Subscriptions" },
  { merchant: "ZOOM.US", description: "ZOOM.US 888-799-9666", expected: "Software & Subscriptions" },
  { merchant: "DROPBOX", description: "DROPBOX*ANNUAL SUBSCRIPTION", expected: "Software & Subscriptions" },
  { merchant: "MICROSOFT 365", description: "MICROSOFT 365 SUBSCRIPTION", expected: "Software & Subscriptions" },
  { merchant: "GOOGLE ADS", description: "GOOGLE ADS-XYZ123", expected: "Advertising & Marketing" },
  { merchant: "FACEBOOK ADS", description: "FACEBOOK ADS CAMPAIGN 8814", expected: "Advertising & Marketing" },
  { merchant: "MAILCHIMP", description: "MAILCHIMP *MONTHLY", expected: "Advertising & Marketing" },
  { merchant: "GEICO", description: "GEICO INSURANCE PAYMENT", expected: "Insurance" },
  { merchant: "PROGRESSIVE", description: "PROGRESSIVE INSURANCE PMT", expected: "Insurance" },
  { merchant: "STATE FARM", description: "STATE FARM INSURANCE", expected: "Insurance" },
  { merchant: "VERIZON WIRELESS", description: "VERIZON WIRELESS PAYMENT", expected: "Phone & Internet" },
  { merchant: "AT&T", description: "AT&T *PAYMENT", expected: "Phone & Internet" },
  { merchant: "COMCAST", description: "COMCAST CABLE COMM", expected: "Phone & Internet" },
  { merchant: "FEDEX", description: "FEDEX SHIP 12/03", expected: "Supplies" },
  { merchant: "UPS SHIPPING", description: "UPS SHIPPING CHARGES", expected: "Supplies" },
  { merchant: "USPS", description: "USPS PO 44123 POSTAGE", expected: "Supplies" },
  { merchant: "UPWORK", description: "UPWORK.COM ESCROW", expected: "Contract Labor" },
  { merchant: "FIVERR", description: "FIVERR INTERNATIONAL", expected: "Contract Labor" },
  { merchant: "PGE", description: "PGE ELECTRIC BILL PAYMENT", expected: "Utilities" },
  { merchant: "DUKE ENERGY", description: "DUKE ENERGY UTILITY PMT", expected: "Utilities" },
  { merchant: "NSF FEE", description: "NSF FEE RETURNED ITEM", expected: "Bank Fees" },
  { merchant: "OVERDRAFT FEE", description: "OVERDRAFT FEE CHARGE", expected: "Bank Fees" },
  { merchant: "STRIPE", description: "STRIPE PAYOUT - BULK SALES", expected: "Sales Revenue", kind: "income" },
  { merchant: "SHOPIFY PAYMENTS", description: "SHOPIFY PAYMENTS PAYOUT", expected: "Sales Revenue", kind: "income" }
];

const CA_CASES = [
  { merchant: "TIM HORTONS #4521", description: "TIM HORTONS #4521 TORONTO ON", expected: "Meals & Entertainment" },
  { merchant: "PIZZA PIZZA #331", description: "PIZZA PIZZA #331 CALGARY AB", expected: "Meals & Entertainment" },
  { merchant: "HARVEYS #221", description: "HARVEYS #221 OTTAWA ON", expected: "Meals & Entertainment" },
  { merchant: "BOSTON PIZZA #883", description: "BOSTON PIZZA #883", expected: "Meals & Entertainment" },
  { merchant: "MR SUB #1129", description: "MR SUB #1129", expected: "Meals & Entertainment" },
  { merchant: "PETRO-CANADA #4521", description: "PETRO-CANADA #4521 GAS", expected: "Motor Vehicle" },
  { merchant: "ESSO #3341", description: "ESSO #3341", expected: "Motor Vehicle" },
  { merchant: "CANADIAN TIRE GAS #123", description: "CANADIAN TIRE GAS #123 TORONTO ON", expected: "Motor Vehicle" },
  { merchant: "AIR CANADA", description: "AIR CANADA FLIGHT 0341", expected: "Travel" },
  { merchant: "WESTJET", description: "WESTJET 0067234", expected: "Travel" },
  { merchant: "ROGERS", description: "ROGERS COMMUNICATIONS PMT", expected: "Phone & Internet" },
  { merchant: "BELL CANADA", description: "BELL CANADA PAYMENT", expected: "Phone & Internet" },
  { merchant: "TELUS", description: "TELUS MOBILITY PAYMENT", expected: "Phone & Internet" },
  { merchant: "INTACT INSURANCE", description: "INTACT INSURANCE PREMIUM", expected: "Insurance" },
  { merchant: "CANADA POST", description: "CANADA POST POSTAGE", expected: "Delivery & Freight" },
  { merchant: "PUROLATOR", description: "PUROLATOR COURIER", expected: "Delivery & Freight" },
  { merchant: "BC HYDRO", description: "BC HYDRO UTILITY BILL", expected: "Utilities" },
  { merchant: "HYDRO ONE", description: "HYDRO ONE PAYMENT", expected: "Utilities" },
  { merchant: "QUICKBOOKS", description: "QUICKBOOKS ONLINE SUB", expected: "Software & Subscriptions" },
  { merchant: "SHOPIFY", description: "SHOPIFY MONTHLY SUB", expected: "Software & Subscriptions" },
  { merchant: "STRIPE PAYOUT", description: "STRIPE PAYOUT SALES", expected: "Sales Revenue", kind: "income" }
];

// Genuinely ambiguous/generic strings a real bank export contains constantly.
// None of these should get a confident (and likely wrong) category guess —
// this is the degree-of-certainty gate: below the minimum score, the engine
// must fall back to the Imported bucket for manual review instead of guessing.
const SHOULD_NOT_AUTO_MAP_CASES = [
  { merchant: "PURCHASE", description: "PURCHASE AUTHORIZED ON 05/01" },
  { merchant: "", description: "ONLINE PAYMENT THANK YOU" },
  { merchant: "TRANSFER", description: "TRANSFER TO CHECKING 8814" },
  { merchant: "Amazon.com", description: "Amzn.pmts USD 138.45" },
  { merchant: "", description: "DEBIT CARD PURCHASE" },
  { merchant: "PAYPAL", description: "PAYPAL *GENERIC" },
  // General-merchandise/big-box retailers sell literally everything, so a
  // purchase there is exactly as likely to be personal as business — these
  // must NOT get a confident "Office Supplies" (or any other) guess.
  { merchant: "WAL-MART #2145", description: "WAL-MART #2145 SUPERCENTER" },
  { merchant: "TARGET T-1234", description: "TARGET T-1234 CHICAGO IL" },
  { merchant: "COSTCO WHSE #0123", description: "COSTCO WHSE #0123" },
  { merchant: "BEST BUY 00001234", description: "BEST BUY 00001234" },
  { merchant: "CANADIAN TIRE #123", description: "CANADIAN TIRE #123 TORONTO ON" },
  { merchant: "LONDON DRUGS #221", description: "LONDON DRUGS #221" },
  { merchant: "DOLLARAMA #4471", description: "DOLLARAMA #4471" },
  // Grocery stores are the same "sells everything a household or a business
  // could buy" case as the big-box retailers above.
  { merchant: "WHOLE FOODS MARKET", description: "WHOLE FOODS MARKET #123" },
  { merchant: "TRADER JOES #456", description: "TRADER JOES #456" },
  // Capital One (and card issuers generally) show up in bank text either as
  // a credit-card statement payment/autopay or an account-to-account
  // transfer — never a real expense category — so these must stay unmapped
  // rather than default to whatever category a stray keyword happens to hit.
  { merchant: "CAPITAL ONE", description: "CAPITAL ONE MOBILE PYMT" },
  { merchant: "CAPITAL ONE", description: "CAPITAL ONE AUTOPAY PMT" },
  { merchant: "CAPITAL ONE AUTO FINANCE", description: "CAPITAL ONE AUTO FIN PMT" }
];

// Regression coverage for a normalization bug: matching used to check whether
// a normalized keyword was a raw substring of the normalized merchant/
// description text, with no word-boundary requirement. That let short
// keywords silently match *inside* unrelated words — "irs" inside "first",
// "cra" inside "aircraft"/"Sacramento", "gas" inside "Vegas", "esso" inside
// "espresso", "xero" inside "Xerox", "shaw" inside "shawarma", "rona" inside
// "Corona", "mobil" inside "mobile"/"T-Mobile", and "at&t" (which normalizes
// to "att") inside "attorney". Each of these previously produced either a
// confidently wrong category or (via an accidental score tie) an unearned
// fallback to Imported. Also covers the "e-transfer" keyword, which used to
// normalize down to the single letter "e" and (via that same unbounded
// substring check) matched almost every income transaction, forcing most
// income onto "Service Income" regardless of its actual source.
const WORD_BOUNDARY_COLLISION_CASES = [
  { merchant: "SMITH & JONES ATTORNEYS", description: "LEGAL RETAINER FEE", expected: "Legal & Professional" },
  { merchant: "FIRST NATIONAL BANK", description: "FIRST NATIONAL BANK MONTHLY FEE", expected: "Bank Fees" },
  { merchant: "MARRIOTT LAS VEGAS", description: "MARRIOTT LAS VEGAS HOTEL STAY", expected: "Travel" },
  { merchant: "XEROX", description: "XEROX TONER CARTRIDGE", expected: "Office Supplies" },
  { merchant: "T-MOBILE", description: "T-MOBILE MONTHLY BILL", expected: "Phone & Internet" }
];

const WORD_BOUNDARY_NO_MATCH_CASES = [
  { merchant: "SHAWARMA PALACE", description: "SHAWARMA PALACE LUNCH TAB" },
  { merchant: "TOTAL WINE", description: "CORONA BEER CASE 24PK" },
  { merchant: "ACME ESPRESSO SUPPLY CO", description: "ESPRESSO MACHINE PARTS ORDER" },
  { merchant: "RANDOM CLIENT LLC", description: "WIRE DEPOSIT", kind: "income" },
  { merchant: "ACME CORP", description: "ACME CORP INVOICE PAYMENT", kind: "income" }
];

function runCases(cases, region) {
  const categorize = createTransactionCategorizer({ categories: makeFullCategories(region), region });
  const failures = [];
  for (const testCase of cases) {
    const result = categorize({
      type: testCase.kind || "expense",
      merchantName: testCase.merchant,
      description: testCase.description
    });
    if (result.categoryName !== testCase.expected) {
      failures.push({ ...testCase, actual: result.categoryName, reason: result.reason });
    }
  }
  return failures;
}

test("US major-brand accuracy battery meets the minimum accuracy bar", () => {
  const failures = runCases(US_CASES, "US");
  const accuracy = (US_CASES.length - failures.length) / US_CASES.length;
  assert.deepEqual(failures, [], `Miscategorized: ${JSON.stringify(failures, null, 2)}`);
  assert.ok(accuracy >= 0.95, `Accuracy ${(accuracy * 100).toFixed(1)}% fell below the 95% bar`);
});

test("CA major-brand accuracy battery meets the minimum accuracy bar", () => {
  const failures = runCases(CA_CASES, "CA");
  const accuracy = (CA_CASES.length - failures.length) / CA_CASES.length;
  assert.deepEqual(failures, [], `Miscategorized: ${JSON.stringify(failures, null, 2)}`);
  assert.ok(accuracy >= 0.95, `Accuracy ${(accuracy * 100).toFixed(1)}% fell below the 95% bar`);
});

test("degree-of-certainty gate: ambiguous/generic transactions are not auto-mapped", () => {
  const categorize = createTransactionCategorizer({ categories: makeFullCategories("US"), region: "US" });
  for (const testCase of SHOULD_NOT_AUTO_MAP_CASES) {
    const result = categorize({ type: "expense", merchantName: testCase.merchant, description: testCase.description });
    assert.notEqual(
      result.reason,
      "canonical_rule",
      `Expected "${testCase.merchant} / ${testCase.description}" to stay unmapped, but it confidently guessed a category`
    );
  }
});

test("word-boundary regression: real keywords still match despite short/ambiguous substrings", () => {
  const failures = runCases(WORD_BOUNDARY_COLLISION_CASES, "US");
  assert.deepEqual(failures, [], `Miscategorized: ${JSON.stringify(failures, null, 2)}`);
});

test("word-boundary regression: unrelated words containing a keyword substring don't get miscategorized", () => {
  const categorize = createTransactionCategorizer({ categories: makeFullCategories("US"), region: "US" });
  for (const testCase of WORD_BOUNDARY_NO_MATCH_CASES) {
    const result = categorize({
      type: testCase.kind || "expense",
      merchantName: testCase.merchant,
      description: testCase.description
    });
    assert.notEqual(
      result.reason,
      "canonical_rule",
      `Expected "${testCase.merchant} / ${testCase.description}" to stay unmapped, but it confidently guessed "${result.categoryName}"`
    );
  }
});
