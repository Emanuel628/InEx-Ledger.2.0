const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);
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

/**
 * Returns a YYYY-MM-DD string for the first day of the month n months ago.
 */
function monthStartOffset(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/analytics/dashboard
// Key financial metrics over the trailing 12 months
// ---------------------------------------------------------------------------
router.get("/dashboard", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(12);

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
       GROUP BY c.name
       ORDER BY total DESC
       LIMIT 5`,
      [businessId, since]
    );

    // Build monthly map
    const monthlyMap = {};
    for (const row of monthlyResult.rows) {
      const key = String(row.month).slice(0, 7); // YYYY-MM
      if (!monthlyMap[key]) monthlyMap[key] = { income: 0, expense: 0 };
      monthlyMap[key][row.type] += Number(row.total);
    }

    const months = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({ month, income: vals.income, expense: vals.expense, net: vals.income - vals.expense }));

    const totalIncome = months.reduce((s, m) => s + m.income, 0);
    const totalExpense = months.reduce((s, m) => s + m.expense, 0);
    const activeMonths = months.filter((m) => m.income > 0 || m.expense > 0).length || 1;
    const avgMonthlyIncome = totalIncome / activeMonths;
    const avgMonthlyExpense = totalExpense / activeMonths;
    // Estimated tax rate on net income (25% of net income as a % of gross — informational only).
    // Formula: (net * 0.25) / grossIncome * 100 gives the proportion of gross income owed as estimated tax.
    const netIncome = totalIncome - totalExpense;
    const estimatedTaxPct = totalIncome > 0 ? Math.min(100, (netIncome * 0.25) / totalIncome * 100) : 0;

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
    console.error("GET /analytics/dashboard error:", err);
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
    const since = monthStartOffset(6);

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
    const monthTotals = {};
    for (const row of histResult.rows) {
      const key = String(row.month).slice(0, 7);
      if (!monthTotals[key]) monthTotals[key] = { income: 0, expense: 0 };
      monthTotals[key][row.type] += Number(row.total);
    }

    const histMonths = Object.values(monthTotals);
    const histCount = histMonths.length || 1;
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
          monthlyEquivalent = amount * 4.33;
          break;
        case "biweekly":
          monthlyEquivalent = amount * 2.17;
          break;
        case "monthly":
          monthlyEquivalent = amount;
          break;
        case "quarterly":
          monthlyEquivalent = amount / 3;
          break;
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
    console.error("GET /analytics/cash-flow error:", err);
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
        insight = `Your ${m.month_name} income is ${pct.toFixed(0)}% higher than average — a great time to top up savings or goals.`;
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
    console.error("GET /analytics/seasonal error:", err);
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
    const since = monthStartOffset(6);

    const {
      income_change_pct,
      expense_change_pct,
      weeks_off,
      custom_income,
      custom_expense
    } = req.body ?? {};

    // Fetch trailing 6-month average as baseline
    const histResult = await pool.query(
      `SELECT type, SUM(amount) AS total, COUNT(DISTINCT DATE_TRUNC('month', date)) AS months
       FROM transactions
       WHERE business_id = $1
         AND date >= $2
         AND is_adjustment = false
       GROUP BY type`,
      [businessId, since]
    );

    let baseIncome = 0;
    let baseExpense = 0;
    for (const row of histResult.rows) {
      const avg = Number(row.total) / Math.max(1, Number(row.months));
      if (row.type === "income") baseIncome = avg;
      else baseExpense = avg;
    }

    // Override with custom baseline if provided
    const monthlyIncome = custom_income != null ? Number(custom_income) : baseIncome;
    const monthlyExpense = custom_expense != null ? Number(custom_expense) : baseExpense;

    // Apply income change percentage
    const incomePct = income_change_pct != null ? Number(income_change_pct) : 0;
    const expensePct = expense_change_pct != null ? Number(expense_change_pct) : 0;

    // Weeks-off impact: reduce monthly income proportionally (assume 4.33 weeks/month)
    const weeksOffImpact = weeks_off != null ? (Number(weeks_off) / 4.33) * monthlyIncome : 0;

    const projectedIncome = monthlyIncome * (1 + incomePct / 100) - weeksOffImpact;
    const projectedExpense = monthlyExpense * (1 + expensePct / 100);
    const projectedNet = projectedIncome - projectedExpense;
    const baseNet = monthlyIncome - monthlyExpense;
    const netDelta = projectedNet - baseNet;

    // Build narrative messages
    const messages = [];

    if (incomePct !== 0 && !weeks_off) {
      const direction = incomePct > 0 ? "increase" : "decrease";
      const abs = Math.abs(incomePct);
      const delta = Math.abs(monthlyIncome * incomePct / 100).toFixed(2);
      messages.push(`If you ${direction} your income by ${abs}%, your monthly income could ${direction} by $${delta}.`);
    }

    if (weeks_off) {
      messages.push(`Taking ${weeks_off} week(s) off could reduce your monthly cash flow by $${weeksOffImpact.toFixed(2)}.`);
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
        weeks_off: weeks_off ?? 0,
        projected_income: Number(projectedIncome.toFixed(2)),
        projected_expense: Number(projectedExpense.toFixed(2)),
        projected_net: Number(projectedNet.toFixed(2)),
        net_delta: Number(netDelta.toFixed(2))
      },
      messages
    });
  } catch (err) {
    console.error("POST /analytics/whatif error:", err);
    res.status(500).json({ error: "Failed to compute what-if scenario." });
  }
});

module.exports = router;
