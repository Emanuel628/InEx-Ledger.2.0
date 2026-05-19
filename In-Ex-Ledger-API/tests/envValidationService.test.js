"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectRequiredEnvironmentVariables,
  validateEnvironmentOrThrow,
  isProductionEnvironment
} = require("../services/envValidationService.js");
const { STRIPE_PRICE_ENTRIES } = require("../services/stripePriceConfig.js");

const PRODUCTION_ENV_FIXTURE = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  JWT_SECRET: "test-jwt-secret",
  APP_BASE_URL: "https://app.example.com",
  RESEND_API_KEY: "re_test_key",
  CSRF_SECRET: "test-csrf-secret",
  FIELD_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test_123",
  EXPORT_GRANT_SECRET: "test-export-grant-secret",
  RECEIPT_STORAGE_DIR: "storage/receipts",
  STRIPE_PRO_M_US: "price_pro_m_us",
  STRIPE_PRO_Y_US: "price_pro_y_us",
  STRIPE_PRO_M_CA: "price_pro_m_ca",
  STRIPE_PRO_Y_CA: "price_pro_y_ca",
  STRIPE_ADDL_M_US: "price_addl_m_us",
  STRIPE_ADDL_Y_US: "price_addl_y_us",
  STRIPE_ADDL_M_CA: "price_addl_m_ca",
  STRIPE_ADDL_Y_CA: "price_addl_y_ca"
};

function withSyntheticEnv(envOverrides, fn) {
  const snapshot = { ...process.env };
  process.env = { ...envOverrides };
  try {
    return fn();
  } finally {
    process.env = snapshot;
  }
}

test("isProductionEnvironment recognizes production strings only", () => {
  assert.equal(isProductionEnvironment("production"), true);
  assert.equal(isProductionEnvironment("PRODUCTION"), true);
  assert.equal(isProductionEnvironment("  production  "), true);
  assert.equal(isProductionEnvironment("development"), false);
  assert.equal(isProductionEnvironment("test"), false);
  assert.equal(isProductionEnvironment(undefined), false);
  assert.equal(isProductionEnvironment(""), false);
});

test("collectRequiredEnvironmentVariables('production') includes every Stripe price env", () => {
  const required = collectRequiredEnvironmentVariables("production");
  for (const entry of STRIPE_PRICE_ENTRIES) {
    assert.ok(
      required.includes(entry.env),
      `Expected production-required env list to include ${entry.env}`
    );
  }
});

test("collectRequiredEnvironmentVariables('production') includes core production secrets", () => {
  const required = collectRequiredEnvironmentVariables("production");
  const expected = [
    "DATABASE_URL",
    "JWT_SECRET",
    "APP_BASE_URL",
    "RESEND_API_KEY",
    "CSRF_SECRET",
    "FIELD_ENCRYPTION_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "EXPORT_GRANT_SECRET",
    "RECEIPT_STORAGE_DIR"
  ];
  for (const name of expected) {
    assert.ok(
      required.includes(name),
      `Expected production-required env list to include ${name}`
    );
  }
});

test("collectRequiredEnvironmentVariables('development') excludes production-only vars", () => {
  const required = collectRequiredEnvironmentVariables("development");
  assert.deepEqual(required.sort(), [
    "APP_BASE_URL",
    "DATABASE_URL",
    "JWT_SECRET",
    "RESEND_API_KEY"
  ]);
  for (const entry of STRIPE_PRICE_ENTRIES) {
    assert.equal(
      required.includes(entry.env),
      false,
      `Did not expect ${entry.env} to be required outside production`
    );
  }
  assert.equal(required.includes("FIELD_ENCRYPTION_KEY"), false);
  assert.equal(required.includes("CSRF_SECRET"), false);
});

test("validateEnvironmentOrThrow('production') passes with a complete synthetic env", () => {
  withSyntheticEnv(PRODUCTION_ENV_FIXTURE, () => {
    assert.doesNotThrow(() => validateEnvironmentOrThrow("production"));
  });
});

test("validateEnvironmentOrThrow('production') throws ENV_VALIDATION_FAILED when FIELD_ENCRYPTION_KEY is missing", () => {
  const incomplete = { ...PRODUCTION_ENV_FIXTURE };
  delete incomplete.FIELD_ENCRYPTION_KEY;

  withSyntheticEnv(incomplete, () => {
    assert.throws(
      () => validateEnvironmentOrThrow("production"),
      (err) => {
        assert.equal(err.code, "ENV_VALIDATION_FAILED");
        assert.ok(Array.isArray(err.missing));
        assert.ok(err.missing.includes("FIELD_ENCRYPTION_KEY"));
        return true;
      }
    );
  });
});

test("validateEnvironmentOrThrow('production') throws when any Stripe price env is missing", () => {
  for (const entry of STRIPE_PRICE_ENTRIES) {
    const incomplete = { ...PRODUCTION_ENV_FIXTURE };
    delete incomplete[entry.env];

    withSyntheticEnv(incomplete, () => {
      assert.throws(
        () => validateEnvironmentOrThrow("production"),
        (err) => {
          assert.equal(err.code, "ENV_VALIDATION_FAILED");
          assert.ok(
            err.missing.includes(entry.env),
            `Expected ${entry.env} to appear in the missing list`
          );
          return true;
        },
        `Removing ${entry.env} should have failed production validation`
      );
    });
  }
});

test("validateEnvironmentOrThrow('production') treats whitespace-only env values as missing", () => {
  const blanked = { ...PRODUCTION_ENV_FIXTURE, CSRF_SECRET: "   " };

  withSyntheticEnv(blanked, () => {
    assert.throws(
      () => validateEnvironmentOrThrow("production"),
      (err) => {
        assert.equal(err.code, "ENV_VALIDATION_FAILED");
        assert.ok(err.missing.includes("CSRF_SECRET"));
        return true;
      }
    );
  });
});

test("validateEnvironmentOrThrow('production') reports every missing var at once", () => {
  const incomplete = { ...PRODUCTION_ENV_FIXTURE };
  delete incomplete.STRIPE_SECRET_KEY;
  delete incomplete.STRIPE_WEBHOOK_SECRET;
  delete incomplete.STRIPE_ADDL_Y_CA;

  withSyntheticEnv(incomplete, () => {
    assert.throws(
      () => validateEnvironmentOrThrow("production"),
      (err) => {
        assert.equal(err.code, "ENV_VALIDATION_FAILED");
        assert.ok(err.missing.includes("STRIPE_SECRET_KEY"));
        assert.ok(err.missing.includes("STRIPE_WEBHOOK_SECRET"));
        assert.ok(err.missing.includes("STRIPE_ADDL_Y_CA"));
        return true;
      }
    );
  });
});

test("validateEnvironmentOrThrow('development') passes with only the always-required vars", () => {
  const devEnv = {
    DATABASE_URL: "postgresql://test",
    JWT_SECRET: "test",
    APP_BASE_URL: "http://localhost:8080",
    RESEND_API_KEY: "re_test"
  };

  withSyntheticEnv(devEnv, () => {
    assert.doesNotThrow(() => validateEnvironmentOrThrow("development"));
  });
});

test("validateEnvironmentOrThrow('development') throws when an always-required var is missing", () => {
  const devEnv = {
    DATABASE_URL: "postgresql://test",
    JWT_SECRET: "test",
    APP_BASE_URL: "http://localhost:8080"
  };

  withSyntheticEnv(devEnv, () => {
    assert.throws(
      () => validateEnvironmentOrThrow("development"),
      (err) => {
        assert.equal(err.code, "ENV_VALIDATION_FAILED");
        assert.ok(err.missing.includes("RESEND_API_KEY"));
        return true;
      }
    );
  });
});
