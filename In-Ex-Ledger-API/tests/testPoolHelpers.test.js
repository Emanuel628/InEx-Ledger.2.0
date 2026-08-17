"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");
const { asyncRoute } = require("../utils/apiError.js");

function buildApp({ thrown, logSpy, user } = {}) {
  const app = express();
  app.get("/x", (req, res, next) => {
    if (user) req.user = user;
    next(thrown);
  });
  // Routed through the real asyncRoute, same as production route files --
  // it's the thing that snapshots req.params onto the error before it
  // bubbles past the layer where params would otherwise reset to {}.
  app.get("/x/:id", asyncRoute(async (req) => {
    if (user) req.user = user;
    throw thrown;
  }));
  attachCentralErrorHandler(app, logSpy ? { logError: logSpy } : {});
  return app;
}

test("attachCentralErrorHandler returns the error's own message for a <500 status", async () => {
  const err = Object.assign(new Error("Bad input."), { status: 400 });
  const response = await request(buildApp({ thrown: err })).get("/x");
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: "Bad input." });
});

test("attachCentralErrorHandler hides the message behind a generic string for 500s", async () => {
  const err = new Error("stack trace with secrets");
  const response = await request(buildApp({ thrown: err })).get("/x");
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Internal server error" });
});

test("attachCentralErrorHandler reads statusCode as a fallback for status", async () => {
  const err = Object.assign(new Error("Conflict."), { statusCode: 409 });
  const response = await request(buildApp({ thrown: err })).get("/x");
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { error: "Conflict." });
});

test("attachCentralErrorHandler calls the provided logError spy with structured fields", async () => {
  const calls = [];
  const err = Object.assign(new Error("Bad input."), { status: 400 });
  await request(buildApp({ thrown: err, logSpy: (message, context) => calls.push({ message, context }) })).get("/x");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "Unhandled error");
  assert.equal(calls[0].context.status, 400);
  assert.equal(calls[0].context.method, "GET");
  assert.equal(calls[0].context.path, "/x");
  assert.equal(calls[0].context.message, "Bad input.");
});

test("attachCentralErrorHandler includes err.code and err.constraint when present", async () => {
  const calls = [];
  const err = Object.assign(new Error("Duplicate."), {
    status: 409,
    code: "23505",
    constraint: "accounts_business_id_name_key"
  });
  await request(buildApp({ thrown: err, logSpy: (message, context) => calls.push({ message, context }) })).get("/x");

  assert.equal(calls[0].context.code, "23505");
  assert.equal(calls[0].context.constraint, "accounts_business_id_name_key");
});

test("attachCentralErrorHandler omits code/constraint when the error doesn't carry them", async () => {
  const calls = [];
  const err = Object.assign(new Error("Bad input."), { status: 400 });
  await request(buildApp({ thrown: err, logSpy: (message, context) => calls.push({ message, context }) })).get("/x");

  assert.equal("code" in calls[0].context, false);
  assert.equal("constraint" in calls[0].context, false);
});

test("attachCentralErrorHandler includes userId when req.user is set", async () => {
  const calls = [];
  const err = new Error("boom");
  await request(buildApp({
    thrown: err,
    user: { id: "user_123" },
    logSpy: (message, context) => calls.push({ message, context })
  })).get("/x");

  assert.equal(calls[0].context.userId, "user_123");
});

test("attachCentralErrorHandler includes non-empty route params", async () => {
  const calls = [];
  const err = new Error("boom");
  await request(buildApp({ thrown: err, logSpy: (message, context) => calls.push({ message, context }) })).get("/x/abc123");

  assert.deepEqual(calls[0].context.params, { id: "abc123" });
});

test("attachCentralErrorHandler omits params when the route has none", async () => {
  const calls = [];
  const err = new Error("boom");
  await request(buildApp({ thrown: err, logSpy: (message, context) => calls.push({ message, context }) })).get("/x");

  assert.equal("params" in calls[0].context, false);
});

test("attachCentralErrorHandler does not log when no spy is provided", async () => {
  const err = new Error("boom");
  const response = await request(buildApp({ thrown: err })).get("/x");
  assert.equal(response.status, 500);
});
