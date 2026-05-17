"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildNormalizedExportDataset } = require("../services/exportDatasetService.js");
const {
  escapeCsv,
  buildBasicLedgerCsv,
  buildFullCpaCsv,
  buildExcludedItemsCsv,
  buildCategorySummaryCsv
} = require("../services/csvExportService.js");

function buildDataset() {
  return buildNormalizedExportDataset({
    transactions: [
      { id: "income1", type: "income", amount: 1200, category_id: "sales", account_id: "bank", date: "2026-04-01", description: "Client invoice", payer_name: "Acme Client", tax_form_type: "1099-NEC" },
      { id: "fuel1", type: "expense", amount: 45, category_id: "fuel", account_id: "bank", date: new Date("2026-04-02T12:00:00Z"), description: "Shell fuel" },
      { id: "imported1", type: "expense", amount: 18, category_id: "imported_expense", account_id: "bank", date: "2026-04-03", description: "Imported row", review_notes: "Needs vendor classification" },
      { id: "insurance1", type: "expense", amount: 90, category_id: "insurance", account_id: "bank", date: "2026-04-04", description: "Business insurance" },
      { id: "transfer1", type: "expense", amount: 300, category_id: "imported_expense", account_id: "bank", date: "2026-04-05", description: "TRANSFER TO SAV XXXXX7188" }
    ],
    accounts: [{ id: "bank", name: "Checking", type: "bank" }],
    categories: [
      { id: "sales", name: "Sales Revenue", kind: "income", tax_map_us: "Line 1 - Gross receipts or sales", tax_map_ca: "Line 8000 - Gross business income" },
      { id: "fuel", name: "Fuel & Gas", kind: "expense", tax_map_us: "", tax_map_ca: "" },
      { id: "insurance", name: "Insurance", kind: "expense", tax_map_us: "insurance_other_than_health", tax_map_ca: "insurance" },
      { id: "imported_expense", name: "Imported Expense", kind: "expense", tax_map_us: "", tax_map_ca: "" }
    ],
    receipts: [{ id: "r1", transaction_id: "fuel1", filename: "fuel receipt.pdf" }],
    mileage: [],
    vehicleCosts: [],
    business: { id: "biz1", name: "Jose Consulting", region: "US", province: "" },
    region: "US",
    currency: "USD",
    startDate: "2026-04-01",
    endDate: "2026-04-30"
  });
}

test("escapeCsv escapes commas", () => {
  assert.equal(escapeCsv("A,B"), "\"A,B\"");
});

test("escapeCsv escapes quotes", () => {
  assert.equal(escapeCsv("A\"B"), "\"A\"\"B\"");
});

test("escapeCsv escapes newlines", () => {
  assert.equal(escapeCsv("A\nB"), "\"A\nB\"");
});

test("basic CSV begins with UTF-8 BOM and includes account/category/receipt/notes columns", () => {
  const csv = buildBasicLedgerCsv(buildDataset()).toString("utf8");
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.match(csv, /Date,Description,Type,Amount,Currency,Account,Category,Receipt Attached,Notes/);
  assert.match(csv, /Checking/);
  assert.match(csv, /Fuel & Gas/);
  assert.match(csv, /Yes/);
  assert.match(csv, /Needs vendor classification/);
});

test("full CPA CSV includes authoritative workpaper columns and no Tax ID", () => {
  const csv = buildFullCpaCsv(buildDataset()).toString("utf8");
  assert.match(csv, /Gross Amount/);
  assert.match(csv, /2026-04-02/);
  assert.match(csv, /Transaction Nature/);
  assert.match(csv, /Included In P&L/);
  assert.match(csv, /Exclusion Code/);
  assert.match(csv, /Tax Line Label/);
  assert.match(csv, /Review Flags/);
  assert.match(csv, /Internal Transaction ID/);
  assert.match(csv, /Line 15 - Insurance \(other than health\)/);
  assert.doesNotMatch(csv, /Fri Apr/);
  assert.doesNotMatch(csv, /insurance_other_than_health/);
  assert.doesNotMatch(csv, /Tax ID/i);
});

test("excluded items CSV contains excluded reason codes from dataset parity logic", () => {
  const csv = buildExcludedItemsCsv(buildDataset()).toString("utf8");
  assert.match(csv, /Exclusion Code/);
  assert.match(csv, /TRANSFER/);
  assert.doesNotMatch(csv, /Line 1 - Gross receipts or sales[\s\S]*TRANSFER TO SAV XXXXX7188/);
});

test("category summary CSV reflects mapping and receipt counts", () => {
  const csv = buildCategorySummaryCsv(buildDataset()).toString("utf8");
  assert.match(csv, /Category,Type,Tax Line,Tax Line Label,Mapping Status,Support Status,Transaction Count,Amount,Receipt Count,Missing Receipt Count,Review Flags/);
  assert.match(csv, /Fuel & Gas/);
  assert.match(csv, /Needs category/);
});
