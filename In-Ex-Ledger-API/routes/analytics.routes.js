const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const WEEKS_PER_MONTH = 52 / 12;
const BIWEEKS_PER_MONTH = 26 / 12;
const MAX_ANALYTICS_AMOUNT = 999999999.99;

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Returns a list of {year, month} objects for the past N months (inclusive of
 * the current month). month is 1-based.
 */
function pastMonths(n) {
  const months = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildTrailingMonthMap(monthCount) {
  return pastMonths(monthCount).reduce((acc, entry) => {
    acc.set(monthKey(entry.year, entry.month), {
      month: monthKey(entry.year, entry.month),
      income: 0,
      expense: 0,
      net: 0
    });
    return acc;
  }, new Map());
}

/**
 * Returns a YYYY-MM-DD string for the first day of the month n months ago.
 */
function monthStartOffset(n) {
  const d = new Date();
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

// ---------------------------------------------------------------------------
// GET /api/analytics/dashboard
// Key financial metrics over the trailing 12 months
// ---------------------------------------------------------------------------
router.get("/dashboard", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(11);

    // Monthly income / expense totals
    const monthlyResult = await pool.query(
      `SELECT
         DATE_TRUNC('month', date) AS month,
         type,
         SUM(amount) AS total
       FROM transactions
       WHERE business_id = $1
         AND date >= $2
         AND is_adjustment = false
         AND deleted_at IS NULL
         AND (is_void = false OR is_void IS NULL)
       GROUP BY month, type
       ORDER BY month ASC`,
      [businessId, since]
    );

    // Top categories by income
    const topIncomeResult = await pool.query(
      `SELECT
         c.name AS category_name,
         SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.business_id = $1
         AND t.type = 'income'
         AND t.date >= $2
         AND t.is_adjustment = false
         AND t.deleted_at IS NULL
         AND (t.is_void = false OR t.is_void IS NULL)
       GROUP BY c.name
       ORDER BY total DESC
       LIMIT 5`,
      [businessId, since]
    );

    // Top categories by expense
    const topExpenseResult = await pool.query(
      `SELECT
         c.name AS category_name,
         SUM(t.amount) AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.business_id = $1
         AND t.type = 'expense'
         AND t.date >= $2
         AND t.is_adjustment = false
         AND t.deleted_at IS NULL
         AND (t.is_void = false OR t.is_void IS NULL)
       GROUP BY c.name
       ORDER BY total DESC
       LIMIT 5`,
      [businessId, since]
    );

    // Build monthly map
    const monthlyMap = buildTrailingMonthMap(12);
    for (const row of monthlyResult.rows) {
      const key = String(row.month).slice(0, 7); // YYYY-MM
      const bucket = monthlyMap.get(key);
      if (!bucket) {
        continue;
      }
      bucket[row.type] += Number(row.total);
      bucket.net = bucket.income - bucket.expense;
    }

    const months = pastMonths(12).map((entry) => {
      const key = monthKey(entry.year, entry.month);
      return monthlyMap.get(key) || { month: key, income: 0, expense: 0, net: 0 };
    });

    const totalIncome = months.reduce((s, m) => s + m.income, 0);
    const totalExpense = months.reduce((s, m) => s + m.expense, 0);
    const avgMonthlyIncome = totalIncome / 12;
    const avgMonthlyExpense = totalExpense / 12;
    // Estimated tax rate on net income (25% of net income as a % of gross — informational only).
    // Formula: (net * 0.25) / grossIncome * 100 gives the proportion of gross income owed as estimated tax.
    const netIncome = totalIncome - totalExpense;
    const estimatedTaxPct = totalIncome > 0
      ? Math.min(100, Math.max(0, (Math.max(netIncome, 0) * 0.25) / totalIncome * 100))
      : 0;

    res.json({
      period_months: 12,
      since,
      summary: {
        total_income: Number(totalIncome.toFixed(2)),
        total_expense: Number(totalExpense.toFixed(2)),
        net: Number(netIncome.toFixed(2)),
        avg_monthly_income: Number(avgMonthlyIncome.toFixed(2)),
        avg_monthly_expense: Number(avgMonthlyExpense.toFixed(2)),
        estimated_tax_liability_pct: Number(estimatedTaxPct.toFixed(1))
      },
      monthly_breakdown: months,
      top_income_sources: topIncomeResult.rows.map((r) => ({
        category: r.category_name || "Uncategorized",
        total: Number(r.total)
      })),
      top_expense_categories: topExpenseResult.rows.map((r) => ({
        category: r.category_name || "Uncategorized",
        total: Number(r.total)
      }))
    });
  } catch (err) {
    logError("GET /analytics/dashboard error:", err);
    res.status(500).json({ error: "Failed to load dashboard analytics." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/cash-flow
// Project the next 3 months of cash flow based on the trailing 6-month average
// and recurring transactions
// ---------------------------------------------------------------------------
router.get("/cash-flow", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(5);

    // Historical monthly income / expense for trailing 6 months
    const histResult = await pool.query(
      `SELECT
         DATE_TRUNC('month', date) AS month,
         type,
         SUM(amount) AS total
       FROM transactions
       WHERE business_id = $1
         AND date >= $2
         AND is_adjustment = false
         AND deleted_at IS NULL
         AND (is_void = false OR is_void IS NULL)
       GROUP BY month, type`,
      [businessId, since]
    );

    // Active recurring transactions
    const recurringResult = await pool.query(
      `SELECT amount, type, cadence
       FROM recurring_transactions
       WHERE business_id = $1 AND active = true`,
      [businessId]
    );

    // Summarise historical averages
    const monthTotals = buildTrailingMonthMap(6);
    for (const row of histResult.rows) {
      const key = String(row.month).slice(0, 7);
      const bucket = monthTotals.get(key);
      if (!bucket) {
        continue;
      }
      bucket[row.type] += Number(row.total);
      bucket.net = bucket.income - bucket.expense;
    }

    const histMonths = pastMonths(6).map((entry) => {
      const key = monthKey(entry.year, entry.month);
      return monthTotals.get(key) || { month: key, income: 0, expense: 0, net: 0 };
    });
    const histCount = 6;
    const avgHistIncome = histMonths.reduce((s, m) => s + m.income, 0) / histCount;
    const avgHistExpense = histMonths.reduce((s, m) => s + m.expense, 0) / histCount;

    // Estimate monthly recurring amounts
    let recurringMonthlyExpense = 0;
    let recurringMonthlyIncome = 0;
    for (const r of recurringResult.rows) {
      const amount = Number(r.amount);
      let monthlyEquivalent = 0;
      switch (r.cadence) {
        case "weekly":
          monthlyEquivalent = amount * WEEKS_PER_MONTH;
          break;
        case "biweekly":
          monthlyEquivalent = amount * BIWEEKS_PER_MONTH;
          break;
        case "monthly":
          monthlyEquivalent = amount;
          break;
        case "quarterly":
          monthlyEquivalent = amount / 3;
          break;
        case "yearly":
        case "annually":
          monthlyEquivalent = amount / 12;
          break;
        default:
          monthlyEquivalent = amount;
      }

      if (r.type === "expense") {
        recurringMonthlyExpense += monthlyEquivalent;
      } else {
        recurringMonthlyIncome += monthlyEquivalent;
      }
    }

    // Project next 3 months.
    // Use historical average as expense baseline (recurring transactions are already included
    // in that history). If active recurring commitments now exceed the historical average,
    // warn the user but don't silently inflate the projected expense — report both.
    const projections = [];
    const now = new Date();

    for (let i = 1; i <= 3; i++) {
      const projDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = projDate.toISOString().slice(0, 7);
      // Projected income: historical average (non-recurring) + known recurring income
      const projectedIncome = avgHistIncome + recurringMonthlyIncome;
      // Projected expense: use historical average as the baseline
      const projectedExpense = avgHistExpense;
      const projectedNet = projectedIncome - projectedExpense;

      let risk_notification = null;
      if (projectedNet < 0) {
        const shortfall = Math.abs(projectedNet).toFixed(2);
        risk_notification = `You may fall short by $${shortfall} in ${label} due to recurring expenses and lower income.`;
      } else if (recurringMonthlyExpense > avgHistExpense) {
        // Committed recurring is higher than historical — worth flagging
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

    res.json({
      history_months: histCount,
      avg_monthly_income: Number(avgHistIncome.toFixed(2)),
      avg_monthly_expense: Number(avgHistExpense.toFixed(2)),
      recurring_monthly_income: Number(recurringMonthlyIncome.toFixed(2)),
      recurring_monthly_expense: Number(recurringMonthlyExpense.toFixed(2)),
      projections
    });
  } catch (err) {
    logError("GET /analytics/cash-flow error:", err);
    res.status(500).json({ error: "Failed to load cash flow projection." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/analytics/seasonal
// Monthly income averages across all available history, with deviation from
// the overall mean to highlight seasonal highs and lows
// ---------------------------------------------------------------------------
router.get("/seasonal", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);

    // Average income per calendar month across all history
    const result = await pool.query(
      `SELECT
         EXTRACT(MONTH FROM date)::int AS month_num,
         TO_CHAR(date, 'Month')        AS month_name,
         AVG(amount)                   AS avg_income,
         SUM(amount)                   AS total_income,
         COUNT(*)                      AS transaction_count
       FROM transactions
       WHERE business_id = $1
         AND type = 'income'
         AND is_adjustment = false
         AND deleted_at IS NULL
         AND (is_void = false OR is_void IS NULL)
       GROUP BY month_num, month_name
       ORDER BY month_num ASC`,
      [businessId]
    );

    if (result.rowCount === 0) {
      return res.json({ months: [], overall_avg: 0, insights: [] });
    }

    const months = result.rows.map((r) => ({
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
        insight = `Your ${m.month_name} income is ${Math.abs(pct).toFixed(0)}% lower than average — consider building a buffer in this month.`;
      } else if (pct >= 10) {
        insight = `Your ${m.month_name} income is ${pct.toFixed(0)}% higher than average — a great time to top up savings or build a financial buffer.`;
      }
      return { ...m, deviation_pct: Number(pct.toFixed(1)), insight };
    });

    // Top and bottom months
    const sorted = [...enriched].sort((a, b) => b.avg_income - a.avg_income);
    const insights = [];
    if (sorted.length >= 1) {
      insights.push(`Your strongest income month is typically ${sorted[0].month_name} (avg $${sorted[0].avg_income.toFixed(2)}).`);
    }
    if (sorted.length >= 2) {
      const weakest = sorted[sorted.length - 1];
      insights.push(`Your weakest income month is typically ${weakest.month_name} (avg $${weakest.avg_income.toFixed(2)}) — plan accordingly.`);
    }

    res.json({
      months: enriched,
      overall_avg: Number(overall.toFixed(2)),
      insights
    });
  } catch (err) {
    logError("GET /analytics/seasonal error:", err);
    res.status(500).json({ error: "Failed to load seasonal analysis." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analytics/whatif
// Simulate changes to income or expenses and return projected impact
// Payload: { income_change_pct?, expense_change_pct?, weeks_off?, custom_income?, custom_expense? }
// ---------------------------------------------------------------------------
router.post("/whatif", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(5);

    const {
      income_change_pct,
      expense_change_pct,
      weeks_off,
      custom_income,
      custom_expense
    } = req.body ?? {};

    const parsedIncomeChange = validateOptionalNumber(income_change_pct, "income_change_pct", {
      min: -100,
      max: 1000
    });
    if (parsedIncomeChange.error) {
      return res.status(400).json({ error: parsedIncomeChange.error });
    }

    const parsedExpenseChange = validateOptionalNumber(expense_change_pct, "expense_change_pct", {
      min: -100,
      max: 1000
    });
    if (parsedExpenseChange.error) {
      return res.status(400).json({ error: parsedExpenseChange.error });
    }

    const parsedWeeksOff = validateOptionalNumber(weeks_off, "weeks_off", { min: 0, max: 52 });
    if (parsedWeeksOff.error) {
      return res.status(400).json({ error: parsedWeeksOff.error });
    }

    const parsedCustomIncome = validateOptionalNumber(custom_income, "custom_income", {
      min: 0,
      max: MAX_ANALYTICS_AMOUNT
    });
    if (parsedCustomIncome.error) {
      return res.status(400).json({ error: parsedCustomIncome.error });
    }

    const parsedCustomExpense = validateOptionalNumber(custom_expense, "custom_expense", {
      min: 0,
      max: MAX_ANALYTICS_AMOUNT
    });
    if (parsedCustomExpense.error) {
      return res.status(400).json({ error: parsedCustomExpense.error });
    }

    // Fetch trailing 6-month average as baseline
    const histResult = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income_total,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense_total
       FROM transactions
       WHERE business_id = $1
         AND date >= $2
         AND is_adjustment = false
         AND deleted_at IS NULL
         AND (is_void = false OR is_void IS NULL)`,
      [businessId, since]
    );

    const incomeTotal = Number(histResult.rows?.[0]?.income_total || 0);
    const expenseTotal = Number(histResult.rows?.[0]?.expense_total || 0);
    const baseIncome = incomeTotal / 6;
    const baseExpense = expenseTotal / 6;

    // Override with custom baseline if provided
    const monthlyIncome = parsedCustomIncome.value !== null ? parsedCustomIncome.value : baseIncome;
    const monthlyExpense = parsedCustomExpense.value !== null ? parsedCustomExpense.value : baseExpense;

    // Apply income change percentage
    const incomePct = parsedIncomeChange.value ?? 0;
    const expensePct = parsedExpenseChange.value ?? 0;

    // Weeks-off impact: reduce monthly income proportionally using the exact
    // average weeks per month derived from a 52-week year.
    const weeksOffImpact = parsedWeeksOff.value !== null
      ? (parsedWeeksOff.value / WEEKS_PER_MONTH) * monthlyIncome
      : 0;

    const projectedIncome = monthlyIncome * (1 + incomePct / 100) - weeksOffImpact;
    const projectedExpense = monthlyExpense * (1 + expensePct / 100);
    const projectedNet = projectedIncome - projectedExpense;
    const baseNet = monthlyIncome - monthlyExpense;
    const netDelta = projectedNet - baseNet;

    // Build narrative messages
    const messages = [];

    if (incomePct !== 0 && !parsedWeeksOff.value) {
      const direction = incomePct > 0 ? "increase" : "decrease";
      const abs = Math.abs(incomePct);
      const delta = Math.abs(monthlyIncome * incomePct / 100).toFixed(2);
      messages.push(`If you ${direction} your income by ${abs}%, your monthly income could ${direction} by $${delta}.`);
    }

    if (parsedWeeksOff.value) {
      messages.push(`Taking ${parsedWeeksOff.value} week(s) off could reduce your monthly cash flow by $${weeksOffImpact.toFixed(2)}.`);
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

    res.json({
      baseline: {
        monthly_income: Number(monthlyIncome.toFixed(2)),
        monthly_expense: Number(monthlyExpense.toFixed(2)),
        monthly_net: Number(baseNet.toFixed(2))
      },
      scenario: {
        income_change_pct: incomePct,
        expense_change_pct: expensePct,
        weeks_off: parsedWeeksOff.value ?? 0,
        projected_income: Number(projectedIncome.toFixed(2)),
        projected_expense: Number(projectedExpense.toFixed(2)),
        projected_net: Number(projectedNet.toFixed(2)),
        net_delta: Number(netDelta.toFixed(2))
      },
      messages
    });
  } catch (err) {
    logError("POST /analytics/whatif error:", err);
    res.status(500).json({ error: "Failed to compute what-if scenario." });
  }
});

module.exports = router;
