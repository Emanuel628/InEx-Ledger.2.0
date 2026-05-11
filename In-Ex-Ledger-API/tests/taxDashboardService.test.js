"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getTaxDashboard,
  DEFAULT_TAX_RATE,
  __private: { yearBounds, clamp2 }
} = require("../services/taxDashboardService.js");

function makePool(plans) {
  // plans: array of { match: (sql) => boolean, rows: [...] } evaluated in order
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const match = plans.find((p) => p.match(sql) && !p.used);
      if (match) {
        match.used = true;
        return { rows: match.rows, rowCount: match.rows.length };
      }
      return { rows: [], rowCount: 0 };
    }
  };
}

test("yearBounds returns YYYY-01-01..YYYY-12-31", () => {
  assert.deepEqual(yearBounds(2026), { start: "2026-01-01", end: "2026-12-31" });
});

test("clamp2 rounds to 2 decimals", () => {
  assert.equal(clamp2(1.234), 1.23);
  assert.equal(clamp2(1.001), 1);
  assert.equal(clamp2(null), 0);
  assert.equal(clamp2("12.5"), 12.5);
});

test("getTaxDashboard composes income/expense/profit/estimated_tax/receipts/mileage/payers/tax_lines/quarterly", async () => {
  const pool = makePool([
    // year totals
    { match: (s) => /FROM transactions[\s\S]*GROUP BY type/.test(s), rows: [
      { type: "income", total: "10000.00", tx_count: 12 },
      { type: "expense", total: "4000.00", tx_count: 25 }
    ] },
    // receipt coverage
    { match: (s) => /with_receipt_count/.test(s), rows: [
      { expense_count: 25, with_receipt_count: 20 }
    ] },
    // mileage totals
    { match: (s) => /FROM mileage\s+WHERE business_id/.test(s), rows: [
      { total_miles: "1234.50", total_km: "0", trip_count: 12 }
    ] },
    // payer summary (single grouped query)
    { match: (s) => /COALESCE\(NULLIF\(TRIM\(payer_name\)/.test(s), rows: [
      { payer_name: "Stripe", tax_form_type: "1099-NEC", transaction_count: 8, total_amount: "8500.00", first_date: "2026-01-15", last_date: "2026-12-01" },
      { payer_name: "Fiverr", tax_form_type: "1099-NEC", transaction_count: 4, total_amount: "1500.00", first_date: "2026-03-01", last_date: "2026-11-30" }
    ] },
    // tax-line summary (categories left join transactions)
    { match: (s) => /FROM categories c/.test(s), rows: [
      { category_id: "c1", category_name: "Software", category_kind: "expense", tax_line: "Schedule C Line 18", transaction_count: 10, total_amount: "1500.00", receipt_count: 8 }
    ] }
  ]);

  const dashboard = await getTaxDashboard(pool, {
    businessId: "biz",
    year: 2026,
    region: "US"
  });

  assert.equal(dashboard.year, 2026);
  assert.equal(dashboard.region, "US");
  assert.equal(dashboard.income, 10000);
  assert.equal(dashboard.expense, 4000);
  assert.equal(dashboard.profit, 6000);
  assert.equal(dashboard.income_count, 12);
  assert.equal(dashboard.expense_count, 25);
  assert.equal(dashboard.estimated_tax.rate, DEFAULT_TAX_RATE.US);
  assert.equal(dashboard.estimated_tax.owed, 1500); // 6000 * 0.25
  assert.equal(dashboard.receipts.missing_receipts, 5);
  assert.equal(dashboard.receipts.coverage_pct, 80);
  assert.equal(dashboard.mileage.total_miles, 1234.5);
  assert.equal(dashboard.payers.payer_count, 2);
  assert.equal(dashboard.payers.top[0].payer_name, "Stripe");
  assert.equal(dashboard.tax_lines.mapped_count, 1);
  assert.equal(dashboard.tax_lines.top[0].tax_line, "Schedule C Line 18");
  assert.ok(dashboard.quarterly.next_deadline);
});

test("getTaxDashboard clamps negative profit to zero for estimated tax", async () => {
  const pool = makePool([
    { match: (s) => /GROUP BY type/.test(s), rows: [
      { type: "income", total: "1000", tx_count: 2 },
      { type: "expense", total: "5000", tx_count: 10 }
    ] }
  ]);
  const dashboard = await getTaxDashboard(pool, { businessId: "biz", year: 2026, region: "US" });
  assert.equal(dashboard.profit, -4000);
  assert.equal(dashboard.estimated_tax.owed, 0);
});

test("getTaxDashboard honors tax_rate override and CA region", async () => {
  const pool = makePool([
    { match: (s) => /GROUP BY type/.test(s), rows: [
      { type: "income", total: "10000", tx_count: 5 },
      { type: "expense", total: "2000", tx_count: 5 }
    ] }
  ]);
  const dashboard = await getTaxDashboard(pool, {
    businessId: "biz",
    year: 2026,
    region: "CA",
    taxRateOverride: 0.30
  });
  assert.equal(dashboard.region, "CA");
  assert.equal(dashboard.estimated_tax.rate, 0.30);
  assert.equal(dashboard.estimated_tax.owed, 2400); // 8000 * 0.30
});

test("getTaxDashboard returns receipts.coverage_pct null when no expenses", async () => {
  const pool = makePool([
    { match: (s) => /GROUP BY type/.test(s), rows: [] },
    { match: (s) => /with_receipt_count/.test(s), rows: [{ expense_count: 0, with_receipt_count: 0 }] }
  ]);
  const dashboard = await getTaxDashboard(pool, { businessId: "biz", year: 2026, region: "US" });
  assert.equal(dashboard.receipts.coverage_pct, null);
});
