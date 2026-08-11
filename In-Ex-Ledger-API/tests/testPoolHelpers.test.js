"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const { attachCentralErrorHandler } = require("./helpers/testPool.js");

function buildApp({ thrown, logSpy } = {}) {
  const app = express();
  app.get("/x", (req, res, next) => {
    next(thrown);
  });
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

test("attachCentralErrorHandler does not log when no spy is provided", async () => {
  const err = new Error("boom");
  const response = await request(buildApp({ thrown: err })).get("/x");
  assert.equal(response.status, 500);
});
