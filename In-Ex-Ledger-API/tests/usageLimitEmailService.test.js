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

test("claimThresholds updates only configured columns and guards on the highest crossed threshold", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ id: "period-1" }] };
    }
  };

  const won = await __private.claimThresholds(db, "period-1", "receipts", [70, 90]);

  assert.equal(won, true);
  assert.deepEqual(queries[0].params, ["period-1"]);
  assert.match(queries[0].sql, /SET receipt_email_70_sent_at = now\(\), receipt_email_90_sent_at = now\(\), updated_at = now\(\)/);
  assert.match(queries[0].sql, /WHERE id = \$1 AND receipt_email_90_sent_at IS NULL/);
  assert.doesNotMatch(queries[0].sql, /receipt_email_100_sent_at = now\(\)/);
  assert.doesNotMatch(queries[0].sql, /transaction_email_/);
  assert.doesNotMatch(queries[0].sql, /csv_import_email_/);
});

test("evaluateResource claims all newly crossed thresholds but sends copy for the highest one", async () => {
  const queries = [];
  const sent = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ id: "period-1" }] };
    }
  };
  const resendClient = {
    emails: {
      async send(message) {
        sent.push(message);
        return { data: { id: "email-1" } };
      }
    }
  };

  await __private.evaluateResource(db, resendClient, {
    businessId: "biz-1",
    resource: "transactions",
    metric: { used: 46, limit: 50 },
    period: {
      id: "period-1",
      transaction_email_70_sent_at: null,
      transaction_email_90_sent_at: null,
      transaction_email_100_sent_at: null
    },
    recipient: { email: "owner@example.com", businessName: "Ledger Co", userId: "user-1" }
  });

  assert.equal(sent.length, 1);
  assert.match(queries[0].sql, /SET transaction_email_70_sent_at = now\(\), transaction_email_90_sent_at = now\(\), updated_at = now\(\)/);
  assert.match(queries[0].sql, /WHERE id = \$1 AND transaction_email_90_sent_at IS NULL/);
  assert.doesNotMatch(queries[0].sql, /transaction_email_100_sent_at = now\(\)/);
  assert.match(sent[0].subject, /heads-up/i);
  assert.match(sent[0].text, /You've used 46 of your 50 Basic transactions/);
  assert.doesNotMatch(sent[0].text, /reached your 50 Basic transactions/);
});
