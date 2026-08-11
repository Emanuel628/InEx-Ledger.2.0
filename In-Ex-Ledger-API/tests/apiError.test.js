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
