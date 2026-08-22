"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findDuplicateCandidates,
  revertImportBatch,
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

function makeTransactionalPool({ failOnImportUpdate = false, lockedCount = 0 } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT COUNT\(\*\)::int AS n/.test(sql)) {
        return { rows: [{ n: lockedCount }], rowCount: 1 };
      }
      if (/UPDATE transactions/.test(sql)) {
        return { rows: [{ id: "tx-1" }, { id: "tx-2" }], rowCount: 2 };
      }
      if (/UPDATE transaction_imports/.test(sql)) {
        if (failOnImportUpdate) throw new Error("import update failed");
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    releaseCalled: false,
    release() {
      this.releaseCalled = true;
    }
  };

  return {
    calls,
    client,
    async connect() {
      calls.push({ sql: "CONNECT" });
      return client;
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

test("revertImportBatch updates transactions and import row in one transaction", async () => {
  const pool = makeTransactionalPool();

  const result = await revertImportBatch(pool, {
    businessId: "biz-1",
    batchId: "batch-1",
    userId: "user-1"
  });

  assert.deepEqual(result, { revertedCount: 2 });
  assert.deepEqual(
    pool.calls.map((call) => call.sql === "CONNECT" ? "CONNECT" : call.sql.trim().split(/\s+/).slice(0, 2).join(" ")),
    ["CONNECT", "BEGIN", "UPDATE transactions", "UPDATE transaction_imports", "COMMIT"]
  );
  assert.equal(pool.client.releaseCalled, true);
});

test("revertImportBatch rolls back when the import-row update fails", async () => {
  const pool = makeTransactionalPool({ failOnImportUpdate: true });

  await assert.rejects(
    () => revertImportBatch(pool, {
      businessId: "biz-1",
      batchId: "batch-1",
      userId: "user-1"
    }),
    /import update failed/
  );

  assert.deepEqual(
    pool.calls.map((call) => call.sql === "CONNECT" ? "CONNECT" : call.sql.trim().split(/\s+/).slice(0, 2).join(" ")),
    ["CONNECT", "BEGIN", "UPDATE transactions", "UPDATE transaction_imports", "ROLLBACK"]
  );
  assert.equal(pool.client.releaseCalled, true);
});
