"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildHealthCheckResponse } = require("../services/healthCheckService.js");

test("health check returns 200 only when all critical systems are healthy", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: { mode: "redis", available: true },
    receiptStorage: { mode: "enforced", available: true },
    uptimeSeconds: 12.34,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "healthy");
  assert.equal(response.body.database.state, "ready");
});

test("health check returns 503 when dependencies are degraded even if the database is ready", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: { mode: "degraded", available: false },
    receiptStorage: { mode: "enforced", available: true },
    uptimeSeconds: 12.34,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "degraded");
});

test("health check returns 503 while startup or retry states are still in progress", () => {
  const response = buildHealthCheckResponse({
    dbState: "retrying",
    rateLimiting: { mode: "memory", available: true },
    receiptStorage: { mode: "enforced", available: true },
    uptimeSeconds: 12.34,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "retrying");
  assert.deepEqual(response.body.database, { state: "retrying" });
});
