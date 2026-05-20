"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const SERVICE_PATH = require.resolve("../services/basicPlanUsageService.js");

function loadService(subscription = { effectiveTier: "free" }) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function (requestName, parent, isMain) {
    if (requestName === "./subscriptionService.js" || /subscriptionService\.js$/.test(requestName)) {
      return {
        getSubscriptionSnapshotForBusiness: async () => subscription
      };
    }
    return originalLoad(requestName, parent, isMain);
  };

  delete require.cache[SERVICE_PATH];
  try {
    return require("../services/basicPlanUsageService.js");
  } finally {
    Module._load = originalLoad;
  }
}

/**
 * Builds a db stub whose query() routes by SQL content. `handlers` is an
 * ordered list of [substring, response] pairs.
 */
function makeDb(handlers) {
  return {
    calls: 0,
    async query(sql) {
      this.calls += 1;
      for (const [match, response] of handlers) {
        if (sql.includes(match)) {
          return typeof response === "function" ? response() : response;
        }
      }
      throw new Error(`Unexpected query: ${String(sql).slice(0, 80)}`);
    }
  };
}

const PERIOD_ROW = (overrides = {}) => ({
  id: "period-1",
  business_id: "biz_1",
  receipts_used: 0,
  ...overrides
});

// ── Receipt cap ─────────────────────────────────────────────────────────────

test("assertCanUploadReceipts blocks Basic businesses at 25 receipts in a month", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = makeDb([
    ["business_usage_periods", { rows: [PERIOD_ROW({ receipts_used: 25 })], rowCount: 1 }]
  ]);

  await assert.rejects(
    service.assertCanUploadReceipts(db, "biz_1", 1, {}),
    (error) => {
      assert.equal(error.name, "BasicPlanLimitError");
      assert.equal(error.code, "basic_receipt_limit_reached");
      assert.equal(error.statusCode, 402);
      assert.equal(error.details.limit, 25);
      assert.equal(error.details.used, 25);
      return true;
    }
  );
});

test("assertCanUploadReceipts allows a Basic business that is under the cap", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = makeDb([
    ["business_usage_periods", { rows: [PERIOD_ROW({ receipts_used: 10 })], rowCount: 1 }]
  ]);

  const state = await service.assertCanUploadReceipts(db, "biz_1", 1, {});
  assert.equal(state.enforced, true);
  assert.equal(state.used, 10);
  assert.equal(state.remaining, 15);
});

test("assertCanUploadReceipts does not enforce or query for Pro businesses", async () => {
  const service = loadService({ effectiveTier: "v1" });
  const db = makeDb([]);

  const state = await service.assertCanUploadReceipts(db, "biz_1", 1, {});
  assert.equal(state.enforced, false);
  assert.equal(db.calls, 0);
});

// ── CSV import cap ──────────────────────────────────────────────────────────

test("assertCanImportCsvRows blocks when valid rows exceed remaining transaction slots", async () => {
  const service = loadService({ effectiveTier: "free" });
  // 20 transactions already used this month -> 30 slots remain; 0 CSV rows used.
  const db = makeDb([
    ["import_source", { rows: [{ count: 0 }], rowCount: 1 }],
    ["transactions", { rows: [{ count: 20 }], rowCount: 1 }]
  ]);

  await assert.rejects(
    service.assertCanImportCsvRows(db, "biz_1", 82, {}),
    (error) => {
      assert.equal(error.name, "BasicPlanLimitError");
      assert.equal(error.code, "basic_csv_import_limit_exceeded");
      assert.equal(error.details.csv_valid_rows, 82);
      assert.equal(error.details.transaction_slots_remaining, 30);
      assert.equal(error.details.csv_import_rows_remaining, 50);
      return true;
    }
  );
});

test("assertCanImportCsvRows allows an import that fits the remaining allowance", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = makeDb([
    ["import_source", { rows: [{ count: 0 }], rowCount: 1 }],
    ["transactions", { rows: [{ count: 0 }], rowCount: 1 }]
  ]);

  const state = await service.assertCanImportCsvRows(db, "biz_1", 30, {});
  assert.equal(state.enforced, true);
  assert.equal(state.transactionSlotsRemaining, 50);
  assert.equal(state.csvImportRowsRemaining, 50);
});

test("assertCanImportCsvRows does not enforce or query for Pro businesses", async () => {
  const service = loadService({ effectiveTier: "v1" });
  const db = makeDb([]);

  const state = await service.assertCanImportCsvRows(db, "biz_1", 5000, {});
  assert.equal(state.enforced, false);
  assert.equal(db.calls, 0);
});

// ── Usage summary ───────────────────────────────────────────────────────────

test("getUsageSummary reports all three metered resources for a Basic business", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = makeDb([
    ["business_usage_periods", { rows: [PERIOD_ROW({ receipts_used: 5 })], rowCount: 1 }],
    ["import_source", { rows: [{ count: 3 }], rowCount: 1 }],
    ["transactions", { rows: [{ count: 10 }], rowCount: 1 }]
  ]);

  const summary = await service.getUsageSummary(db, "biz_1", {});
  assert.equal(summary.enforced, true);
  assert.equal(summary.transactions.limit, 50);
  assert.equal(summary.transactions.used, 10);
  assert.equal(summary.transactions.remaining, 40);
  assert.equal(summary.receipts.limit, 25);
  assert.equal(summary.receipts.used, 5);
  assert.equal(summary.receipts.remaining, 20);
  assert.equal(summary.csvImportRows.limit, 50);
  assert.equal(summary.csvImportRows.used, 3);
  assert.equal(summary.csvImportRows.remaining, 47);
});

test("assertCanCreateTransactions still blocks Basic at the 50-transaction cap", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = makeDb([
    ["transactions", { rows: [{ count: 50 }], rowCount: 1 }]
  ]);

  await assert.rejects(
    service.assertCanCreateTransactions(db, "biz_1", 1, {}),
    (error) => {
      assert.equal(error.code, "basic_transaction_limit_reached");
      assert.equal(error.details.limit, 50);
      assert.equal(error.details.used, 50);
      return true;
    }
  );
});
