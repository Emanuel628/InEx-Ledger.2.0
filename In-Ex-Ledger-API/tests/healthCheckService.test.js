"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHealthCheckResponse,
  sanitizeRateLimiting,
  sanitizeReceiptStorage
} = require("../services/healthCheckService.js");

test("health check returns 200 only when all critical systems are healthy", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: {
      available: true,
      enabled: true,
      mode: "redis",
      redisConfigured: true,
      redisConnected: true,
      required: true
    },
    receiptStorage: {
      available: true,
      mode: "enforced",
      persistentConfirmed: true
    },
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
    receiptStorage: { mode: "enforced", available: true, persistentConfirmed: true },
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
    receiptStorage: { mode: "enforced", available: true, persistentConfirmed: true },
    uptimeSeconds: 12.34,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "retrying");
  assert.deepEqual(response.body.database, { state: "retrying" });
});

test("health check returns 503 when a dependency reports unavailable despite a non-degraded mode", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: { mode: "enabled", available: false },
    receiptStorage: { mode: "enforced", available: true, persistentConfirmed: true },
    uptimeSeconds: 12.34,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.status, "degraded");
});

test("public /health response never exposes rateLimiting.lastError or rateLimiting.updatedAt", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: {
      available: false,
      enabled: true,
      lastError: "Redis unavailable; rate limiting using in-memory store",
      mode: "degraded",
      redisConfigured: true,
      redisConnected: false,
      required: true,
      updatedAt: "2026-04-12T12:00:00.000Z"
    },
    receiptStorage: { mode: "enforced", available: true, persistentConfirmed: true },
    uptimeSeconds: 1,
    now: "2026-04-12T12:00:00.000Z"
  });

  assert.equal(Object.prototype.hasOwnProperty.call(response.body.rateLimiting, "lastError"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(response.body.rateLimiting, "updatedAt"), false);
  assert.deepEqual(Object.keys(response.body.rateLimiting).sort(), [
    "available",
    "enabled",
    "mode",
    "redisConfigured",
    "redisConnected",
    "required"
  ]);
});

test("public /health response never exposes receiptStorage.directory, .lastError, .backend, or .writable", () => {
  const response = buildHealthCheckResponse({
    dbState: "ready",
    rateLimiting: { available: true, enabled: true, mode: "enabled", redisConfigured: true, redisConnected: true, required: true },
    receiptStorage: {
      available: false,
      backend: "local-disk",
      directory: "/var/secret/path/storage/receipts",
      lastError: "EACCES: permission denied at /var/secret/path/storage/receipts",
      mode: "degraded",
      persistenceRequired: true,
      persistentConfirmed: false,
      writable: false
    },
    uptimeSeconds: 1,
    now: "2026-04-12T12:00:00.000Z"
  });

  for (const forbidden of ["directory", "lastError", "backend", "writable", "persistenceRequired", "persistentConfirmed"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(response.body.receiptStorage, forbidden),
      false,
      `receiptStorage should not include ${forbidden} in the public health response`
    );
  }
  assert.deepEqual(Object.keys(response.body.receiptStorage).sort(), [
    "available",
    "configured",
    "mode"
  ]);
});

test("sanitizeRateLimiting coerces non-boolean inputs to typed values", () => {
  const sanitized = sanitizeRateLimiting({
    available: "yes",
    enabled: 1,
    lastError: "leak me",
    mode: "memory",
    redisConfigured: null,
    redisConnected: undefined,
    required: "true"
  });
  assert.deepEqual(sanitized, {
    available: false,
    enabled: false,
    mode: "memory",
    redisConfigured: false,
    redisConnected: false,
    required: false
  });
});

test("sanitizeRateLimiting defaults missing fields safely", () => {
  const sanitized = sanitizeRateLimiting();
  assert.deepEqual(sanitized, {
    available: false,
    enabled: false,
    mode: "unknown",
    redisConfigured: false,
    redisConnected: false,
    required: false
  });
});

test("sanitizeReceiptStorage maps persistentConfirmed to configured and drops other fields", () => {
  const sanitized = sanitizeReceiptStorage({
    available: true,
    backend: "local-disk",
    directory: "/srv/storage",
    lastError: null,
    mode: "enforced",
    persistenceRequired: true,
    persistentConfirmed: true,
    writable: true
  });
  assert.deepEqual(sanitized, {
    available: true,
    configured: true,
    mode: "enforced"
  });
});

test("sanitizeReceiptStorage defaults missing fields safely", () => {
  const sanitized = sanitizeReceiptStorage();
  assert.deepEqual(sanitized, {
    available: false,
    configured: false,
    mode: "unknown"
  });
});
