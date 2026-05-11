"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findDuplicateCandidates,
  normalizeDescription,
  __private: { addDays, normalizeSource }
} = require("../services/transactionImportService.js");

function makeFakePool(rows = []) {
  return {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      return { rows, rowCount: rows.length };
    }
  };
}

test("normalizeDescription strips punctuation and lowercases", () => {
  assert.equal(normalizeDescription("Uber Eats* 12345"), "uber eats 12345");
  assert.equal(normalizeDescription("  Stripe  Payout  "), "stripe payout");
  assert.equal(normalizeDescription(null), "");
});

test("addDays shifts ISO date forward and backward", () => {
  assert.equal(addDays("2026-05-10", 2), "2026-05-12");
  assert.equal(addDays("2026-05-10", -3), "2026-05-07");
});

test("normalizeSource defaults unknown values to csv", () => {
  assert.equal(normalizeSource("plaid"), "plaid");
  assert.equal(normalizeSource("Manual"), "manual");
  assert.equal(normalizeSource("weird"), "csv");
  assert.equal(normalizeSource(undefined), "csv");
});

test("findDuplicateCandidates returns rows whose normalized description shares tokens", async () => {
  const existing = [
    { id: "1", description: "STRIPE PAYOUT ABCD", date: "2026-05-09", amount: 100, type: "income" },
    { id: "2", description: "Random thing", date: "2026-05-10", amount: 100, type: "income" }
  ];
  const pool = makeFakePool(existing);

  const candidates = await findDuplicateCandidates(pool, {
    businessId: "biz",
    accountId: "acct",
    date: "2026-05-10",
    amount: 100,
    type: "income",
    description: "Stripe Payout ABCD-EF",
    dateWindowDays: 2
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "1");
});

test("findDuplicateCandidates returns empty when no candidates returned by query", async () => {
  const pool = makeFakePool([]);
  const candidates = await findDuplicateCandidates(pool, {
    businessId: "biz",
    accountId: "acct",
    date: "2026-05-10",
    amount: 50,
    type: "expense",
    description: "Whatever"
  });
  assert.equal(candidates.length, 0);
});

test("findDuplicateCandidates falls back to exact date match when description is empty", async () => {
  const existing = [
    { id: "x", description: "", date: "2026-05-10", amount: 10, type: "expense" }
  ];
  const pool = makeFakePool(existing);
  const candidates = await findDuplicateCandidates(pool, {
    businessId: "biz",
    accountId: "acct",
    date: "2026-05-10",
    amount: 10,
    type: "expense",
    description: ""
  });
  assert.equal(candidates.length, 1);
});
