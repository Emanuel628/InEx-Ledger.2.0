"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const apiRoot = path.join(__dirname, "..");

test("npm start does not run a write-capable migration checksum repair prestart", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(apiRoot, "package.json"), "utf8"));

  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "prestart"), false);
  assert.match(packageJson.scripts.start, /^node server\.js$/);
  assert.match(packageJson.scripts["migrations:repair-checksums"], /--write/);
});

test("database startup accepts known historical checksum drift without rewriting metadata", () => {
  const dbSource = fs.readFileSync(path.join(apiRoot, "db.js"), "utf8");
  const initDatabaseBody = dbSource.slice(
    dbSource.indexOf("async function initDatabase()"),
    dbSource.indexOf("module.exports = {")
  );

  assert.doesNotMatch(initDatabaseBody, /UPDATE\s+schema_migrations/i);
  assert.doesNotMatch(initDatabaseBody, /DELETE\s+FROM\s+schema_migrations/i);
  assert.match(initDatabaseBody, /canAcceptHistoricalMigrationDrift/);
});

test("server does not listen for traffic before database initialization completes", async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.CSRF_SECRET = process.env.CSRF_SECRET || "test-csrf-secret";

  const dbModulePath = require.resolve("../db.js");
  const serverModulePath = require.resolve("../server.js");
  delete require.cache[serverModulePath];
  delete require.cache[dbModulePath];

  // db.js is required (and its exports mutated) before server.js so that
  // server.js's own `const { initDatabase } = require('./db.js')` captures
  // this spy instead of the real, network-calling implementation.
  const dbModule = require("../db.js");
  const originalInitDatabase = dbModule.initDatabase;
  const callOrder = [];
  dbModule.initDatabase = async () => {
    callOrder.push("db-init-start");
    await new Promise((resolve) => setTimeout(resolve, 5));
    callOrder.push("db-init-complete");
  };

  const { app, startServer } = require("../server.js");
  const originalListen = app.listen;
  app.listen = (...args) => {
    callOrder.push("listen");
    const onListening = args.find((arg) => typeof arg === "function");
    if (onListening) onListening();
    return { close: (done) => { if (done) done(); } };
  };

  try {
    await startServer();
    assert.deepEqual(
      callOrder,
      ["db-init-start", "db-init-complete", "listen"],
      "app.listen must not run until database initialization has actually completed"
    );
  } finally {
    app.listen = originalListen;
    dbModule.initDatabase = originalInitDatabase;
    delete require.cache[serverModulePath];
    delete require.cache[dbModulePath];
  }
});
