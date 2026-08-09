"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  TRANSACTION_REVIEW_STATUSES,
  isTransactionReviewStatus,
  transactionReviewStatusList
} = require("../config/transactionReviewStatus.js");

const apiRoot = path.join(__dirname, "..");
const migrationPath = path.join(
  apiRoot,
  "db",
  "migrations",
  "20260809_add_transaction_review_status_check.sql"
);

test("transaction review status config accepts only supported app states", () => {
  assert.deepEqual(TRANSACTION_REVIEW_STATUSES, ["needs_review", "ready", "matched", "locked"]);
  assert.equal(isTransactionReviewStatus("ready"), true);
  assert.equal(isTransactionReviewStatus(" Ready "), true);
  assert.equal(isTransactionReviewStatus("archived"), false);
  assert.equal(transactionReviewStatusList(), "needs_review, ready, matched, locked");
});

test("transaction review status migration enforces the shared status set for new writes", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  assert.match(sql, /chk_transactions_review_status/);
  assert.match(sql, /NOT VALID/i);
  for (const status of TRANSACTION_REVIEW_STATUSES) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
});

test("transactions route uses shared review status config instead of a route-local enum", () => {
  const source = fs.readFileSync(path.join(apiRoot, "routes", "transactions.routes.js"), "utf8");

  assert.match(source, /transactionReviewStatusList/);
  assert.match(source, /isTransactionReviewStatus/);
  assert.doesNotMatch(source, /VALID_REVIEW_STATUSES\s*=\s*new Set/);
});
