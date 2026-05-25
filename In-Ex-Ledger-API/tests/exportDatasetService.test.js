"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildNormalizedExportDataset } = require("../services/exportDatasetService.js");

function buildFixture(overrides = {}) {
  return {
    transactions: [
      { id: "income1", type: "income", amount: 1200, category_id: "sales", account_id: "bank", date: "2026-04-01", description: "Client invoice", payer_name: "Acme Client", tax_form_type: "1099-NEC" },
      { id: "fuel1", type: "expense", amount: 45, category_id: "fuel", account_id: "bank", date: "2026-04-02", description: "Shell fuel" },
      { id: "meal1", type: "expense", amount: 24, category_id: "meals", account_id: "bank", date: "2026-04-03", description: "Client lunch" },
      { id: "phone1", type: "expense", amount: 80, category_id: "phone", account_id: "bank", date: "2026-04-04", description: "Phone service" },
      { id: "home1", type: "expense", amount: 220, category_id: "home_office", account_id: "bank", date: "2026-04-04", description: "Home office internet and utilities" },
      { id: "asset1", type: "expense", amount: 2400, category_id: "equipment", account_id: "bank", date: "2026-04-04", description: "Laptop for business" },
      { id: "imported1", type: "expense", amount: 18, category_id: "imported_expense", account_id: "bank", date: "2026-04-05", description: "Imported row" },
      { id: "transfer1", type: "expense", amount: 300, category_id: "imported_expense", account_id: "bank", date: "2026-04-06", description: "TRANSFER TO SAV XXXXX7188" },
      { id: "cc1", type: "expense", amount: 250, category_id: "imported_expense", account_id: "bank", date: "2026-04-07", description: "CITI CARD ONLINE PAYMENT" },
      { id: "loan1", type: "expense", amount: 90, category_id: "imported_expense", account_id: "bank", date: "2026-04-08", description: "AFFIRM * PAY" },
      { id: "pay1", type: "income", amount: 1000, category_id: "imported_income", account_id: "bank", date: "2026-04-09", description: "GIVAUDAN FLAVORS PAYROLL" },
      { id: "ref1", type: "income", amount: 75, category_id: "imported_income", account_id: "bank", date: "2026-04-10", description: "IRS TREAS 310 TAX REF" },
      { id: "cash1", type: "income", amount: 8, category_id: "imported_income", account_id: "bank", date: "2026-04-11", description: "Cash Redemption" },
      { id: "rev1", type: "income", amount: 12, category_id: "imported_income", account_id: "bank", date: "2026-04-12", description: "Reversal: APPLE.COM/BILL" },
      { id: "imported_income1", type: "income", amount: 60, category_id: "imported_income", account_id: "bank", date: "2026-04-13", description: "Zelle payment from Mike" }
    ],
    accounts: [{ id: "bank", name: "Checking", type: "bank" }],
    categories: [
      { id: "sales", name: "Sales Revenue", kind: "income", tax_map_us: "Line 1 - Gross receipts or sales", tax_map_ca: "Line 8000 - Gross business income" },
      { id: "fuel", name: "Fuel & Gas", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "meals", name: "Food & Dining", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "phone", name: "Phone & Internet", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "home_office", name: "Home Office", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "equipment", name: "Equipment & Machinery", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "imported_expense", name: "Imported Expense", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "imported_income", name: "Imported Income", kind: "income", tax_map_us: "", tax_map_ca: "" }
    ],
    receipts: [{ id: "r1", transaction_id: "meal1", filename: "meal.pdf" }],
    mileage: [{ id: "m1", trip_date: "2026-04-02", purpose: "Client visit", destination: "Downtown", miles: 12.5 }],
    vehicleCosts: [{ id: "vc1", entry_type: "fuel", entry_date: "2026-04-02", title: "Fuel", vendor: "Shell", amount: "45.00" }],
    business: {
      id: "biz1",
      name: "Jose Consulting",
      region: "US",
      province: "",
      gst_hst_registered: false
    },
    region: "US",
    currency: "USD",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    ...overrides
  };
}

test("dataset excludes transfers, card payments, payroll, tax refunds, cashback, reversal, and debt payments from P&L", () => {
  const dataset = buildNormalizedExportDataset(buildFixture());
  assert.equal(dataset.includedRows.length, 8);
  assert.equal(dataset.excludedRows.length, 7);
  assert.equal(dataset.totals.grossIncome, 1260);
  assert.equal(dataset.totals.totalExpenses, 375);
  assert.deepEqual(dataset.excludedRows.map((row) => row.exclusionCode).sort(), [
    "CC PAY",
    "CASHBACK",
    "LOAN/DEBT",
    "PAYROLL",
    "REFUND/REV",
    "TAX REF",
    "TRANSFER"
  ].sort());
});

test("dataset marks imported expense and unresolved imported income conservatively", () => {
  const dataset = buildNormalizedExportDataset(buildFixture());
  const importedExpense = dataset.includedRows.find((row) => row.id === "imported1");
  const importedIncome = dataset.includedRows.find((row) => row.id === "imported_income1");
  assert.equal(importedExpense.mappingStatus, "Needs category");
  assert.ok(importedExpense.reviewFlags.includes("NC"));
  assert.ok(importedExpense.reviewFlags.includes("UM"));
  assert.equal(importedIncome.mappingStatus, "Needs category");
  assert.ok(importedIncome.reviewFlags.includes("NC"));
  assert.ok(importedIncome.reviewFlags.includes("RV"));
  assert.equal(importedIncome.taxLineLabel, "");
});

test("dataset maps US fuel, meals, and phone rows to review lines with support flags", () => {
  const dataset = buildNormalizedExportDataset(buildFixture());
  const fuel = dataset.includedRows.find((row) => row.id === "fuel1");
  const meals = dataset.includedRows.find((row) => row.id === "meal1");
  const phone = dataset.includedRows.find((row) => row.id === "phone1");
  assert.equal(fuel.taxLine, "Line 9");
  assert.ok(fuel.reviewFlags.includes("ML"));
  assert.equal(meals.taxLine, "Line 24b");
  assert.ok(meals.reviewFlags.includes("BP"));
  assert.equal(phone.taxLine, "Line 25/27a");
  assert.ok(phone.reviewFlags.includes("AL"));
});

test("dataset maps Canada rows with tax_map_ca-aware output", () => {
  const dataset = buildNormalizedExportDataset(buildFixture({
    region: "CA",
    currency: "CAD",
    business: { id: "biz1", name: "Maple Co", region: "CA", province: "ON", gst_hst_registered: true }
  }));
  const fuel = dataset.includedRows.find((row) => row.id === "fuel1");
  const meals = dataset.includedRows.find((row) => row.id === "meal1");
  const phone = dataset.includedRows.find((row) => row.id === "phone1");
  const income = dataset.includedRows.find((row) => row.id === "income1");
  assert.equal(income.taxLineLabel, "Line 8000 - Gross business income");
  assert.equal(fuel.taxLine, "Line 9281");
  assert.ok(fuel.reviewFlags.includes("ML"));
  assert.equal(meals.taxLine, "Line 8523");
  assert.ok(meals.reviewFlags.includes("BP"));
  assert.equal(phone.taxLine, "Line 9270");
  assert.ok(phone.reviewFlags.includes("AL"));
});

test("dataset totals and summaries stay internally consistent", () => {
  const dataset = buildNormalizedExportDataset(buildFixture());
  assert.equal(dataset.totals.includedCount, dataset.includedRows.length);
  assert.equal(dataset.totals.excludedCount, dataset.excludedRows.length);
  assert.equal(dataset.totals.needsCategoryCount, dataset.supportSummary.needsCategoryCount);
  assert.equal(dataset.totals.mappedSupportCount, dataset.mappingSummary.mapped_review_count);
  assert.equal(dataset.totals.trulyUnmappedCount, dataset.mappingSummary.unmapped_count);
  assert.equal(dataset.totals.missingReceiptCount, dataset.receiptSummary.missing);
});

test("support artifacts clear matching review flags and receipt gaps", () => {
  const supportArtifactMap = new Map([
    ["fuel1", [{ artifact_type: "mileage_log", review_status: "accepted" }, { artifact_type: "receipt", review_status: "accepted" }]],
    ["meal1", [{ artifact_type: "review_note", review_status: "accepted", notes: "Client meal" }]],
    ["phone1", [{ artifact_type: "allocation_worksheet", review_status: "accepted" }]],
    ["home1", [{ artifact_type: "home_office_worksheet", review_status: "accepted" }]],
    ["asset1", [{ artifact_type: "capital_asset_support", review_status: "accepted" }]]
  ]);
  const dataset = buildNormalizedExportDataset(buildFixture({ supportArtifactMap }));
  const fuel = dataset.includedRows.find((row) => row.id === "fuel1");
  const meals = dataset.includedRows.find((row) => row.id === "meal1");
  const phone = dataset.includedRows.find((row) => row.id === "phone1");
  const homeOffice = dataset.includedRows.find((row) => row.id === "home1");
  const capitalAsset = dataset.includedRows.find((row) => row.id === "asset1");

  assert.ok(!fuel.reviewFlags.includes("ML"));
  assert.ok(!fuel.reviewFlags.includes("RS"));
  assert.ok(!meals.reviewFlags.includes("BP"));
  assert.ok(!phone.reviewFlags.includes("AL"));
  assert.ok(!homeOffice.reviewFlags.includes("HO"));
  assert.ok(!homeOffice.reviewFlags.includes("FC"));
  assert.ok(!capitalAsset.reviewFlags.includes("CA"));
  assert.ok(!capitalAsset.reviewFlags.includes("FC"));
  assert.ok(dataset.totals.missingReceiptCount < buildNormalizedExportDataset(buildFixture()).totals.missingReceiptCount);
});

test("resolved reviewer issues suppress open blockers in the normalized dataset", () => {
  const dataset = buildNormalizedExportDataset(buildFixture({
    reviewStateRows: [
      {
        transaction_id: "meal1",
        issue_code: "needs_business_purpose",
        issue_severity: "hard",
        issue_status: "resolved",
        review_notes: "Handled by reviewer"
      },
      {
        transaction_id: "meal1",
        issue_code: "final_confirmation_needed",
        issue_severity: "hard",
        issue_status: "resolved",
        review_notes: "Handled by reviewer"
      }
    ]
  }));
  const meals = dataset.includedRows.find((row) => row.id === "meal1");
  assert.ok(!meals.reviewFlags.includes("BP"));
  assert.equal(meals.reviewStatus, "Mapped");
  assert.equal(meals.openHardReviewerIssueCount, 0);
});

test("open reviewer-only issues are carried into export rows and totals", () => {
  const dataset = buildNormalizedExportDataset(buildFixture({
    reviewStateRows: [
      {
        transaction_id: "fuel1",
        issue_code: "reviewer_note",
        issue_severity: "warning",
        issue_status: "open",
        review_notes: "Double-check source memo"
      }
    ]
  }));
  const fuel = dataset.includedRows.find((row) => row.id === "fuel1");
  assert.equal(fuel.reviewIssueEntries.some((entry) => entry.issueCode === "reviewer_note"), true);
  assert.equal(dataset.totals.openWarningReviewerIssueCount > 0, true);
});
