"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildUsageEmailCopy, __private } = require("../services/usageLimitEmailService.js");

test("transaction 100% email uses the calm 'records are safe' copy", () => {
  const copy = buildUsageEmailCopy("transactions", 100, { used: 50, limit: 50 });
  assert.match(copy.body, /reached your 50 Basic transactions/);
  assert.match(copy.body, /Your records are safe/);
  assert.match(copy.body, /upgrade to Pro/);
});

test("transaction 70% email is a non-pushy heads-up", () => {
  const copy = buildUsageEmailCopy("transactions", 70, { used: 35, limit: 50 });
  assert.match(copy.body, /You've used 35 of your 50 Basic transactions/);
  assert.match(copy.body, /No action is needed yet/);
});

test("receipt 70% email explains uploads may pause at the cap", () => {
  const copy = buildUsageEmailCopy("receipts", 70, { used: 18, limit: 25 });
  assert.match(copy.body, /18 of your 25 Basic receipt uploads/);
  assert.match(copy.body, /receipt uploads may pause/);
});

test("receipt 100% email tells the user transactions still work", () => {
  const copy = buildUsageEmailCopy("receipts", 100, { used: 25, limit: 25 });
  assert.match(copy.body, /reached your Basic receipt limit/);
  assert.match(copy.body, /keep adding transactions/);
});

test("csv import 100% email points to manual entry or upgrade", () => {
  const copy = buildUsageEmailCopy("csvImportRows", 100, { used: 50, limit: 50 });
  assert.match(copy.body, /reached your Basic import limit/);
  assert.match(copy.body, /add transactions manually/);
});

test("usage email config exposes 70/90/100 thresholds for every resource", () => {
  assert.deepEqual(__private.THRESHOLDS, [70, 90, 100]);
  for (const resource of ["transactions", "receipts", "csvImportRows"]) {
    const cols = __private.RESOURCE_CONFIG[resource].columns;
    assert.ok(cols[70] && cols[90] && cols[100], `${resource} has all threshold columns`);
  }
});

test("claimThresholds is race-safe: claim succeeds once, then reports lost", async () => {
  let firstCall = true;
  const db = {
    async query() {
      // First caller wins (rowCount 1), second caller loses (rowCount 0).
      const won = firstCall;
      firstCall = false;
      return { rowCount: won ? 1 : 0, rows: won ? [{ id: "period-1" }] : [] };
    }
  };

  const first = await __private.claimThresholds(db, "period-1", "transactions", [70]);
  const second = await __private.claimThresholds(db, "period-1", "transactions", [70]);
  assert.equal(first, true);
  assert.equal(second, false);
});
