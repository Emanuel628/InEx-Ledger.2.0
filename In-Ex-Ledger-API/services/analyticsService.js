"use strict";

const { ApiError } = require("../utils/apiError.js");

const WEEKS_PER_MONTH = 52 / 12;
const BIWEEKS_PER_MONTH = 26 / 12;
const MAX_ANALYTICS_AMOUNT = 999999999.99;
const ANALYTICS_AMOUNT_EXPR = "COALESCE(NULLIF(converted_amount, 0), amount)";
const ANALYTICS_AMOUNT_EXPR_T = "COALESCE(NULLIF(t.converted_amount, 0), t.amount)";

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function pastMonths(n, now = new Date()) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

function monthKeyFromDbValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return monthKey(value.getUTCFullYear(), value.getUTCMonth() + 1);
  }

  const stringValue = String(value).trim();
  const match = stringValue.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  const parsed = new Date(stringValue);
  if (!Number.isNaN(parsed.getTime())) {
    return monthKey(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1);
  }

  return null;
}

function buildTrailingMonthMap(monthCount, now = new Date()) {
  return pastMonths(monthCount, now).reduce((acc, entry) => {
    const key = monthKey(entry.year, entry.month);
    acc.set(key, {
      month: key,
      income: 0,
      expense: 0,
      net: 0
    });
    return acc;
  }, new Map());
}

function firstDayOfMonthFromKey(key) {
  return `${key}-01`;
}

function monthStartOffset(n, now = new Date()) {
  const d = new Date(now);
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

function validateOptionalNumber(value, fieldName, { min = null, max = null } = {}) {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${fieldName} must be a finite number.` };
  }
  if (min !== null && parsed < min) {
    return { error: `${fieldName} must be at least ${min}.` };
  }
  if (max !== null && parsed > max) {
    return { error: `${fieldName} must be at most ${max}.` };
  }
  return { value: parsed };
}

function rowsToMonthSummary(rows) {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income = Number(r.total);
    else if (r.type === "expense") expense = Number(r.total);
  }
  return { income, expense, net: income - expense };
}

function pctChange(current, prior) {
  if (!prior && !current) return 0;
  if (!prior) return null;
  return Number(((current - prior) / prior * 100).toFixed(1));
}

function estimateSelfEmploymentTax(netIncome, region) {
  if (netIncome <= 0) {
    return 0;
  }

  if (region === "CA") {
    const CPP_RATE = 0.119;
    const CPP_EXEMPTION = 3500;
    const CPP_MAX_EARNINGS = 74600;
    const CPP2_RATE = 0.08;
    const CPP2_MIN_EARNINGS = 74600;
    const CPP2_MAX_EARNINGS = 85000;
    const cppBase = Math.min(Math.max(0, netIncome - CPP_EXEMPTION), CPP_MAX_EARNINGS - CPP_EXEMPTION);
    const cpp = cppBase * CPP_RATE;
    const cpp2Base = Math.min(Math.max(0, netIncome - CPP2_MIN_EARNINGS), CPP2_MAX_EARNINGS - CPP2_MIN_EARNINGS);
    const cpp2 = cpp2Base * CPP2_RATE;
    return cpp + cpp2;
  }

  const SS_WAGE_BASE = 184500;
  const seNet = netIncome * 0.9235;
  const ssBase = Math.min(seNet, SS_WAGE_BASE);
  const medicareOnly = Math.max(0, seNet - SS_WAGE_BASE);
  return (ssBase * 0.153) + (medicareOnly * 0.029);
}

function buildDashboardPayload({
  monthlyRows,
  topIncomeRows,
  topExpenseRows,
  currentMonthRows,
  priorMonthRows,
  hasTaxEstimates,
  region,
  since,
  now = new Date()
}) {
  const monthlyMap = buildTrailingMonthMap(12, now);
  for (const row of monthlyRows) {
    const key = monthKeyFromDbValue(row.month);
    const bucket = monthlyMap.get(key);
    if (!bucket) {
      continue;
    }
    bucket[row.type] += Number(row.total);
    bucket.net = bucket.income - bucket.expense;
  }

  const months = pastMonths(12, now).map((entry) => {
    const key = monthKey(entry.year, entry.month);
    return monthlyMap.get(key) || { month: key, income: 0, expense: 0, net: 0 };
  });

  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalExpense = months.reduce((s, m) => s + m.expense, 0);
  const avgMonthlyIncome = totalIncome / 12;
  const avgMonthlyExpense = totalExpense / 12;
  const netIncome = totalIncome - totalExpense;
  const estimatedTaxPct = totalIncome > 0
    ? Math.min(100, Math.max(0, (Math.max(netIncome, 0) * 0.25) / totalIncome * 100))
    : 0;
  const seTaxEstimate = estimateSelfEmploymentTax(netIncome, region);

  const currentMonth = rowsToMonthSummary(currentMonthRows);
  const priorMonth = rowsToMonthSummary(priorMonthRows);

  let currentMonthPayload = {
    title: "This Month",
    label: monthKey(now.getFullYear(), now.getMonth() + 1),
    income: Number(currentMonth.income.toFixed(2)),
    expense: Number(currentMonth.expense.toFixed(2)),
    net: Number(currentMonth.net.toFixed(2)),
    income_vs_prior_pct: pctChange(currentMonth.income, priorMonth.income),
    expense_vs_prior_pct: pctChange(currentMonth.expense, priorMonth.expense),
    net_vs_prior_pct: pctChange(currentMonth.net, priorMonth.net)
  };

  const hasCurrentMonthIncome = currentMonth.income > 0;
  if (!hasCurrentMonthIncome) {
    const latestIncomeMonthIndex = [...months]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.income > 0)?.index;

    if (latestIncomeMonthIndex !== undefined) {
      const fallbackMonth = months[latestIncomeMonthIndex];
      const fallbackPriorMonth = latestIncomeMonthIndex > 0
        ? months[latestIncomeMonthIndex - 1]
        : { income: 0, expense: 0, net: 0 };

      currentMonthPayload = {
        title: "Latest Active Month",
        label: fallbackMonth.month,
        income: Number(fallbackMonth.income.toFixed(2)),
        expense: Number(fallbackMonth.expense.toFixed(2)),
        net: Number(fallbackMonth.net.toFixed(2)),
        days_elapsed: new Date(firstDayOfMonthFromKey(fallbackMonth.month)).getUTCDate(),
        days_in_month: new Date(
          Number(fallbackMonth.month.slice(0, 4)),
          Number(fallbackMonth.month.slice(5, 7)),
          0
        ).getDate(),
        income_vs_prior_pct: pctChange(fallbackMonth.income, fallbackPriorMonth.income),
        expense_vs_prior_pct: pctChange(fallbackMonth.expense, fallbackPriorMonth.expense),
        net_vs_prior_pct: pctChange(fallbackMonth.net, fallbackPriorMonth.net)
      };
    }
  }

  if (currentMonthPayload.title === "This Month") {
    currentMonthPayload.days_elapsed = now.getDate();
    currentMonthPayload.days_in_month = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }

  return {
    period_months: 12,
    since,
    summary: {
      total_income: Number(totalIncome.toFixed(2)),
      total_expense: Number(totalExpense.toFixed(2)),
      net: Number(netIncome.toFixed(2)),
      avg_monthly_income: Number(avgMonthlyIncome.toFixed(2)),
      avg_monthly_expense: Number(avgMonthlyExpense.toFixed(2)),
      estimated_tax_liability_pct: hasTaxEstimates ? Number(estimatedTaxPct.toFixed(1)) : null,
      se_tax_estimate: hasTaxEstimates ? Number(seTaxEstimate.toFixed(2)) : null,
      has_tax_estimates: hasTaxEstimates,
      region
    },
    current_month: currentMonthPayload,
    monthly_breakdown: months,
    top_income_sources: topIncomeRows.map((r) => ({
      category: r.category_name || "Uncategorized",
      total: Number(r.total)
    })),
    top_expense_categories: topExpenseRows.map((r) => ({
      category: r.category_name || "Uncategorized",
      total: Number(r.total)
    }))
  };
}

function monthlyEquivalentForRecurring(row) {
  const amount = Number(row.amount);
  switch (row.cadence) {
    case "weekly":
      return amount * WEEKS_PER_MONTH;
    case "biweekly":
      return amount * BIWEEKS_PER_MONTH;
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
    case "annually":
      return amount / 12;
    default:
      return amount;
  }
}

function buildCashFlowPayload({ historicalRows, recurringRows, now = new Date() }) {
  const monthTotals = buildTrailingMonthMap(6, now);
  for (const row of historicalRows) {
    const key = monthKeyFromDbValue(row.month);
    const bucket = monthTotals.get(key);
    if (!bucket) {
      continue;
    }
    bucket[row.type] += Number(row.total);
    bucket.net = bucket.income - bucket.expense;
  }

  const histMonths = pastMonths(6, now).map((entry) => {
    const key = monthKey(entry.year, entry.month);
    return monthTotals.get(key) || { month: key, income: 0, expense: 0, net: 0 };
  });
  const histCount = 6;
  const avgHistIncome = histMonths.reduce((s, m) => s + m.income, 0) / histCount;
  const avgHistExpense = histMonths.reduce((s, m) => s + m.expense, 0) / histCount;

  let recurringMonthlyExpense = 0;
  let recurringMonthlyIncome = 0;
  for (const r of recurringRows) {
    const monthlyEquivalent = monthlyEquivalentForRecurring(r);
    if (r.type === "expense") {
      recurringMonthlyExpense += monthlyEquivalent;
    } else {
      recurringMonthlyIncome += monthlyEquivalent;
    }
  }

  const projections = [];
  for (let i = 1; i <= 3; i++) {
    const projDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = projDate.toISOString().slice(0, 7);
    const projectedIncome = avgHistIncome;
    const projectedExpense = avgHistExpense;
    const projectedNet = projectedIncome - projectedExpense;

    let risk_notification = null;
    if (projectedNet < 0) {
      const shortfall = Math.abs(projectedNet).toFixed(2);
      risk_notification = `You may fall short by $${shortfall} in ${label} due to recurring expenses and lower income.`;
    } else if (recurringMonthlyExpense > avgHistExpense) {
      const excess = (recurringMonthlyExpense - avgHistExpense).toFixed(2);
      risk_notification = `Your active recurring expenses ($${recurringMonthlyExpense.toFixed(2)}/mo) exceed your historical average by $${excess}. Watch your cash flow in ${label}.`;
    }

    projections.push({
      month: label,
      projected_income: Number(projectedIncome.toFixed(2)),
      projected_expense: Number(projectedExpense.toFixed(2)),
      projected_net: Number(projectedNet.toFixed(2)),
      risk_notification
    });
  }

  return {
    history_months: histCount,
    avg_monthly_income: Number(avgHistIncome.toFixed(2)),
    avg_monthly_expense: Number(avgHistExpense.toFixed(2)),
    recurring_monthly_income: Number(recurringMonthlyIncome.toFixed(2)),
    recurring_monthly_expense: Number(recurringMonthlyExpense.toFixed(2)),
    projections
  };
}

function buildSeasonalPayload(rows) {
  if (rows.length === 0) {
    return { months: [], overall_avg: 0, insights: [] };
  }

  const months = rows.map((r) => ({
    month_num: r.month_num,
    month_name: r.month_name.trim(),
    avg_income: Number(Number(r.avg_income).toFixed(2)),
    total_income: Number(Number(r.total_income).toFixed(2)),
    transaction_count: Number(r.transaction_count)
  }));

  const overall = months.reduce((s, m) => s + m.avg_income, 0) / months.length;

  const enriched = months.map((m) => {
    const pct = overall > 0 ? ((m.avg_income - overall) / overall) * 100 : 0;
    let insight = null;
    if (pct <= -10) {
      insight = `Your ${m.month_name} income is ${Math.abs(pct).toFixed(0)}% lower than average - consider building a buffer in this month.`;
    } else if (pct >= 10) {
      insight = `Your ${m.month_name} income is ${pct.toFixed(0)}% higher than average - a great time to top up savings or build a financial buffer.`;
    }
    return { ...m, deviation_pct: Number(pct.toFixed(1)), insight };
  });

  const sorted = [...enriched].sort((a, b) => b.avg_income - a.avg_income);
  const insights = [];
  if (sorted.length >= 1) {
    insights.push(`Your strongest income month is typically ${sorted[0].month_name} (avg $${sorted[0].avg_income.toFixed(2)}).`);
  }
  if (sorted.length >= 2) {
    const weakest = sorted[sorted.length - 1];
    insights.push(`Your weakest income month is typically ${weakest.month_name} (avg $${weakest.avg_income.toFixed(2)}) - plan accordingly.`);
  }

  return {
    months: enriched,
    overall_avg: Number(overall.toFixed(2)),
    insights
  };
}

function parseWhatIfPayload(body = {}) {
  const parsedIncomeChange = validateOptionalNumber(body.income_change_pct, "income_change_pct", {
    min: -100,
    max: 1000
  });
  if (parsedIncomeChange.error) {
    throw new ApiError(400, parsedIncomeChange.error);
  }

  const parsedExpenseChange = validateOptionalNumber(body.expense_change_pct, "expense_change_pct", {
    min: -100,
    max: 1000
  });
  if (parsedExpenseChange.error) {
    throw new ApiError(400, parsedExpenseChange.error);
  }

  const parsedWeeksOff = validateOptionalNumber(body.weeks_off, "weeks_off", { min: 0, max: 52 });
  if (parsedWeeksOff.error) {
    throw new ApiError(400, parsedWeeksOff.error);
  }

  const parsedCustomIncome = validateOptionalNumber(body.custom_income, "custom_income", {
    min: 0,
    max: MAX_ANALYTICS_AMOUNT
  });
  if (parsedCustomIncome.error) {
    throw new ApiError(400, parsedCustomIncome.error);
  }

  const parsedCustomExpense = validateOptionalNumber(body.custom_expense, "custom_expense", {
    min: 0,
    max: MAX_ANALYTICS_AMOUNT
  });
  if (parsedCustomExpense.error) {
    throw new ApiError(400, parsedCustomExpense.error);
  }

  return {
    incomeChangePct: parsedIncomeChange.value ?? 0,
    expenseChangePct: parsedExpenseChange.value ?? 0,
    weeksOff: parsedWeeksOff.value,
    customIncome: parsedCustomIncome.value,
    customExpense: parsedCustomExpense.value
  };
}

function buildWhatIfPayload({ historyRow, scenario }) {
  const incomeTotal = Number(historyRow?.income_total || 0);
  const expenseTotal = Number(historyRow?.expense_total || 0);
  const baseIncome = incomeTotal / 6;
  const baseExpense = expenseTotal / 6;
  const monthlyIncome = scenario.customIncome !== null ? scenario.customIncome : baseIncome;
  const monthlyExpense = scenario.customExpense !== null ? scenario.customExpense : baseExpense;
  const incomePct = scenario.incomeChangePct;
  const expensePct = scenario.expenseChangePct;
  const weeksOffImpact = scenario.weeksOff !== null
    ? (scenario.weeksOff / WEEKS_PER_MONTH) * monthlyIncome
    : 0;

  const projectedIncome = monthlyIncome * (1 + incomePct / 100) - weeksOffImpact;
  const projectedExpense = monthlyExpense * (1 + expensePct / 100);
  const projectedNet = projectedIncome - projectedExpense;
  const baseNet = monthlyIncome - monthlyExpense;
  const netDelta = projectedNet - baseNet;
  const messages = [];

  if (incomePct !== 0 && !scenario.weeksOff) {
    const direction = incomePct > 0 ? "increase" : "decrease";
    const abs = Math.abs(incomePct);
    const delta = Math.abs(monthlyIncome * incomePct / 100).toFixed(2);
    messages.push(`If you ${direction} your income by ${abs}%, your monthly income could ${direction} by $${delta}.`);
  }

  if (scenario.weeksOff) {
    messages.push(`Taking ${scenario.weeksOff} week(s) off could reduce your monthly cash flow by $${weeksOffImpact.toFixed(2)}.`);
  }

  if (expensePct !== 0) {
    const direction = expensePct > 0 ? "increase" : "decrease";
    const abs = Math.abs(expensePct);
    const delta = Math.abs(monthlyExpense * expensePct / 100).toFixed(2);
    messages.push(`If expenses ${direction} by ${abs}%, your monthly expenses could ${direction} by $${delta}.`);
  }

  if (netDelta < 0) {
    messages.push(`Overall, this scenario reduces your net cash flow by $${Math.abs(netDelta).toFixed(2)} per month.`);
  } else if (netDelta > 0) {
    messages.push(`Overall, this scenario improves your net cash flow by $${netDelta.toFixed(2)} per month.`);
  }

  return {
    baseline: {
      monthly_income: Number(monthlyIncome.toFixed(2)),
      monthly_expense: Number(monthlyExpense.toFixed(2)),
      monthly_net: Number(baseNet.toFixed(2))
    },
    scenario: {
      income_change_pct: incomePct,
      expense_change_pct: expensePct,
      weeks_off: scenario.weeksOff ?? 0,
      projected_income: Number(projectedIncome.toFixed(2)),
      projected_expense: Number(projectedExpense.toFixed(2)),
      projected_net: Number(projectedNet.toFixed(2)),
      net_delta: Number(netDelta.toFixed(2))
    },
    messages
  };
}

module.exports = {
  ANALYTICS_AMOUNT_EXPR,
  ANALYTICS_AMOUNT_EXPR_T,
  buildCashFlowPayload,
  buildDashboardPayload,
  buildSeasonalPayload,
  buildWhatIfPayload,
  estimateSelfEmploymentTax,
  monthStartOffset,
  parseWhatIfPayload,
  pastMonths
};
