"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDiagnostics,
  __private: { isConfigured }
} = require("../services/diagnosticsService.js");

function withEnv(overrides, fn) {
  const before = {};
  for (const key of Object.keys(overrides)) {
    before[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(before)) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}

test("isConfigured returns true only when env is set to a non-empty value", () => {
  withEnv({ TEST_DIAG_KEY: "value" }, () => {
    assert.equal(isConfigured("TEST_DIAG_KEY"), true);
  });
  withEnv({ TEST_DIAG_KEY: "" }, () => {
    assert.equal(isConfigured("TEST_DIAG_KEY"), false);
  });
  withEnv({ TEST_DIAG_KEY: undefined }, () => {
    assert.equal(isConfigured("TEST_DIAG_KEY"), false);
  });
});

test("buildDiagnostics returns booleans and counts only (no secret values)", () => {
  withEnv({
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    STRIPE_PRICE_PRO_MONTHLY_USD: "price_1",
    STRIPE_PRICE_PRO_YEARLY_USD: "price_2",
    RESEND_API_KEY: "re_x",
    FIELD_ENCRYPTION_KEY: "k",
    JWT_SECRET: "j",
    CSRF_SECRET: "c"
  }, () => {
    const d = buildDiagnostics({
      migrationStats: { total: 50, applied: 0, skipped: 50, lastAppliedAt: null, lastCheckedAt: new Date("2026-05-11T00:00:00Z") },
      rateLimiting: { mode: "redis", redisConfigured: true, redisConnected: true },
      receiptStorage: { mode: "local", configured: true }
    });

    assert.equal(d.stripe.secret_configured, true);
    assert.equal(d.stripe.webhook_secret_configured, true);
    assert.equal(d.stripe.price_envs_set, 2);
    assert.equal(d.email.configured, true);
    assert.equal(d.encryption.field_encryption_key_configured, true);
    assert.equal(d.auth.jwt_secret_configured, true);
    assert.equal(d.auth.csrf_secret_configured, true);

    // never expose raw secret values
    const serialized = JSON.stringify(d);
    assert.ok(!serialized.includes("sk_test_x"));
    assert.ok(!serialized.includes("whsec_x"));
    assert.ok(!serialized.includes("re_x"));
    assert.ok(!serialized.includes("price_1"));
  });
});

test("buildDiagnostics reflects unconfigured state cleanly", () => {
  withEnv({
    STRIPE_SECRET_KEY: undefined,
    RESEND_API_KEY: undefined,
    FIELD_ENCRYPTION_KEY: undefined
  }, () => {
    const d = buildDiagnostics({});
    assert.equal(d.stripe.secret_configured, false);
    assert.equal(d.email.configured, false);
    assert.equal(d.encryption.field_encryption_key_configured, false);
    assert.equal(d.migrations, null);
    assert.equal(d.rate_limiting, null);
    assert.equal(d.receipt_storage, null);
  });
});
