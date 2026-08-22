"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildCashFlowPayload,
  buildDashboardPayload,
  buildSeasonalPayload,
  buildWhatIfPayload,
  estimateSelfEmploymentTax,
  parseWhatIfPayload
} = require("../services/analyticsService.js");
const { ApiError } = require("../utils/apiError.js");

test("analytics route delegates tax, seasonal, recurring, and what-if math to the service", () => {
  const routeSource = fs.readFileSync(path.join(__dirname, "..", "routes", "analytics.routes.js"), "utf8");
  const serviceSource = fs.readFileSync(path.join(__dirname, "..", "services", "analyticsService.js"), "utf8");

  assert.match(routeSource, /buildDashboardPayload/);
  assert.match(routeSource, /buildCashFlowPayload/);
  assert.match(routeSource, /buildSeasonalPayload/);
  assert.match(routeSource, /buildWhatIfPayload/);
  assert.match(routeSource, /parseWhatIfPayload/);

  for (const forbidden of [
    "CPP_RATE",
    "SS_WAGE_BASE",
    "validateOptionalNumber",
    "buildTrailingMonthMap",
    "monthlyEquivalentForRecurring",
    "deviation_pct"
  ]) {
    assert.equal(
      routeSource.includes(forbidden),
      false,
      `analytics.routes.js must not re-own service computation: ${forbidden}`
    );
    assert.equal(
      serviceSource.includes(forbidden),
      true,
      `analyticsService.js should own service computation: ${forbidden}`
    );
  }
});

test("estimateSelfEmploymentTax calculates Canadian CPP and CPP2 estimate", () => {
  assert.equal(Number(estimateSelfEmploymentTax(90000, "CA").toFixed(2)), 9292.9);
});

test("dashboard payload keeps tax estimates gated and builds latest active month fallback", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const payload = buildDashboardPayload({
    monthlyRows: [
      { month: "2026-06-01", type: "income", total: "12000" },
      { month: "2026-06-01", type: "expense", total: "3000" }
    ],
    topIncomeRows: [{ category_name: null, total: "12000" }],
    topExpenseRows: [{ category_name: "Supplies", total: "3000" }],
    currentMonthRows: [],
    priorMonthRows: [],
    hasTaxEstimates: true,
    region: "US",
    since: "2025-09-01",
    now
  });

  assert.equal(payload.summary.total_income, 12000);
  assert.equal(payload.summary.net, 9000);
  assert.equal(payload.summary.estimated_tax_liability_pct, 18.8);
  assert.equal(payload.summary.se_tax_estimate, 1271.66);
  assert.equal(payload.current_month.title, "Latest Active Month");
  assert.equal(payload.current_month.label, "2026-06");
  assert.deepEqual(payload.top_income_sources, [{ category: "Uncategorized", total: 12000 }]);
  assert.deepEqual(payload.top_expense_categories, [{ category: "Supplies", total: 3000 }]);
});

test("cash-flow payload uses historical average baseline and reports recurring commitments separately", () => {
  const payload = buildCashFlowPayload({
    historicalRows: [
      { month: "2026-08-01", type: "income", total: "6000" },
      { month: "2026-08-01", type: "expense", total: "1200" }
    ],
    recurringRows: [
      { amount: "300", type: "expense", cadence: "weekly" },
      { amount: "1200", type: "income", cadence: "monthly" }
    ],
    now: new Date("2026-08-22T12:00:00.000Z")
  });

  assert.equal(payload.history_months, 6);
  assert.equal(payload.avg_monthly_income, 1000);
  assert.equal(payload.avg_monthly_expense, 200);
  assert.equal(payload.recurring_monthly_income, 1200);
  assert.equal(payload.recurring_monthly_expense, 1300);
  assert.equal(payload.projections.length, 3);
  assert.equal(payload.projections[0].month, "2026-09");
  assert.match(payload.projections[0].risk_notification, /active recurring expenses/);
});

test("seasonal payload preserves empty shape and adds deviation insights", () => {
  assert.deepEqual(buildSeasonalPayload([]), { months: [], overall_avg: 0, insights: [] });

  const payload = buildSeasonalPayload([
    { month_num: 1, month_name: "January  ", avg_income: "100", total_income: "300", transaction_count: "3" },
    { month_num: 2, month_name: "February ", avg_income: "200", total_income: "400", transaction_count: "2" }
  ]);

  assert.equal(payload.overall_avg, 150);
  assert.equal(payload.months[0].deviation_pct, -33.3);
  assert.match(payload.months[0].insight, /lower than average/);
  assert.match(payload.months[1].insight, /higher than average/);
  assert.equal(payload.insights.length, 2);
});

test("what-if parser rejects invalid numbers and calculator uses the parsed scenario", () => {
  assert.throws(
    () => parseWhatIfPayload({ income_change_pct: "bad" }),
    (err) => err instanceof ApiError && err.status === 400 && err.message === "income_change_pct must be a finite number."
  );

  const scenario = parseWhatIfPayload({
    income_change_pct: 10,
    expense_change_pct: -25,
    weeks_off: 1,
    custom_income: 4000,
    custom_expense: 2000
  });
  const payload = buildWhatIfPayload({
    historyRow: { income_total: "0", expense_total: "0" },
    scenario
  });

  assert.deepEqual(payload.baseline, {
    monthly_income: 4000,
    monthly_expense: 2000,
    monthly_net: 2000
  });
  assert.equal(payload.scenario.weeks_off, 1);
  assert.equal(payload.scenario.projected_expense, 1500);
  assert.match(payload.messages.join(" "), /Taking 1 week/);
});
