const { getSubscriptionSnapshotForBusiness } = require("./subscriptionService.js");

const BASIC_MONTHLY_TRANSACTION_LIMIT = 50;

class BasicPlanLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "BasicPlanLimitError";
    this.statusCode = 402;
    this.code = "basic_transaction_limit_reached";
    this.details = details;
  }
}

function buildCurrentMonthWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

async function countCanonicalTransactionsCreatedThisMonth(db, businessId, now = new Date()) {
  const { start, end } = buildCurrentMonthWindow(now);
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM transactions
      WHERE business_id = $1
        AND created_at >= $2
        AND created_at < $3
        AND (is_adjustment = false OR is_adjustment IS NULL)
        AND (is_void = false OR is_void IS NULL)`,
    [businessId, start.toISOString(), end.toISOString()]
  );

  return Number(result.rows[0]?.count || 0);
}

async function getBasicPlanAllowanceState(db, businessId, { now = new Date(), subscription = null } = {}) {
  const effectiveSubscription = subscription || await getSubscriptionSnapshotForBusiness(businessId);
  const enforced = effectiveSubscription?.effectiveTier === "free";
  const used = enforced
    ? await countCanonicalTransactionsCreatedThisMonth(db, businessId, now)
    : 0;
  const remaining = enforced
    ? Math.max(BASIC_MONTHLY_TRANSACTION_LIMIT - used, 0)
    : Number.POSITIVE_INFINITY;

  return {
    enforced,
    limit: BASIC_MONTHLY_TRANSACTION_LIMIT,
    used,
    remaining,
    subscription: effectiveSubscription
  };
}

async function assertCanCreateTransactions(db, businessId, count = 1, options = {}) {
  const requested = Math.max(Number.parseInt(count, 10) || 0, 0);
  const state = await getBasicPlanAllowanceState(db, businessId, options);

  if (!state.enforced || requested === 0) {
    return state;
  }

  if (state.used + requested > state.limit) {
    throw new BasicPlanLimitError(
      `Basic includes up to ${state.limit} transactions per month. Upgrade to Pro to keep adding transactions this month.`,
      {
        limit: state.limit,
        used: state.used,
        requested,
        remaining: state.remaining
      }
    );
  }

  return state;
}

module.exports = {
  BASIC_MONTHLY_TRANSACTION_LIMIT,
  BasicPlanLimitError,
  buildCurrentMonthWindow,
  countCanonicalTransactionsCreatedThisMonth,
  getBasicPlanAllowanceState,
  assertCanCreateTransactions
};
