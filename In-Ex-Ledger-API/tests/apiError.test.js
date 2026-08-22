"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ApiError, asyncRoute } = require("../utils/apiError.js");

test("ApiError carries a status, message, and optional code", () => {
  const err = new ApiError(404, "Business not found.");
  assert.equal(err.status, 404);
  assert.equal(err.message, "Business not found.");
  assert.equal(err.name, "ApiError");
  assert.equal(err.code, undefined);
  assert.ok(err instanceof Error);

  const withCode = new ApiError(409, "Conflict.", { code: "some_conflict" });
  assert.equal(withCode.code, "some_conflict");
});

test("ApiError carries optional public response fields", () => {
  const err = new ApiError(409, "Locked.", {
    code: "accounting_period_locked",
    responseFields: { code: "accounting_period_locked", locked_through_date: "2026-08-01" }
  });

  assert.deepEqual(err.responseFields, {
    code: "accounting_period_locked",
    locked_through_date: "2026-08-01"
  });
});

test("ApiError can explicitly expose a public 500 fallback message", () => {
  const err = new ApiError(500, "Failed to start checkout.", { expose: true });

  assert.equal(err.expose, true);
});

test("asyncRoute forwards a resolved handler's result without calling next", async () => {
  let nextCalled = false;
  const handler = asyncRoute(async (req, res) => {
    res.json({ ok: true });
  });

  const res = { json: (body) => { res.body = body; } };
  await handler({}, res, () => { nextCalled = true; });

  assert.deepEqual(res.body, { ok: true });
  assert.equal(nextCalled, false);
});

test("asyncRoute forwards a thrown ApiError to next()", async () => {
  const thrown = new ApiError(400, "Bad input.");
  const handler = asyncRoute(async () => {
    throw thrown;
  });

  let forwarded = null;
  await handler({}, {}, (err) => { forwarded = err; });

  assert.equal(forwarded, thrown);
});

test("asyncRoute forwards a rejected promise to next()", async () => {
  const handler = asyncRoute(async () => {
    await Promise.reject(new Error("boom"));
  });

  let forwarded = null;
  await handler({}, {}, (err) => { forwarded = err; });

  assert.equal(forwarded.message, "boom");
});

test("asyncRoute forwards a synchronous throw to next()", async () => {
  const handler = asyncRoute((req, res, next) => {
    throw new Error("sync boom");
  });

  let forwarded = null;
  await handler({}, {}, (err) => { forwarded = err; });

  assert.equal(forwarded.message, "sync boom");
});

// Express resets req.params as an error bubbles up past the route-specific
// layer that matched it, so a central app-level error handler can't read
// req.params directly -- it's always {} by the time that handler runs.
// asyncRoute snapshots params onto the error itself, while req.params still
// reflects the route that threw, so the central handler can log them later.
test("asyncRoute snapshots non-empty req.params onto a thrown error as routeParams", async () => {
  const thrown = new Error("not found");
  const handler = asyncRoute(async () => {
    throw thrown;
  });

  let forwarded = null;
  await handler({ params: { id: "abc123" } }, {}, (err) => { forwarded = err; });

  assert.deepEqual(forwarded.routeParams, { id: "abc123" });
});

test("asyncRoute does not attach routeParams when the route has none", async () => {
  const handler = asyncRoute(async () => {
    throw new Error("boom");
  });

  let forwarded = null;
  await handler({ params: {} }, {}, (err) => { forwarded = err; });

  assert.equal("routeParams" in forwarded, false);
});

test("asyncRoute snapshots params for a rejected promise too, not just a thrown error", async () => {
  const handler = asyncRoute(async () => {
    await Promise.reject(new Error("boom"));
  });

  let forwarded = null;
  await handler({ params: { businessId: "biz_1" } }, {}, (err) => { forwarded = err; });

  assert.deepEqual(forwarded.routeParams, { businessId: "biz_1" });
});

test("asyncRoute does not overwrite routeParams already set on the error", async () => {
  const thrown = Object.assign(new Error("boom"), { routeParams: { id: "original" } });
  const handler = asyncRoute(async () => {
    throw thrown;
  });

  let forwarded = null;
  await handler({ params: { id: "should-not-overwrite" } }, {}, (err) => { forwarded = err; });

  assert.deepEqual(forwarded.routeParams, { id: "original" });
});
