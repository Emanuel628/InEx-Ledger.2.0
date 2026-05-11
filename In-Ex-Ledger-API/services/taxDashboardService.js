"use strict";

const { getPayerSummaryForYear, getTaxLineSummaryForYear } = require("./taxSummaryService.js");
const { getQuarterlyReminders } = require("./quarterlyTaxReminderService.js");

// Rough self-employment effective rate. US covers SE tax (15.3%) + a
// conservative income tax band. CA is a federal+provincial ballpark.
// This is an *estimate* surfaced as a helper, not tax advice — the response
// includes the rate that produced it so the UI can show the math.
const DEFAULT_TAX_RATE = {
  US: 0.25,
  CA: 0.20
};

function clamp2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

async function getYearTotals(pool, businessId, year) {
  const { start, end } = yearBounds(year);
  const totalsRes = await pool.query(
    `SELECT type,
            COALESCE(SUM(amount), 0)::numeric AS total,
            COUNT(*)::int AS tx_count
       FROM transactions
      WHERE business_id = $1
        AND date BETWEEN $2::date AND $3::date
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
        AND (is_adjustment = false OR is_adjustment IS NULL)
      GROUP BY type`,
    [businessId, start, end]
  );

  let income = 0;
  let incomeCount = 0;
  let expense = 0;
  let expenseCount = 0;
  for (const row of totalsRes.rows) {
    const total = Number(row.total || 0);
    const count = Number(row.tx_count || 0);
    if (row.type === "income") {
      income = total;
      incomeCount = count;
    } else if (row.type === "expense") {
      expense = total;
      expenseCount = count;
    }
  }
  return {
    income: clamp2(income),
    expense: clamp2(expense),
    profit: clamp2(income - expense),
    income_count: incomeCount,
    expense_count: expenseCount
  };
}

async function getReceiptCoverage(pool, businessId, year) {
  const { start, end } = yearBounds(year);
  const result = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE t.type = 'expense')::int AS expense_count,
        COUNT(*) FILTER (
          WHERE t.type = 'expense' AND EXISTS (
            SELECT 1 FROM receipts r WHERE r.transaction_id = t.id
          )
        )::int AS with_receipt_count
       FROM transactions t
      WHERE t.business_id = $1
        AND t.date BETWEEN $2::date AND $3::date
        AND t.deleted_at IS NULL
        AND (t.is_void = false OR t.is_void IS NULL)
        AND (t.is_adjustment = false OR t.is_adjustment IS NULL)`,
    [businessId, start, end]
  );
  const row = result.rows[0] || { expense_count: 0, with_receipt_count: 0 };
  const expenseCount = Number(row.expense_count || 0);
  const withReceipt = Number(row.with_receipt_count || 0);
  return {
    expense_count: expenseCount,
    with_receipt: withReceipt,
    missing_receipts: Math.max(0, expenseCount - withReceipt),
    coverage_pct: expenseCount === 0 ? null : Number(((withReceipt / expenseCount) * 100).toFixed(1))
  };
}

async function getMileageTotals(pool, businessId, year) {
  const { start, end } = yearBounds(year);
  const result = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(miles, 0)), 0)::numeric AS total_miles,
            COALESCE(SUM(COALESCE(km, 0)), 0)::numeric    AS total_km,
            COUNT(*)::int AS trip_count
       FROM mileage
      WHERE business_id = $1
        AND trip_date BETWEEN $2::date AND $3::date`,
    [businessId, start, end]
  ).catch(() => ({ rows: [] }));
  const row = result.rows[0] || {};
  return {
    total_miles: clamp2(row.total_miles || 0),
    total_km: clamp2(row.total_km || 0),
    trip_count: Number(row.trip_count || 0)
  };
}

/**
 * Compose the year-end tax dashboard. Runs the underlying queries in
 * parallel so the round-trip stays snappy.
 */
async function getTaxDashboard(pool, { businessId, year, region, taxRateOverride = null }) {
  const safeYear = parseInt(year, 10) || new Date().getUTCFullYear();
  const safeRegion = region === "CA" ? "CA" : "US";
  const effectiveRate = Number.isFinite(taxRateOverride) && taxRateOverride > 0 && taxRateOverride < 1
    ? Number(taxRateOverride)
    : DEFAULT_TAX_RATE[safeRegion];

  const [totals, receiptCoverage, mileage, payerSummary, taxLineSummary] = await Promise.all([
    getYearTotals(pool, businessId, safeYear),
    getReceiptCoverage(pool, businessId, safeYear),
    getMileageTotals(pool, businessId, safeYear),
    getPayerSummaryForYear(pool, { businessId, year: safeYear, region: safeRegion }),
    getTaxLineSummaryForYear(pool, { businessId, year: safeYear, region: safeRegion })
  ]);

  const quarterly = getQuarterlyReminders(safeRegion);

  const estimatedTaxOwed = clamp2(Math.max(0, totals.profit) * effectiveRate);

  return {
    year: safeYear,
    region: safeRegion,
    income: totals.income,
    expense: totals.expense,
    profit: totals.profit,
    income_count: totals.income_count,
    expense_count: totals.expense_count,
    estimated_tax: {
      owed: estimatedTaxOwed,
      rate: effectiveRate,
      note: "Rough estimate. Actual liability depends on deductions, filing status, and bracket."
    },
    receipts: receiptCoverage,
    mileage,
    payers: {
      total_income: payerSummary.total_income,
      payer_count: payerSummary.payer_count,
      payers_expecting_form: payerSummary.payers_expecting_form,
      top: payerSummary.payers.slice(0, 5)
    },
    tax_lines: {
      mapped_count: taxLineSummary.mapped_lines.length,
      unmapped_total: taxLineSummary.unmapped.total_amount,
      unmapped_transaction_count: taxLineSummary.unmapped.transaction_count,
      top: taxLineSummary.mapped_lines.slice(0, 5)
    },
    quarterly: {
      next_deadline: quarterly.next_deadline,
      banner_level: quarterly.banner_level,
      upcoming: quarterly.upcoming
    }
  };
}

module.exports = {
  getTaxDashboard,
  DEFAULT_TAX_RATE,
  __private: { getYearTotals, getReceiptCoverage, getMileageTotals, yearBounds, clamp2 }
};
