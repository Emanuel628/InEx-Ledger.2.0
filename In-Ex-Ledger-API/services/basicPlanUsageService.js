const { getSubscriptionSnapshotForBusiness } = require("./subscriptionService.js");

// ── Basic plan monthly caps ─────────────────────────────────────────────────
const BASIC_MONTHLY_TRANSACTION_LIMIT = 50;
const BASIC_MONTHLY_RECEIPT_LIMIT = 25;
const BASIC_MONTHLY_CSV_IMPORT_LIMIT = 50;

/**
 * Raised when a Basic-tier business would exceed one of its monthly caps.
 * `code` and `statusCode` vary by resource; `details` carries only the
 * public-facing fields that should appear in the API response body.
 */
class BasicPlanLimitError extends Error {
  constructor(message, { code = "basic_transaction_limit_reached", statusCode = 402, details = {} } = {}) {
    super(message);
    this.name = "BasicPlanLimitError";
    this.code = code;
    this.statusCode = statusCode;
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

function isBasicTier(subscription) {
  return (subscription?.effectiveTier || "free") === "free";
}

/**
 * Live count of transactions created in the current month for a business.
 *
 * Archived / voided transactions are intentionally still counted: the row
 * persists after a soft delete, so a Basic user cannot reclaim a slot by
 * archiving and recreating. Adjustment pivot rows are excluded because they
 * represent edits to an existing transaction, not a new one.
 */
async function countCanonicalTransactionsCreatedThisMonth(db, businessId, now = new Date()) {
  const { start, end } = buildCurrentMonthWindow(now);
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM transactions
      WHERE business_id = $1
        AND created_at >= $2
        AND created_at < $3
        AND (is_adjustment = false OR is_adjustment IS NULL)`,
    [businessId, start.toISOString(), end.toISOString()]
  );
  return Number(result.rows[0]?.count || 0);
}

/**
 * Live count of CSV-imported transaction rows created in the current month.
 * Reverted imports remain counted (the rows are soft-deleted, not removed).
 */
async function countCsvImportRowsThisMonth(db, businessId, now = new Date()) {
  const { start, end } = buildCurrentMonthWindow(now);
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
       FROM transactions
      WHERE business_id = $1
        AND created_at >= $2
        AND created_at < $3
        AND import_source = 'csv'`,
    [businessId, start.toISOString(), end.toISOString()]
  );
  return Number(result.rows[0]?.count || 0);
}

/**
 * Returns (creating it if needed) the business_usage_periods row for the
 * current calendar month. The row backs the receipt counter and the
 * usage-limit email threshold tracking.
 */
async function getOrCreateCurrentPeriod(db, businessId, now = new Date()) {
  const { start, end } = buildCurrentMonthWindow(now);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);
  const result = await db.query(
    `INSERT INTO business_usage_periods (business_id, period_start, period_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (business_id, period_start)
     DO UPDATE SET updated_at = now()
     RETURNING *`,
    [businessId, periodStart, periodEnd]
  );
  return result.rows[0];
}

/**
 * Increments the authoritative monthly receipt-upload counter. The counter is
 * never decremented (deleting a receipt does not refund a slot) so users
 * cannot bypass the cap by deleting and re-uploading.
 */
async function incrementReceiptUsage(db, businessId, count = 1, now = new Date()) {
  const delta = Math.max(Number.parseInt(count, 10) || 0, 0);
  const { start, end } = buildCurrentMonthWindow(now);
  const periodStart = start.toISOString().slice(0, 10);
  const periodEnd = end.toISOString().slice(0, 10);
  const result = await db.query(
    `INSERT INTO business_usage_periods (business_id, period_start, period_end, receipts_used)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_id, period_start)
     DO UPDATE SET receipts_used = business_usage_periods.receipts_used + EXCLUDED.receipts_used,
                   updated_at = now()
     RETURNING *`,
    [businessId, periodStart, periodEnd, delta]
  );
  return result.rows[0];
}

/**
 * Builds a usage summary for all three metered resources. Used by enforcement
 * checks and by the usage-limit email evaluator.
 */
async function getUsageSummary(db, businessId, { now = new Date(), subscription = null } = {}) {
  const effectiveSubscription = subscription || await getSubscriptionSnapshotForBusiness(businessId);
  const enforced = isBasicTier(effectiveSubscription);

  const period = await getOrCreateCurrentPeriod(db, businessId, now);
  const transactionsUsed = await countCanonicalTransactionsCreatedThisMonth(db, businessId, now);
  const csvRowsUsed = await countCsvImportRowsThisMonth(db, businessId, now);
  const receiptsUsed = Number(period?.receipts_used || 0);

  const buildMetric = (limit, used) => ({
    limit,
    used,
    remaining: enforced ? Math.max(limit - used, 0) : Number.POSITIVE_INFINITY
  });

  return {
    enforced,
    subscription: effectiveSubscription,
    period,
    transactions: buildMetric(BASIC_MONTHLY_TRANSACTION_LIMIT, transactionsUsed),
    receipts: buildMetric(BASIC_MONTHLY_RECEIPT_LIMIT, receiptsUsed),
    csvImportRows: buildMetric(BASIC_MONTHLY_CSV_IMPORT_LIMIT, csvRowsUsed)
  };
}

/**
 * Transaction allowance state. Kept for backward compatibility with callers
 * (transactions + recurring) that expect { enforced, limit, used, remaining }.
 */
async function getBasicPlanAllowanceState(db, businessId, { now = new Date(), subscription = null } = {}) {
  const effectiveSubscription = subscription || await getSubscriptionSnapshotForBusiness(businessId);
  const enforced = isBasicTier(effectiveSubscription);
  const used = enforced ? await countCanonicalTransactionsCreatedThisMonth(db, businessId, now) : 0;
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

/**
 * Throws BasicPlanLimitError if creating `count` transactions would exceed the
 * Basic monthly transaction cap. No-op for Pro/Business tiers.
 */
async function assertCanCreateTransactions(db, businessId, count = 1, options = {}) {
  const requested = Math.max(Number.parseInt(count, 10) || 0, 0);
  const state = await getBasicPlanAllowanceState(db, businessId, options);

  if (!state.enforced || requested === 0) {
    return state;
  }

  if (state.used + requested > state.limit) {
    throw new BasicPlanLimitError(
      `You've reached your ${state.limit} Basic transactions for this month. Your records are safe. You can upgrade to Pro to keep adding more this month.`,
      {
        code: "basic_transaction_limit_reached",
        statusCode: 402,
        details: { limit: state.limit, used: state.used }
      }
    );
  }

  return state;
}

/**
 * Throws BasicPlanLimitError if uploading `count` receipts would exceed the
 * Basic monthly receipt cap. No-op for Pro/Business tiers.
 */
async function assertCanUploadReceipts(db, businessId, count = 1, options = {}) {
  const requested = Math.max(Number.parseInt(count, 10) || 0, 0);
  const effectiveSubscription = options.subscription || await getSubscriptionSnapshotForBusiness(businessId);
  const enforced = isBasicTier(effectiveSubscription);
  const limit = BASIC_MONTHLY_RECEIPT_LIMIT;

  if (!enforced || requested === 0) {
    return { enforced, limit, used: 0, remaining: enforced ? limit : Number.POSITIVE_INFINITY, subscription: effectiveSubscription };
  }

  const period = await getOrCreateCurrentPeriod(db, businessId, options.now || new Date());
  const used = Number(period?.receipts_used || 0);

  if (used + requested > limit) {
    throw new BasicPlanLimitError(
      "You've reached your Basic receipt limit for this month. You can keep adding transactions, or upgrade to Pro to keep uploading receipts.",
      {
        code: "basic_receipt_limit_reached",
        statusCode: 402,
        details: { limit, used }
      }
    );
  }

  return { enforced, limit, used, remaining: Math.max(limit - used, 0), subscription: effectiveSubscription, period };
}

/**
 * Throws BasicPlanLimitError if importing `validRowCount` CSV rows would
 * exceed either the Basic monthly CSV-import cap or the remaining monthly
 * transaction slots (imported rows consume transaction slots too).
 *
 * Because every imported row also consumes a transaction slot, the remaining
 * transaction slots are always the binding constraint for a Basic business.
 */
async function assertCanImportCsvRows(db, businessId, validRowCount, options = {}) {
  const requested = Math.max(Number.parseInt(validRowCount, 10) || 0, 0);
  const effectiveSubscription = options.subscription || await getSubscriptionSnapshotForBusiness(businessId);
  const enforced = isBasicTier(effectiveSubscription);
  const now = options.now || new Date();

  if (!enforced) {
    return {
      enforced: false,
      transactionSlotsRemaining: Number.POSITIVE_INFINITY,
      csvImportRowsRemaining: Number.POSITIVE_INFINITY,
      subscription: effectiveSubscription
    };
  }

  const transactionsUsed = await countCanonicalTransactionsCreatedThisMonth(db, businessId, now);
  const csvRowsUsed = await countCsvImportRowsThisMonth(db, businessId, now);
  const transactionSlotsRemaining = Math.max(BASIC_MONTHLY_TRANSACTION_LIMIT - transactionsUsed, 0);
  const csvImportRowsRemaining = Math.max(BASIC_MONTHLY_CSV_IMPORT_LIMIT - csvRowsUsed, 0);
  const slots = Math.min(transactionSlotsRemaining, csvImportRowsRemaining);

  if (requested > 0 && requested > slots) {
    throw new BasicPlanLimitError(
      `Your Basic plan has ${transactionSlotsRemaining} transaction slots left this month. ` +
      `This CSV contains ${requested} valid rows. ` +
      "Choose a smaller date range or upgrade to Pro for higher import limits.",
      {
        code: "basic_csv_import_limit_exceeded",
        statusCode: 402,
        details: {
          csv_valid_rows: requested,
          transaction_slots_remaining: transactionSlotsRemaining,
          csv_import_rows_remaining: csvImportRowsRemaining
        }
      }
    );
  }

  return {
    enforced: true,
    transactionSlotsRemaining,
    csvImportRowsRemaining,
    subscription: effectiveSubscription
  };
}

module.exports = {
  BASIC_MONTHLY_TRANSACTION_LIMIT,
  BASIC_MONTHLY_RECEIPT_LIMIT,
  BASIC_MONTHLY_CSV_IMPORT_LIMIT,
  BasicPlanLimitError,
  buildCurrentMonthWindow,
  countCanonicalTransactionsCreatedThisMonth,
  countCsvImportRowsThisMonth,
  getOrCreateCurrentPeriod,
  incrementReceiptUsage,
  getUsageSummary,
  getBasicPlanAllowanceState,
  assertCanCreateTransactions,
  assertCanUploadReceipts,
  assertCanImportCsvRows
};
