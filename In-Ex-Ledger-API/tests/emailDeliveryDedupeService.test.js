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

// A stateful fake that actually implements the same conflict-resolution
// semantics the real SQL expresses (status transitions + an updated_at
// clock the test can advance), rather than just returning a fixed rowCount.
// This is what lets these tests prove the *behavior* -- reclaim after a
// timeout, never before it, never for 'sent' rows -- instead of only
// asserting on the query text.
function makeStatefulDb() {
  const rows = new Map();
  let clockMs = Date.now();
  return {
    advanceMinutes(minutes) {
      clockMs += minutes * 60 * 1000;
    },
    async query(sql, params) {
      if (/INSERT INTO email_delivery_dedupe/i.test(sql)) {
        const [dedupeKey, , , , , staleMinutes] = params;
        const existing = rows.get(dedupeKey);
        if (!existing) {
          rows.set(dedupeKey, { status: "reserved", updatedAt: clockMs });
          return { rowCount: 1, rows: [{ dedupe_key: dedupeKey }] };
        }
        const staleMs = Number(staleMinutes) * 60 * 1000;
        const isStaleReservation =
          existing.status === "reserved" && clockMs - existing.updatedAt > staleMs;
        if (existing.status === "failed" || isStaleReservation) {
          rows.set(dedupeKey, { status: "reserved", updatedAt: clockMs });
          return { rowCount: 1, rows: [{ dedupe_key: dedupeKey }] };
        }
        return { rowCount: 0, rows: [] };
      }
      if (/SET status = 'sent'/i.test(sql)) {
        const [dedupeKey] = params;
        rows.set(dedupeKey, { status: "sent", updatedAt: clockMs });
        return { rowCount: 1, rows: [] };
      }
      if (/SET status = 'failed'/i.test(sql)) {
        const [dedupeKey] = params;
        rows.set(dedupeKey, { status: "failed", updatedAt: clockMs });
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
}

test("reserveEmailDelivery passes a stale-reservation timeout parameter to the query", async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1, rows: [{ dedupe_key: params[0] }] };
    },
  };

  await reserveEmailDelivery(db, {
    dedupeKey: "export-generated:biz-1:abc",
    category: "export.generated",
  });

  assert.match(
    queries[0].sql,
    /email_delivery_dedupe\.status = 'reserved'[\s\S]*email_delivery_dedupe\.updated_at < NOW\(\)/i,
    "the reservation query should also reclaim stale 'reserved' rows, not just 'failed' ones",
  );
  assert.equal(typeof queries[0].params[5], "number", "a numeric stale-timeout parameter should be bound");
  assert.ok(queries[0].params[5] > 0);
});

test("a reservation stuck in 'reserved' past the timeout is reclaimed", async () => {
  const db = makeStatefulDb();
  const key = "export-generated:biz-1:stuck";

  const firstReservation = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(firstReservation, true, "the first reservation should succeed");
  // Simulate the process dying here -- no markEmailDeliverySent/Failed call.

  db.advanceMinutes(16);

  const reclaimed = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(reclaimed, true, "a reservation abandoned well past the timeout should be reclaimable");
});

test("a fresh reservation is not stolen before the timeout elapses", async () => {
  const db = makeStatefulDb();
  const key = "export-generated:biz-1:fresh";

  const firstReservation = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(firstReservation, true);

  db.advanceMinutes(5);

  const secondAttempt = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(
    secondAttempt,
    false,
    "a reservation still well inside the timeout window must not be stolen by a concurrent/duplicate attempt",
  );
});

test("a sent delivery stays protected from reclaim indefinitely", async () => {
  const db = makeStatefulDb();
  const key = "export-generated:biz-1:sent";

  const firstReservation = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(firstReservation, true);
  await markEmailDeliverySent(db, key, "email-provider-id");

  db.advanceMinutes(60 * 24 * 30); // 30 days -- far past any reasonable timeout

  const laterAttempt = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(laterAttempt, false, "a sent email must never be reclaimed and resent, no matter how old");
});

test("a failed delivery stays immediately retryable, independent of the stale-reservation timeout", async () => {
  const db = makeStatefulDb();
  const key = "export-generated:biz-1:failed";

  await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  await markEmailDeliveryFailed(db, key, new Error("provider rejected"));

  // No time advance at all -- failed rows are retryable right away, unlike
  // stale 'reserved' rows which must wait out the timeout.
  const retried = await reserveEmailDelivery(db, { dedupeKey: key, category: "export.generated" });
  assert.equal(retried, true);
});
