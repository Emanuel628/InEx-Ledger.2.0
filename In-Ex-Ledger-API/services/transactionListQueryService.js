"use strict";

// Pure query-building helpers for GET /api/transactions: turning request
// query params into a validated filter set and the resulting SQL WHERE
// clause. Kept side-effect-free (no db access) so they're directly testable
// without a database or mocked pool.

const { isTransactionReviewStatus } = require("../config/transactionReviewStatus.js");
const { normalizeReviewFilter } = require("./transactionReviewFlagService.js");
// Despite the filename, this validates a plain UUID string and has no v2-specific
// behavior -- it's the same shared helper the v2 business routes already use.
const { isUuid } = require("../api/utils/v2HttpValidators.js");

const TRANSACTIONS_HARD_CAP = 50000;
const TRANSACTIONS_DEFAULT_LIMIT = 100;
const TRANSACTIONS_CAPPED_LIMIT = 5000;
const VALID_TRANSACTION_PERIODS = new Set(["this-month", "last-month", "ytd", "all"]);

function getTransactionPeriodBounds(period, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (period === "this-month") {
    return {
      start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)).toISOString().slice(0, 10)
    };
  }

  if (period === "last-month") {
    return {
      start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)).toISOString().slice(0, 10)
    };
  }

  if (period === "ytd") {
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)).toISOString().slice(0, 10)
    };
  }

  return null;
}

function buildTransactionListFilters(query, now = new Date()) {
  const wantsAll = ["true", "1", "yes"].includes(String(query.all || "").toLowerCase());
  const requestedLimit = parseInt(query.limit, 10);
  const limit = wantsAll
    ? TRANSACTIONS_HARD_CAP
    : Math.min(Math.max(requestedLimit || TRANSACTIONS_DEFAULT_LIMIT, 1), TRANSACTIONS_CAPPED_LIMIT);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const accountId = String(query.account_id || "").trim();
  const categoryId = String(query.category_id || "").trim();
  const accountName = String(query.account_name || "").trim();
  const categoryName = String(query.category_name || "").trim();
  const type = String(query.type || "").trim().toLowerCase();
  const period = String(query.period || "all").trim().toLowerCase() || "all";
  const startDate = String(query.start_date || "").trim();
  const endDate = String(query.end_date || "").trim();
  const v3Status = String(query.v3_status || "").trim().toLowerCase();

  if (accountId && !isUuid(accountId)) {
    return { valid: false, error: "Invalid account_id." };
  }
  if (categoryId && !isUuid(categoryId)) {
    return { valid: false, error: "Invalid category_id." };
  }
  if (type && type !== "income" && type !== "expense") {
    return { valid: false, error: "Invalid type filter." };
  }
  if (!VALID_TRANSACTION_PERIODS.has(period)) {
    return { valid: false, error: "Invalid period filter." };
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return { valid: false, error: "Invalid start_date." };
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { valid: false, error: "Invalid end_date." };
  }
  if (startDate && endDate && startDate > endDate) {
    return { valid: false, error: "start_date must be on or before end_date." };
  }
  if (v3Status && !["cleared", "draft"].includes(v3Status)) {
    return { valid: false, error: "Invalid v3_status filter." };
  }

  const reviewStatus = String(query.review_status || "").trim().toLowerCase();
  if (reviewStatus && !isTransactionReviewStatus(reviewStatus)) {
    return { valid: false, error: "Invalid review_status filter." };
  }

  return {
    valid: true,
    wantsAll,
    limit,
    offset,
    accountId,
    accountName,
    categoryId,
    categoryName,
    type,
    search: String(query.search || "").trim(),
    period,
    periodBounds: getTransactionPeriodBounds(period, now),
    startDate,
    endDate,
    v3Status,
    reviewStatus,
    review: normalizeReviewFilter(query.review)
  };
}

function buildTransactionListWhereClause(scopeBusinessIds, filters) {
  const params = [scopeBusinessIds];
  const clauses = [
    "t.business_id = ANY($1::uuid[])",
    "t.deleted_at IS NULL",
    "(t.is_adjustment = false OR t.is_adjustment IS NULL)",
    "(t.is_void = false OR t.is_void IS NULL)"
  ];

  if (filters.accountId) {
    params.push(filters.accountId);
    clauses.push(`t.account_id = $${params.length}::uuid`);
  } else if (filters.accountName) {
    params.push(filters.accountName);
    clauses.push(`LOWER(COALESCE(a.name, '')) = LOWER($${params.length})`);
  }

  if (filters.categoryId) {
    params.push(filters.categoryId);
    clauses.push(`t.category_id = $${params.length}::uuid`);
  } else if (filters.categoryName) {
    params.push(filters.categoryName);
    clauses.push(`LOWER(COALESCE(c.name, '')) = LOWER($${params.length})`);
  }

  if (filters.type) {
    params.push(filters.type);
    clauses.push(`t.type = $${params.length}`);
  }

  if (filters.periodBounds) {
    params.push(filters.periodBounds.start);
    clauses.push(`t.date >= $${params.length}`);
    params.push(filters.periodBounds.end);
    clauses.push(`t.date < $${params.length}`);
  }

  if (filters.startDate) {
    params.push(filters.startDate);
    clauses.push(`t.date >= $${params.length}`);
  }

  if (filters.endDate) {
    params.push(filters.endDate);
    clauses.push(`t.date <= $${params.length}`);
  }

  if (filters.reviewStatus) {
    params.push(filters.reviewStatus);
    clauses.push(`t.review_status = $${params.length}`);
  }

  if (filters.v3Status === "cleared") {
    clauses.push("t.cleared = true");
  } else if (filters.v3Status === "draft") {
    clauses.push("COALESCE(t.cleared, false) = false");
    clauses.push("(t.review_status IS NULL OR t.review_status NOT IN ('needs_review'))");
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    const searchParam = `$${params.length}`;
    clauses.push(`(
      COALESCE(t.description, '') ILIKE ${searchParam}
      OR COALESCE(t.note, '') ILIKE ${searchParam}
      OR COALESCE(t.review_notes, '') ILIKE ${searchParam}
      OR COALESCE(t.tax_treatment, '') ILIKE ${searchParam}
      OR COALESCE(t.currency, '') ILIKE ${searchParam}
      OR COALESCE(t.payer_name, '') ILIKE ${searchParam}
      OR COALESCE(a.name, '') ILIKE ${searchParam}
      OR COALESCE(c.name, '') ILIKE ${searchParam}
      OR COALESCE(b.name, '') ILIKE ${searchParam}
    )`);
  }

  return {
    whereSql: clauses.join("\n         AND "),
    params
  };
}

// GET /api/transactions runs three queries against the same filtered scope:
// an unpaginated "review source" pass (to compute review-status counts and,
// when a review filter is active, the exact set of matching ids), the
// paginated list itself, and an aggregate summary. The review filter can't be
// expressed in SQL directly -- matching happens in JS against decrypted
// fields -- so its result has to be folded back into the WHERE clause used by
// the other two queries. These three builders keep that shape as pure
// SQL/params construction, testable without a database.

function buildTransactionReviewSourceQuery(whereSql, filterParams) {
  return {
    sql: `SELECT t.id,
          t.business_id,
          b.region AS business_region,
          t.category_id,
          c.name AS category_name,
          c.tax_map_us,
          c.tax_map_ca,
          t.amount,
          t.type,
          t.note,
          t.date,
          t.tax_treatment,
          t.personal_use_pct,
          t.review_status,
          t.payer_name,
          t.tax_form_type,
          COALESCE(rc.receipt_count, 0)::int AS receipt_count
     FROM transactions t
     JOIN businesses b ON b.id = t.business_id
     LEFT JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN (
       SELECT transaction_id, COUNT(*)::int AS receipt_count
         FROM receipts
        WHERE business_id = ANY($1::uuid[])
        GROUP BY transaction_id
     ) rc ON rc.transaction_id = t.id
    WHERE ${whereSql}
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT 50000`,
    params: filterParams
  };
}

function buildFinalTransactionWhereClause(whereSql, filterParams, reviewFilter, reviewFilteredIds) {
  if (!reviewFilter) {
    return { whereSql, params: [...filterParams] };
  }

  if (reviewFilteredIds.length === 0) {
    return { whereSql: `${whereSql}\n         AND false`, params: [...filterParams] };
  }

  const params = [...filterParams, reviewFilteredIds];
  return {
    whereSql: `${whereSql}\n         AND t.id = ANY($${params.length}::uuid[])`,
    params
  };
}

function buildTransactionListQuery(finalWhereSql, finalFilterParams, limit, offset, joinClauseSql) {
  const params = [...finalFilterParams, limit, offset];
  const limitParamIdx = params.length - 1;
  const offsetParamIdx = params.length;

  return {
    sql: `SELECT t.id,
              t.business_id,
              b.name AS business_name,
              t.account_id,
              a.name AS account_name,
              t.category_id,
              c.name AS category_name,
              c.kind AS category_kind,
              c.color AS category_color,
              t.amount,
               b.region AS business_region,
               c.tax_map_us,
               c.tax_map_ca,
               COALESCE(rc.receipt_count, 0)::int AS receipt_count,
              t.type,
              t.cleared,
              t.description,
              t.description_encrypted,
              t.date,
              t.note,
              t.currency,
              t.source_amount,
              t.exchange_rate,
              t.exchange_date,
              t.converted_amount,
              t.tax_treatment,
              t.indirect_tax_amount,
              t.indirect_tax_recoverable,
              t.personal_use_pct,
              t.review_status,
              t.review_notes,
              t.payer_name,
              t.tax_form_type,
              t.recurring_transaction_id,
              t.recurring_occurrence_date,
              t.is_adjustment,
              t.original_transaction_id,
              t.created_at,
              t.receipt_status,
              t.receipt_missing_reason,
              t.business_purpose,
              t.supporting_evidence,
              t.receipt_status_confirmed_at,
              t.receipt_status_confirmed_by
       FROM transactions t
       JOIN businesses b ON b.id = t.business_id
       LEFT JOIN (
      SELECT transaction_id, COUNT(*)::int AS receipt_count
      FROM receipts
      WHERE business_id = ANY($1::uuid[])
      GROUP BY transaction_id
      ) rc ON rc.transaction_id = t.id
       ${joinClauseSql}
       WHERE ${finalWhereSql}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
    params
  };
}

function buildTransactionSummaryQuery(finalWhereSql, finalFilterParams, now = new Date()) {
  const currentMonthBounds = getTransactionPeriodBounds("this-month", now);
  const currentYearBounds = getTransactionPeriodBounds("ytd", now);
  const previousYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0)).toISOString().slice(0, 10);
  const previousYearEnd = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0)).toISOString().slice(0, 10);

  const params = [
    ...finalFilterParams,
    currentMonthBounds.start,
    currentMonthBounds.end,
    currentYearBounds.start,
    currentYearBounds.end,
    previousYearStart,
    previousYearEnd
  ];
  const monthStartParam = `$${finalFilterParams.length + 1}`;
  const monthEndParam = `$${finalFilterParams.length + 2}`;
  const currentYearStartParam = `$${finalFilterParams.length + 3}`;
  const currentYearEndParam = `$${finalFilterParams.length + 4}`;
  const previousYearStartParam = `$${finalFilterParams.length + 5}`;
  const previousYearEndParam = `$${finalFilterParams.length + 6}`;

  return {
    sql: `SELECT COUNT(*)::int AS transaction_count,
              COALESCE(SUM(CASE WHEN t.type = 'income' THEN ABS(t.amount) ELSE 0 END), 0)::numeric AS income_total,
              COALESCE(SUM(CASE WHEN t.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0)::numeric AS expense_total,
              COUNT(*) FILTER (
                WHERE t.date >= ${monthStartParam}
                  AND t.date < ${monthEndParam}
              )::int AS current_month_count,
              COALESCE(SUM(CASE
                WHEN t.type = 'income'
                 AND t.date >= ${currentYearStartParam}
                 AND t.date < ${currentYearEndParam}
                THEN ABS(t.amount)
                ELSE 0
              END), 0)::numeric AS current_year_income,
              COALESCE(SUM(CASE
                WHEN t.type = 'expense'
                 AND t.date >= ${currentYearStartParam}
                 AND t.date < ${currentYearEndParam}
                THEN ABS(t.amount)
                ELSE 0
              END), 0)::numeric AS current_year_expenses,
              COALESCE(SUM(CASE
                WHEN t.type = 'income'
                 AND t.date >= ${previousYearStartParam}
                 AND t.date < ${previousYearEndParam}
                THEN ABS(t.amount)
                ELSE 0
              END), 0)::numeric AS previous_year_income,
              COALESCE(SUM(CASE
                WHEN t.type = 'expense'
                 AND t.date >= ${previousYearStartParam}
                 AND t.date < ${previousYearEndParam}
                THEN ABS(t.amount)
                ELSE 0
              END), 0)::numeric AS previous_year_expenses
         FROM transactions t
         JOIN businesses b ON b.id = t.business_id
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE ${finalWhereSql}`,
    params
  };
}

module.exports = {
  getTransactionPeriodBounds,
  buildTransactionListFilters,
  buildTransactionListWhereClause,
  buildTransactionReviewSourceQuery,
  buildFinalTransactionWhereClause,
  buildTransactionListQuery,
  buildTransactionSummaryQuery
};
