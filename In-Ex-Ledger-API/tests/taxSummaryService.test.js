"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getPayerSummaryForYear,
  getTaxLineSummaryForYear,
  getUnmappedCategories,
  expectedFormForPayer,
  __private: { yearBounds }
} = require("../services/taxSummaryService.js");

function makePool(rowSets) {
  let i = 0;
  return {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      const rows = Array.isArray(rowSets) ? (rowSets[i++] || []) : rowSets;
      return { rows, rowCount: rows.length };
    }
  };
}

test("yearBounds returns the YYYY-01-01 / YYYY-12-31 range", () => {
  assert.deepEqual(yearBounds(2026), { start: "2026-01-01", end: "2026-12-31" });
});

test("expectedFormForPayer returns 1099-NEC at $600 in US", () => {
  assert.equal(expectedFormForPayer({ region: "US", total: 600, transactionCount: 1 }), "1099-NEC");
  assert.equal(expectedFormForPayer({ region: "US", total: 599.99, transactionCount: 1 }), null);
});

test("expectedFormForPayer returns 1099-K at $20k + 200 transactions in US", () => {
  assert.equal(expectedFormForPayer({ region: "US", total: 20000, transactionCount: 200 }), "1099-K");
  assert.equal(expectedFormForPayer({ region: "US", total: 25000, transactionCount: 50 }), "1099-NEC");
});

test("expectedFormForPayer returns T4A at $500 in CA, null otherwise", () => {
  assert.equal(expectedFormForPayer({ region: "CA", total: 500, transactionCount: 1 }), "T4A");
  assert.equal(expectedFormForPayer({ region: "CA", total: 499, transactionCount: 1 }), null);
});

test("getPayerSummaryForYear groups by payer and computes expected_form", async () => {
  const pool = makePool([[
    { payer_name: "Stripe", tax_form_type: "1099-K", transaction_count: 220, total_amount: "25000.50", first_date: "2026-02-01", last_date: "2026-12-15" },
    { payer_name: "Stripe", tax_form_type: "none", transaction_count: 5, total_amount: "100.00", first_date: "2026-01-10", last_date: "2026-01-30" },
    { payer_name: "Fiverr", tax_form_type: "1099-NEC", transaction_count: 4, total_amount: "850.00", first_date: "2026-04-01", last_date: "2026-11-30" },
    { payer_name: "(unspecified)", tax_form_type: null, transaction_count: 2, total_amount: "50.00", first_date: "2026-03-01", last_date: "2026-03-05" }
  ]]);

  const summary = await getPayerSummaryForYear(pool, { businessId: "biz", year: 2026, region: "US" });

  assert.equal(summary.year, 2026);
  assert.equal(summary.region, "US");
  assert.equal(summary.payer_count, 3);
  assert.equal(summary.total_income, 26000.50);
  assert.equal(summary.payers[0].payer_name, "Stripe");
  assert.equal(summary.payers[0].total_amount, 25100.50);
  assert.equal(summary.payers[0].expected_form, "1099-K");
  assert.equal(summary.payers[0].declared_form, "1099-K");
  const fiverr = summary.payers.find((p) => p.payer_name === "Fiverr");
  assert.equal(fiverr.expected_form, "1099-NEC");
  assert.equal(fiverr.declared_form, "1099-NEC");
});

test("getPayerSummaryForYear flags missing form for big payer with declared_form null", async () => {
  const pool = makePool([[
    { payer_name: "Anonymous Client", tax_form_type: null, transaction_count: 10, total_amount: "5000.00", first_date: "2026-01-01", last_date: "2026-12-01" }
  ]]);
  const summary = await getPayerSummaryForYear(pool, { businessId: "biz", year: 2026, region: "US" });
  assert.equal(summary.payers_expecting_form, 1);
  assert.equal(summary.payers[0].declared_form, null);
  assert.equal(summary.payers[0].expected_form, "1099-NEC");
});

test("getTaxLineSummaryForYear groups categories by tax_map line and surfaces unmapped", async () => {
  const pool = makePool([[
    { category_id: "c1", category_name: "Software", category_kind: "expense", tax_line: "Schedule C Line 18", transaction_count: 12, total_amount: "1200.00", receipt_count: 6 },
    { category_id: "c2", category_name: "Internet", category_kind: "expense", tax_line: "Schedule C Line 25", transaction_count: 6, total_amount: "300.00", receipt_count: 3 },
    { category_id: "c3", category_name: "Marketing", category_kind: "expense", tax_line: null, transaction_count: 4, total_amount: "500.00", receipt_count: 1 }
  ]]);
  const summary = await getTaxLineSummaryForYear(pool, { businessId: "biz", year: 2026, region: "US" });

  assert.equal(summary.mapped_lines.length, 2);
  assert.equal(summary.mapped_lines[0].tax_line, "Schedule C Line 18");
  assert.equal(summary.mapped_lines[0].total_amount, 1200);
  assert.equal(summary.unmapped.transaction_count, 4);
  assert.equal(summary.unmapped.total_amount, 500);
  assert.equal(summary.unmapped.categories[0].category_name, "Marketing");
});

test("getTaxLineSummaryForYear picks tax_map_ca when region is CA", async () => {
  const pool = makePool([[]]);
  await getTaxLineSummaryForYear(pool, { businessId: "biz", year: 2026, region: "CA" });
  assert.ok(pool.queries[0].sql.includes("c.tax_map_ca"), "should query tax_map_ca for CA region");
});

test("getUnmappedCategories filters by region-specific column", async () => {
  const pool = makePool([[{ id: "c1", name: "Office", kind: "expense", color: null }]]);
  const rows = await getUnmappedCategories(pool, { businessId: "biz", region: "US" });
  assert.equal(rows.length, 1);
  assert.ok(pool.queries[0].sql.includes("tax_map_us"));
});
