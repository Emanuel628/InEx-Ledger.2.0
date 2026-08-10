"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getTransactionPeriodBounds,
  buildTransactionListFilters,
  buildTransactionListWhereClause,
  buildTransactionReviewSourceQuery,
  buildFinalTransactionWhereClause,
  buildTransactionListQuery,
  buildTransactionSummaryQuery
} = require("../services/transactionListQueryService.js");

const NOW = new Date("2026-06-15T12:00:00.000Z");

test("getTransactionPeriodBounds returns this-month/last-month/ytd bounds in UTC", () => {
  assert.deepEqual(getTransactionPeriodBounds("this-month", NOW), { start: "2026-06-01", end: "2026-07-01" });
  assert.deepEqual(getTransactionPeriodBounds("last-month", NOW), { start: "2026-05-01", end: "2026-06-01" });
  assert.deepEqual(getTransactionPeriodBounds("ytd", NOW), { start: "2026-01-01", end: "2027-01-01" });
  assert.equal(getTransactionPeriodBounds("all", NOW), null);
});

test("buildTransactionListFilters defaults limit to 100 and offset to 0", () => {
  const filters = buildTransactionListFilters({}, NOW);
  assert.equal(filters.valid, true);
  assert.equal(filters.limit, 100);
  assert.equal(filters.offset, 0);
  assert.equal(filters.wantsAll, false);
  assert.equal(filters.period, "all");
});

test("buildTransactionListFilters caps an explicit huge limit at 5000", () => {
  const filters = buildTransactionListFilters({ limit: "999999" }, NOW);
  assert.equal(filters.limit, 5000);
});

test("buildTransactionListFilters bumps limit to the hard cap when all=true", () => {
  const filters = buildTransactionListFilters({ all: "true" }, NOW);
  assert.equal(filters.wantsAll, true);
  assert.equal(filters.limit, 50000);
});

test("buildTransactionListFilters rejects an invalid account_id/category_id", () => {
  assert.equal(buildTransactionListFilters({ account_id: "not-a-uuid" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ category_id: "not-a-uuid" }, NOW).valid, false);
});

test("buildTransactionListFilters rejects an invalid type/period/date/v3_status/review_status", () => {
  assert.equal(buildTransactionListFilters({ type: "refund" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ period: "last-quarter" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ start_date: "06/15/2026" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ start_date: "2026-06-15", end_date: "2026-01-01" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ v3_status: "archived" }, NOW).valid, false);
  assert.equal(buildTransactionListFilters({ review_status: "not_a_status" }, NOW).valid, false);
});

test("buildTransactionListFilters resolves periodBounds from the period filter", () => {
  const filters = buildTransactionListFilters({ period: "ytd" }, NOW);
  assert.deepEqual(filters.periodBounds, { start: "2026-01-01", end: "2027-01-01" });
});

test("buildTransactionListWhereClause always scopes to business and excludes deleted/void/adjustment rows", () => {
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], buildTransactionListFilters({}, NOW));
  assert.match(whereSql, /t\.business_id = ANY\(\$1::uuid\[\]\)/);
  assert.match(whereSql, /t\.deleted_at IS NULL/);
  assert.match(whereSql, /is_adjustment = false/);
  assert.match(whereSql, /is_void = false/);
  assert.deepEqual(params, [["biz-1"]]);
});

test("buildTransactionListWhereClause prefers account_id/category_id over the name filters when both are present", () => {
  const filters = buildTransactionListFilters({
    account_id: "11111111-1111-4111-8111-111111111111",
    account_name: "Checking",
    category_id: "22222222-2222-4222-8222-222222222222",
    category_name: "Meals"
  }, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  assert.match(whereSql, /t\.account_id = \$2::uuid/);
  assert.match(whereSql, /t\.category_id = \$3::uuid/);
  assert.doesNotMatch(whereSql, /a\.name/);
  assert.doesNotMatch(whereSql, /c\.name/);
  assert.deepEqual(params, [["biz-1"], "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
});

test("buildTransactionListWhereClause falls back to name filters when no id filter is given", () => {
  const filters = buildTransactionListFilters({ account_name: "Checking", category_name: "Meals" }, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  assert.match(whereSql, /LOWER\(COALESCE\(a\.name, ''\)\) = LOWER\(\$2\)/);
  assert.match(whereSql, /LOWER\(COALESCE\(c\.name, ''\)\) = LOWER\(\$3\)/);
  assert.deepEqual(params, [["biz-1"], "Checking", "Meals"]);
});

test("buildTransactionListWhereClause threads v3Status cleared/draft into distinct clauses", () => {
  const cleared = buildTransactionListWhereClause(["biz-1"], buildTransactionListFilters({ v3_status: "cleared" }, NOW));
  assert.match(cleared.whereSql, /t\.cleared = true/);

  const draft = buildTransactionListWhereClause(["biz-1"], buildTransactionListFilters({ v3_status: "draft" }, NOW));
  assert.match(draft.whereSql, /COALESCE\(t\.cleared, false\) = false/);
  assert.match(draft.whereSql, /t\.review_status IS NULL OR t\.review_status NOT IN \('needs_review'\)/);
});

test("buildTransactionListWhereClause search clause covers description, notes, and joined account/category/business names", () => {
  const filters = buildTransactionListFilters({ search: "office" }, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  assert.match(whereSql, /COALESCE\(t\.description, ''\) ILIKE \$2/);
  assert.match(whereSql, /COALESCE\(a\.name, ''\) ILIKE \$2/);
  assert.match(whereSql, /COALESCE\(c\.name, ''\) ILIKE \$2/);
  assert.match(whereSql, /COALESCE\(b\.name, ''\) ILIKE \$2/);
  assert.equal(params[1], "%office%");
});

test("buildTransactionListWhereClause threads period bounds as two date-comparison params", () => {
  const filters = buildTransactionListFilters({ period: "ytd" }, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  assert.match(whereSql, /t\.date >= \$2/);
  assert.match(whereSql, /t\.date < \$3/);
  assert.deepEqual(params.slice(1), ["2026-01-01", "2027-01-01"]);
});

test("buildTransactionReviewSourceQuery reuses the where clause params unmodified and caps at 50000 rows", () => {
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], buildTransactionListFilters({}, NOW));
  const query = buildTransactionReviewSourceQuery(whereSql, params);
  assert.match(query.sql, /WHERE t\.business_id = ANY\(\$1::uuid\[\]\)/);
  assert.match(query.sql, /LIMIT 50000/);
  assert.match(query.sql, /LEFT JOIN \(\s*SELECT transaction_id, COUNT\(\*\)::int AS receipt_count/);
  assert.deepEqual(query.params, params);
});

test("buildFinalTransactionWhereClause passes the where clause through unchanged when no review filter is active", () => {
  const filters = buildTransactionListFilters({}, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  const result = buildFinalTransactionWhereClause(whereSql, params, filters.review, []);
  assert.equal(result.whereSql, whereSql);
  assert.deepEqual(result.params, params);
});

test("buildFinalTransactionWhereClause forces an empty result set when the review filter matches nothing", () => {
  const filters = buildTransactionListFilters({}, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  const result = buildFinalTransactionWhereClause(whereSql, params, "needs_review", []);
  assert.match(result.whereSql, /AND false$/);
  assert.deepEqual(result.params, params);
});

test("buildFinalTransactionWhereClause appends the review-filtered id list as the last param", () => {
  const filters = buildTransactionListFilters({}, NOW);
  const { whereSql, params } = buildTransactionListWhereClause(["biz-1"], filters);
  const result = buildFinalTransactionWhereClause(whereSql, params, "needs_review", ["txn-1", "txn-2"]);
  assert.match(result.whereSql, /AND t\.id = ANY\(\$2::uuid\[\]\)$/);
  assert.deepEqual(result.params, [["biz-1"], ["txn-1", "txn-2"]]);
});

test("buildTransactionListQuery appends limit/offset as the final two params and inlines the given join clause", () => {
  const query = buildTransactionListQuery("t.business_id = ANY($1::uuid[])", [["biz-1"]], 25, 50, "LEFT JOIN accounts a ON a.id = t.account_id");
  assert.match(query.sql, /LEFT JOIN accounts a ON a\.id = t\.account_id/);
  assert.match(query.sql, /LIMIT \$2 OFFSET \$3/);
  assert.deepEqual(query.params, [["biz-1"], 25, 50]);
});

test("buildTransactionSummaryQuery derives month/current-year/previous-year bounds from the given date and threads six trailing params", () => {
  const query = buildTransactionSummaryQuery("t.business_id = ANY($1::uuid[])", [["biz-1"]], NOW);
  assert.match(query.sql, /t\.date >= \$2\s+AND t\.date < \$3/);
  assert.match(query.sql, /t\.date >= \$4/);
  assert.match(query.sql, /t\.date >= \$6/);
  assert.deepEqual(query.params, [
    ["biz-1"],
    "2026-06-01", "2026-07-01",
    "2026-01-01", "2027-01-01",
    "2025-01-01", "2026-01-01"
  ]);
});
