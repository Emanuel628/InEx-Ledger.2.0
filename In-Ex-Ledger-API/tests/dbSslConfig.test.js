"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { buildSslConfig, describeSslConfig } = require("../utils/dbSslConfig.js");

function silentLogger() {
  return { warn() {}, error() {} };
}

test("buildSslConfig disables SSL for local/test URLs by default", () => {
  const config = buildSslConfig({
    env: { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/inex_ledger_test" },
    nodeEnv: "test",
    logger: silentLogger()
  });

  assert.equal(config, false);
});

test("buildSslConfig honors DATABASE_URL sslmode=disable", () => {
  const config = buildSslConfig({
    env: { DATABASE_URL: "postgres://user:pass@example.com/db?sslmode=disable" },
    nodeEnv: "production",
    logger: silentLogger()
  });

  assert.equal(config, false);
});

test("buildSslConfig enables strict SSL by default in production", () => {
  const config = buildSslConfig({
    env: { DATABASE_URL: "postgres://user:pass@example.com/db" },
    nodeEnv: "production",
    logger: silentLogger()
  });

  assert.deepEqual(config, { rejectUnauthorized: true });
});

test("buildSslConfig can enable non-strict SSL explicitly outside production", () => {
  const config = buildSslConfig({
    env: {
      DATABASE_URL: "postgres://user:pass@example.com/db",
      DB_SSL: "require"
    },
    nodeEnv: "test",
    logger: silentLogger()
  });

  assert.deepEqual(config, { rejectUnauthorized: false });
});

test("buildSslConfig reads a configured CA certificate", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "db-ssl-config-"));
  const certPath = path.join(tmpDir, "ca.pem");
  fs.writeFileSync(certPath, "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n");

  const config = buildSslConfig({
    env: {
      DATABASE_URL: "postgres://user:pass@example.com/db",
      DB_SSL: "require",
      DB_SSL_CA_CERT: certPath
    },
    nodeEnv: "test",
    logger: silentLogger()
  });

  assert.equal(config.ca.includes("BEGIN CERTIFICATE"), true);
});

test("describeSslConfig summarizes effective SSL settings without secrets", () => {
  assert.equal(describeSslConfig(false), "disabled");
  assert.equal(
    describeSslConfig({ rejectUnauthorized: true, ca: "secret cert body" }),
    "enabled (rejectUnauthorized=true, customCA=true)"
  );
});
