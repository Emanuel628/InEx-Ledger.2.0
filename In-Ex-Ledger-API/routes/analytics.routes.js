const express = require("express");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { asyncRoute } = require("../utils/apiError.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const { FEATURE_KEYS } = require("../config/planCatalog.js");
const {
  ANALYTICS_AMOUNT_EXPR,
  ANALYTICS_AMOUNT_EXPR_T,
  buildCashFlowPayload,
  buildDashboardPayload,
  buildSeasonalPayload,
  buildWhatIfPayload,
  monthStartOffset,
  parseWhatIfPayload
} = require("../services/analyticsService.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter());

// ---------------------------------------------------------------------------
// GET /api/analytics/dashboard
// Key financial metrics over the trailing 12 months
// ---------------------------------------------------------------------------
router.get("/dashboard", asyncRoute(async (req, res) => {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    const hasTaxEstimates = hasFeatureAccess(subscription, FEATURE_KEYS.TAX_ESTIMATES);
    const businessRow = await pool.query(
      "SELECT region FROM businesses WHERE id = $1",
      [businessId]
    );
    const region = businessRow.rows[0]?.region || "US";
    const now = new Date();
    const since = monthStartOffset(11);
    const upperBound = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

    // Monthly income / expense totals
    const monthlyResult = await pool.query(
       `SELECT
          DATE_TRUNC('month', date) AS month,
          type,
          SUM(${ANALYTICS_AMOUNT_EXPR}) AS total
        FROM transactions
        WHERE business_id = $1
          AND date >= $2
          AND date < $3
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_at IS NULL
          AND (is_void = false OR is_void IS NULL)
        GROUP BY month, type
        ORDER BY month ASC`,
      [businessId, since, upperBound]
    );

    // Top categories by income
    const topIncomeResult = await pool.query(
       `SELECT
          c.name AS category_name,
          SUM(${ANALYTICS_AMOUNT_EXPR_T}) AS total
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1
          AND t.type = 'income'
          AND t.date >= $2
          AND t.date < $3
          AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
          AND t.deleted_at IS NULL
          AND (t.is_void = false OR t.is_void IS NULL)
        GROUP BY c.name
        ORDER BY total DESC
        LIMIT 5`,
      [businessId, since, upperBound]
    );

    // Top categories by expense
    const topExpenseResult = await pool.query(
       `SELECT
          c.name AS category_name,
          SUM(${ANALYTICS_AMOUNT_EXPR_T}) AS total
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.business_id = $1
          AND t.type = 'expense'
          AND t.date >= $2
          AND t.date < $3
          AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
          AND t.deleted_at IS NULL
          AND (t.is_void = false OR t.is_void IS NULL)
        GROUP BY c.name
        ORDER BY total DESC
        LIMIT 5`,
      [businessId, since, upperBound]
    );

    // Current month vs prior month comparison
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const priorMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

     const currentMonthResult = await pool.query(
       `SELECT type, SUM(${ANALYTICS_AMOUNT_EXPR}) AS total
        FROM transactions
        WHERE business_id = $1 AND date >= $2 AND date < $3
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_at IS NULL AND (is_void = false OR is_void IS NULL)
        GROUP BY type`,
      [businessId, currentMonthStart, nextMonthStart]
    );

     const priorMonthResult = await pool.query(
       `SELECT type, SUM(${ANALYTICS_AMOUNT_EXPR}) AS total
        FROM transactions
        WHERE business_id = $1 AND date >= $2 AND date <= $3
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_at IS NULL AND (is_void = false OR is_void IS NULL)
        GROUP BY type`,
      [businessId, priorMonthStart, priorMonthEnd]
    );

    res.json(buildDashboardPayload({
      monthlyRows: monthlyResult.rows,
      topIncomeRows: topIncomeResult.rows,
      topExpenseRows: topExpenseResult.rows,
      currentMonthRows: currentMonthResult.rows,
      priorMonthRows: priorMonthResult.rows,
      hasTaxEstimates,
      region,
      since,
      now
    }));
}));

// ---------------------------------------------------------------------------
// GET /api/analytics/cash-flow
// Project the next 3 months of cash flow based on the trailing 6-month average
// and recurring transactions
// ---------------------------------------------------------------------------
router.get("/cash-flow", asyncRoute(async (req, res) => {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(5);

    // Historical monthly income / expense for trailing 6 months
     const histResult = await pool.query(
       `SELECT
          DATE_TRUNC('month', date) AS month,
          type,
          SUM(${ANALYTICS_AMOUNT_EXPR}) AS total
        FROM transactions
        WHERE business_id = $1
          AND date >= $2
          AND (is_adjustment = false OR is_adjustment IS NULL)
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

    res.json(buildCashFlowPayload({
      historicalRows: histResult.rows,
      recurringRows: recurringResult.rows
    }));
}));

// ---------------------------------------------------------------------------
// GET /api/analytics/seasonal
// Monthly income averages across all available history, with deviation from
// the overall mean to highlight seasonal highs and lows
// ---------------------------------------------------------------------------
router.get("/seasonal", asyncRoute(async (req, res) => {
    const businessId = await resolveBusinessIdForUser(req.user);

    // Average income per calendar month across all history
     const result = await pool.query(
       `SELECT
          EXTRACT(MONTH FROM date)::int AS month_num,
          TO_CHAR(date, 'Month')        AS month_name,
          AVG(${ANALYTICS_AMOUNT_EXPR}) AS avg_income,
          SUM(${ANALYTICS_AMOUNT_EXPR}) AS total_income,
          COUNT(*)                      AS transaction_count
        FROM transactions
        WHERE business_id = $1
          AND type = 'income'
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_at IS NULL
          AND (is_void = false OR is_void IS NULL)
        GROUP BY month_num, month_name
        ORDER BY month_num ASC`,
      [businessId]
    );

    res.json(buildSeasonalPayload(result.rows));
}));

// ---------------------------------------------------------------------------
// POST /api/analytics/whatif
// Simulate changes to income or expenses and return projected impact
// Payload: { income_change_pct?, expense_change_pct?, weeks_off?, custom_income?, custom_expense? }
// ---------------------------------------------------------------------------
router.post("/whatif", asyncRoute(async (req, res) => {
    const businessId = await resolveBusinessIdForUser(req.user);
    const since = monthStartOffset(5);

    const scenario = parseWhatIfPayload(req.body ?? {});

    // Fetch trailing 6-month average as baseline
     const histResult = await pool.query(
       `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN ${ANALYTICS_AMOUNT_EXPR} ELSE 0 END), 0) AS income_total,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN ${ANALYTICS_AMOUNT_EXPR} ELSE 0 END), 0) AS expense_total
        FROM transactions
        WHERE business_id = $1
          AND date >= $2
          AND (is_adjustment = false OR is_adjustment IS NULL)
          AND deleted_at IS NULL
          AND (is_void = false OR is_void IS NULL)`,
      [businessId, since]
    );

    res.json(buildWhatIfPayload({
      historyRow: histResult.rows?.[0],
      scenario
    }));
}));

module.exports = router;
