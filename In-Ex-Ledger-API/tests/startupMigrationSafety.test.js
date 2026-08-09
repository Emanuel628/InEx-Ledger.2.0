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
