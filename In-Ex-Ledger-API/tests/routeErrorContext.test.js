"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildRouteErrorContext,
  summarizeRouteError
} = require("../utils/routeErrorContext.js");

test("buildRouteErrorContext captures request correlation fields and error summary", () => {
  const error = new Error("database failed");
  error.code = "XX000";
  error.constraint = "fk_example";
  error.statusCode = 500;

  const context = buildRouteErrorContext(
    {
      requestId: "request-123",
      method: "POST",
      originalUrl: "/api/transactions",
      user: { id: "user-123", email: "private@example.com" },
      params: { id: "tx-123" }
    },
    error,
    { businessId: "business-123" }
  );

  assert.deepEqual(context, {
    err: {
      name: "Error",
      message: "database failed",
      code: "XX000",
      constraint: "fk_example",
      status: 500
    },
    requestId: "request-123",
    method: "POST",
    path: "/api/transactions",
    userId: "user-123",
    params: { id: "tx-123" },
    businessId: "business-123"
  });
});

test("summarizeRouteError handles non-error throws", () => {
  assert.deepEqual(summarizeRouteError("bad"), { message: "bad" });
  assert.deepEqual(summarizeRouteError(null), { message: "Unknown error" });
});

test("transaction route error logs include request context", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "routes", "transactions.routes.js"),
    "utf8"
  );

  const logLines = source
    .split(/\r?\n/)
    .filter((line) => line.includes("logError("));

  assert.ok(logLines.length > 0, "expected transaction route error logs");
  for (const line of logLines) {
    assert.match(line, /buildRouteErrorContext\(req, err/, line);
  }
});
