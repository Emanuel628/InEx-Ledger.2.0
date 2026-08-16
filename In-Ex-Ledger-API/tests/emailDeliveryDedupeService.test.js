"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEmailDedupeKey,
  reserveEmailDelivery,
  markEmailDeliverySent,
  markEmailDeliveryFailed,
} = require("../services/emailDeliveryDedupeService.js");

test("buildEmailDedupeKey is deterministic and scoped", () => {
  const first = buildEmailDedupeKey("billing-lifecycle", "biz-1", [
    "charged",
    "invoice-1",
  ]);
  const second = buildEmailDedupeKey("billing-lifecycle", "biz-1", [
    "charged",
    "invoice-1",
  ]);
  const different = buildEmailDedupeKey("billing-lifecycle", "biz-1", [
    "charged",
    "invoice-2",
  ]);

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.match(first, /^billing-lifecycle:biz-1:[a-f0-9]{40}$/);
});

test("reserveEmailDelivery inserts with retryable failed-conflict semantics", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ dedupe_key: params[0] }] };
    },
  };

  const reserved = await reserveEmailDelivery(db, {
    dedupeKey: "billing-lifecycle:biz-1:abc",
    category: "billing.lifecycle",
    businessId: "00000000-0000-4000-8000-000000000001",
    recipientEmail: "owner@example.com",
    metadata: { kind: "charged" },
  });

  assert.equal(reserved, true);
  assert.match(queries[0].sql, /INSERT INTO email_delivery_dedupe/i);
  assert.match(queries[0].sql, /ON CONFLICT \(dedupe_key\) DO UPDATE/i);
  assert.match(queries[0].sql, /WHERE email_delivery_dedupe\.status = 'failed'/i);
  assert.deepEqual(queries[0].params.slice(0, 4), [
    "billing-lifecycle:biz-1:abc",
    "billing.lifecycle",
    "00000000-0000-4000-8000-000000000001",
    "owner@example.com",
  ]);
  assert.equal(queries[0].params[4], JSON.stringify({ kind: "charged" }));
});

test("reserveEmailDelivery returns false when an existing delivery is not retryable", async () => {
  const db = {
    async query() {
      return { rowCount: 0, rows: [] };
    },
  };

  const reserved = await reserveEmailDelivery(db, {
    dedupeKey: "billing-lifecycle:biz-1:abc",
    category: "billing.lifecycle",
  });

  assert.equal(reserved, false);
});

test("delivery completion helpers persist sent and failed states", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };

  await markEmailDeliverySent(db, "dedupe-1", "email-1");
  await markEmailDeliveryFailed(db, "dedupe-2", new Error("send failed"));

  assert.match(queries[0].sql, /SET status = 'sent'/i);
  assert.deepEqual(queries[0].params, ["dedupe-1", "email-1"]);
  assert.match(queries[1].sql, /SET status = 'failed'/i);
  assert.deepEqual(queries[1].params, ["dedupe-2", "send failed"]);
});
