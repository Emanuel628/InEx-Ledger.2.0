"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordAuditEventForRequest,
  extractRequestContext,
  listAuditEventsForUser,
  __private: { truncate, MAX_ACTION_LEN }
} = require("../services/auditEventService.js");

function makePool(rowsByCall = [], opts = {}) {
  let i = 0;
  return {
    queries: [],
    async query(sql, params) {
      this.queries.push({ sql, params });
      if (opts.throwOn === i) throw new Error("simulated db failure");
      const rows = Array.isArray(rowsByCall) ? (rowsByCall[i++] || []) : rowsByCall;
      return { rows, rowCount: rows.length };
    }
  };
}

test("truncate caps long strings to the given max", () => {
  assert.equal(truncate("hello", 3), "hel");
  assert.equal(truncate("hi", 10), "hi");
  assert.equal(truncate(null, 10), null);
});

test("extractRequestContext pulls x-forwarded-for and user-agent", () => {
  const req = {
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "MyClient/1.0" },
    ip: "9.9.9.9"
  };
  const ctx = extractRequestContext(req);
  assert.equal(ctx.ipAddress, "1.2.3.4");
  assert.equal(ctx.userAgent, "MyClient/1.0");
});

test("recordAuditEvent inserts and returns id on success", async () => {
  const pool = makePool([[]]);
  const id = await recordAuditEvent(pool, {
    userId: "u1",
    businessId: "b1",
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    metadata: { foo: "bar" }
  });
  assert.ok(id, "should return an id");
  assert.equal(pool.queries.length, 1);
  assert.ok(pool.queries[0].sql.includes("INSERT INTO audit_events"));
  assert.equal(pool.queries[0].params[1], "u1");
  assert.equal(pool.queries[0].params[2], "b1");
  assert.equal(pool.queries[0].params[3], "auth.login.success");
});

test("recordAuditEvent returns null when action is empty (no insert)", async () => {
  const pool = makePool([[]]);
  const id = await recordAuditEvent(pool, { action: "" });
  assert.equal(id, null);
  assert.equal(pool.queries.length, 0);
});

test("recordAuditEvent never throws on db failure", async () => {
  const pool = makePool([], { throwOn: 0 });
  const id = await recordAuditEvent(pool, {
    userId: "u",
    action: AUDIT_ACTIONS.LOGIN_SUCCESS
  });
  assert.equal(id, null);
});

test("recordAuditEvent truncates extremely long action strings", async () => {
  const pool = makePool([[]]);
  await recordAuditEvent(pool, { action: "x".repeat(MAX_ACTION_LEN + 10) });
  assert.equal(pool.queries[0].params[3].length, MAX_ACTION_LEN);
});

test("recordAuditEventForRequest uses req user/ip/ua when not overridden", async () => {
  const pool = makePool([[]]);
  const req = {
    user: { id: "user-from-req" },
    headers: { "user-agent": "UA", "x-forwarded-for": "10.0.0.1" }
  };
  await recordAuditEventForRequest(pool, req, { action: AUDIT_ACTIONS.LOGIN_SUCCESS });
  assert.equal(pool.queries[0].params[1], "user-from-req");
  assert.equal(pool.queries[0].params[4], "10.0.0.1");
  assert.equal(pool.queries[0].params[5], "UA");
});

test("listAuditEventsForUser clamps oversized limits and floors negatives at 1", async () => {
  const pool = makePool([[], []]);
  await listAuditEventsForUser(pool, "u1", { limit: 99999 });
  assert.equal(pool.queries[0].params[1], 200);
  await listAuditEventsForUser(pool, "u1", { limit: -5 });
  assert.equal(pool.queries[1].params[1], 1);
});

test("listAuditEventsForUser uses default 50 when limit is missing", async () => {
  const pool = makePool([[]]);
  await listAuditEventsForUser(pool, "u1");
  assert.equal(pool.queries[0].params[1], 50);
});
