"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const SERVICE_PATH = require.resolve("../services/basicPlanUsageService.js");

function loadService(subscription = { effectiveTier: "free" }) {
  const originalLoad = Module._load.bind(Module);

  Module._load = function(requestName, parent, isMain) {
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

test("assertCanCreateTransactions blocks Basic businesses after 50 created transactions in the current month", async () => {
  const service = loadService({ effectiveTier: "free" });
  const db = {
    async query() {
      return { rows: [{ count: 50 }], rowCount: 1 };
    }
  };

  await assert.rejects(
    service.assertCanCreateTransactions(db, "biz_1", 1, { now: new Date("2026-04-25T12:00:00Z") }),
    (error) => {
      assert.equal(error.name, "BasicPlanLimitError");
      assert.equal(error.code, "basic_transaction_limit_reached");
      assert.equal(error.details.limit, 50);
      assert.equal(error.details.used, 50);
      return true;
    }
  );
});

test("assertCanCreateTransactions does not enforce the monthly cap for Pro businesses", async () => {
  const service = loadService({ effectiveTier: "v1" });
  let queryCount = 0;
  const db = {
    async query() {
      queryCount += 1;
      return { rows: [{ count: 999 }], rowCount: 1 };
    }
  };

  const result = await service.assertCanCreateTransactions(db, "biz_1", 25, { now: new Date("2026-04-25T12:00:00Z") });
  assert.equal(result.enforced, false);
  assert.equal(queryCount, 0);
});
