"use strict";

const { getPayerSummaryForYear, getTaxLineSummaryForYear } = require("./taxSummaryService.js");
const { getQuarterlyReminders } = require("./quarterlyTaxReminderService.js");
const { buildFiscalYearBounds } = require("../utils/fiscalYear.js");

// Rough self-employment effective rate. US covers SE tax (15.3%) + a
// conservative income tax band. CA is a federal+provincial ballpark.
// This is an *estimate* surfaced as a helper, not tax advice — the response
// includes the rate that produced it so the UI can show the math.
// US: 28% covers SE tax (~15.3% on 92.35% of net) + federal income tax (~6-7%)
// + a ~7% buffer for state/local income taxes. At 24% the federal burden alone
// is ~21%, leaving only 3% — insufficient for any state with income tax.
// See: IRS Schedule C actual breakdown; state tax ranges 0-13%.
const DEFAULT_TAX_RATE = {
  US: 0.28,
  CA: 0.28
};

// Canadian set-aside rates represent a conservative combined estimate of:
//   federal income tax (14% bracket for 2026, BPA $16,452)
//   + provincial/territorial income tax
//   + CPP self-employed contributions (11.9% on net earnings $3,500–$74,600)
// Calibrated at ~$60K net self-employment income. Rates vary significantly
// by income level — this is a planning estimate, not a tax calculation.
// Source: 2026 federal brackets (CRA), provincial rate cards (TaxTips.ca),
//         CPP rates (canada.ca, Jan 2026 announcement).
const CANADA_SET_ASIDE_RATES = {
  AB: 0.29, // Federal ~10% + Alberta 10% + CPP ~11% (minus credits) ≈ 29%
  BC: 0.26, // Federal ~10% + BC 5-8% + CPP ~11% ≈ 26%
  MB: 0.31, // Federal ~10% + Manitoba 10.8% + CPP ~11% ≈ 31%
  NB: 0.30, // Federal ~10% + NB 9.4% + CPP ~11% ≈ 30%
  NL: 0.29, // Federal ~10% + NL 8.7% + CPP ~11% ≈ 29%
  NS: 0.33, // Federal ~10% + NS 8.79-14.95% + CPP ~11% ≈ 33% (NS HST dropped to 14% Apr 2025)
  NT: 0.26, // Federal ~10% + NT 5.9% + CPP ~11% ≈ 26%
  NU: 0.26, // Federal ~10% + NU 4% + CPP ~11% ≈ 26%
  ON: 0.27, // Federal ~10% + Ontario 5.05-9.15% + CPP ~11% ≈ 27%
  PE: 0.31, // Federal ~10% + PEI 9.65% + CPP ~11% ≈ 31%
  QC: 0.34, // Federal ~8% (after 16.5% abatement) + QC 14-19% + QPP ~12% ≈ 34%
  SK: 0.31, // Federal ~10% + SK 10.5% + CPP ~11% ≈ 31%
  YT: 0.28  // Federal ~10% + YT 6.4% + CPP ~11% ≈ 28%
};

function clamp2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function yearBounds(year, fiscalYearStart = "01-01") {
  return buildFiscalYearBounds(year, fiscalYearStart);
}

async function getYearTotals(pool, businessId, year, fiscalYearStart = "01-01") {
  const { start, end } = yearBounds(year, fiscalYearStart);
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

async function getReceiptCoverage(pool, businessId, year, fiscalYearStart = "01-01") {
  const { start, end } = yearBounds(year, fiscalYearStart);
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

async function getMileageTotals(pool, businessId, year, fiscalYearStart = "01-01") {
  const { start, end } = yearBounds(year, fiscalYearStart);
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

function resolveEffectiveRate(region, province, taxRateOverride) {
  if (Number.isFinite(taxRateOverride) && taxRateOverride > 0 && taxRateOverride < 1) {
    return Number(taxRateOverride);
  }
  if (region === "CA") {
    return CANADA_SET_ASIDE_RATES[String(province || "").toUpperCase()] || DEFAULT_TAX_RATE.CA;
  }
  return DEFAULT_TAX_RATE.US;
}

function calculateEstimatedSetAside({ profit, rate }) {
  // Both US and CA income tax is assessed on net business income (profit),
  // not gross revenue. US: Schedule C net profit. CA: T2125 net income → T1.
  return clamp2(Math.max(0, profit) * rate);
}

// GST/HST registration is mandatory once taxable supplies exceed $30,000
// in any rolling 12-month period (CRA small-supplier threshold).
const GST_HST_REGISTRATION_THRESHOLD = 30000;

function quarterKeyFromDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function buildQuarterKeys(year) {
  const keys = [];
  for (let y = year - 1; y <= year; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      keys.push(`${y}-Q${q}`);
    }
  }
  return keys;
}

function buildGstHstAlert(quarterlyRevenue, threshold = GST_HST_REGISTRATION_THRESHOLD) {
  const keys = Array.isArray(quarterlyRevenue)
    ? quarterlyRevenue.map((entry) => String(entry.quarter || ""))
    : [];
  const valuesByQuarter = new Map(
    Array.isArray(quarterlyRevenue)
      ? quarterlyRevenue.map((entry) => [String(entry.quarter || ""), clamp2(entry.revenue || 0)])
      : []
  );

  let maxSingleQuarter = 0;
  let maxRollingFour = 0;
  let reachedQuarter = null;
  const ordered = keys.length ? keys : [];

  for (let i = 0; i < ordered.length; i += 1) {
    const quarter = ordered[i];
    const single = valuesByQuarter.get(quarter) || 0;
    if (single > maxSingleQuarter) maxSingleQuarter = single;
    if (!reachedQuarter && single > threshold) reachedQuarter = quarter;
    if (i >= 3) {
      const rolling = ordered.slice(i - 3, i + 1).reduce((sum, key) => sum + (valuesByQuarter.get(key) || 0), 0);
      if (rolling > maxRollingFour) maxRollingFour = rolling;
      if (!reachedQuarter && rolling > threshold) reachedQuarter = quarter;
    }
  }

  const approachingThreshold = threshold * 0.8;
  const approaching = maxSingleQuarter >= approachingThreshold || maxRollingFour >= approachingThreshold;
  const reached = maxSingleQuarter > threshold || maxRollingFour > threshold;
  return {
    threshold,
    max_single_quarter_revenue: clamp2(maxSingleQuarter),
    max_rolling_four_quarters_revenue: clamp2(maxRollingFour),
    quarterly_revenue: Array.isArray(quarterlyRevenue) ? quarterlyRevenue : [],
    threshold_reached: reached,
    approaching: approaching,
    reached_quarter: reachedQuarter,
    note: reached
      ? "Taxable supplies exceeded the CRA small-supplier threshold in a calendar-quarter test. Review GST/HST registration timing."
      : approaching
        ? "Taxable supplies are approaching the CRA small-supplier threshold. Review current and rolling four-quarter totals."
        : null
  };
}

async function getGstHstQuarterlyRevenue(pool, businessId, year) {
  const start = `${year - 1}-01-01`;
  const end = `${year}-12-31`;
  const result = await pool.query(
    `SELECT DATE_TRUNC('quarter', date)::date AS quarter_start,
            COALESCE(SUM(amount), 0)::numeric AS total_amount
       FROM transactions
      WHERE business_id = $1
        AND type = 'income'
        AND date BETWEEN $2::date AND $3::date
        AND deleted_at IS NULL
        AND (is_void = false OR is_void IS NULL)
        AND (is_adjustment = false OR is_adjustment IS NULL)
      GROUP BY 1
      ORDER BY 1 ASC`,
    [businessId, start, end]
  );

  const totalsByQuarter = new Map(
    result.rows
      .map((row) => [quarterKeyFromDate(row.quarter_start), clamp2(row.total_amount || 0)])
      .filter(([key]) => Boolean(key))
  );

  return buildQuarterKeys(year).map((quarter) => ({
    quarter,
    revenue: totalsByQuarter.get(quarter) || 0
  }));
}

/**
 * Compose the year-end tax dashboard. Runs the underlying queries in
 * parallel so the round-trip stays snappy.
 */
async function getTaxDashboard(pool, { businessId, year, region, province = "", fiscalYearStart = "01-01", taxRateOverride = null }) {
  const safeYear = parseInt(year, 10) || new Date().getUTCFullYear();
  const safeRegion = region === "CA" ? "CA" : "US";
  const safeProvince = String(province || "").toUpperCase();
  const effectiveRate = resolveEffectiveRate(safeRegion, safeProvince, taxRateOverride);

  const [totals, receiptCoverage, mileage, payerSummary, taxLineSummary] = await Promise.all([
    getYearTotals(pool, businessId, safeYear, fiscalYearStart),
    getReceiptCoverage(pool, businessId, safeYear, fiscalYearStart),
    getMileageTotals(pool, businessId, safeYear, fiscalYearStart),
    getPayerSummaryForYear(pool, { businessId, year: safeYear, region: safeRegion, fiscalYearStart }),
    getTaxLineSummaryForYear(pool, { businessId, year: safeYear, region: safeRegion, fiscalYearStart })
  ]);
  const gstHstQuarterlyRevenue = safeRegion === "CA"
    ? await getGstHstQuarterlyRevenue(pool, businessId, safeYear)
    : null;

  const quarterly = getQuarterlyReminders(safeRegion);

  const estimatedTaxOwed = calculateEstimatedSetAside({
    profit: totals.profit,
    rate: effectiveRate
  });

  return {
    year: safeYear,
    region: safeRegion,
    fiscal_year_start: fiscalYearStart,
    income: totals.income,
    expense: totals.expense,
    profit: totals.profit,
    income_count: totals.income_count,
    expense_count: totals.expense_count,
    estimated_tax: {
      owed: estimatedTaxOwed,
      rate: effectiveRate,
      note: safeRegion === "CA"
        ? "Draft estimate for review. Rate reflects combined federal income tax + provincial income tax + CPP (self-employed). Actual liability depends on total income, deductions, credits, and professional review."
        : "Draft estimate for review. Actual remittance depends on bookkeeping, filing details, and professional review."
    },
    gst_hst_alert: safeRegion === "CA" ? buildGstHstAlert(gstHstQuarterlyRevenue) : null,
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
  GST_HST_REGISTRATION_THRESHOLD,
  __private: {
    getYearTotals,
    getReceiptCoverage,
    getMileageTotals,
    yearBounds,
    clamp2,
    resolveEffectiveRate,
    calculateEstimatedSetAside,
    buildGstHstAlert,
    getGstHstQuarterlyRevenue,
    quarterKeyFromDate,
    buildQuarterKeys
  }
};
