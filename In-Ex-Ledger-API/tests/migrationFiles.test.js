"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { computeChecksum, isCompatibleHistoricalMigrationChecksum } = require("../db.js");

const migrationsDir = path.join(__dirname, "..", "db", "migrations");

test("migration 045 keeps original applied SQL shape", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "045_drop_cpa_audit_user_fks.sql"), "utf8");

  assert.match(sql, /ALTER TABLE cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;/i);
  assert.match(sql, /ALTER TABLE cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;/i);
  assert.doesNotMatch(sql, /ALTER TABLE IF EXISTS cpa_audit_logs/i);
});

test("migration 048 idempotently drops legacy cpa_audit_logs user FKs", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "048_fix_cpa_audit_fk_constraints.sql"), "utf8");

  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;/i);
  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;/i);
});

test("migration 049 creates persistent Stripe webhook idempotency table", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "049_create_stripe_webhook_events.sql"), "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS stripe_webhook_events/i);
  assert.match(sql, /event_id\s+TEXT\s+PRIMARY KEY/i);
  assert.match(sql, /processed_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at/i);
});

test("migration 050 drops cpa_audit_logs grant_id FK to prevent XX000 on account deletion", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "050_drop_cpa_audit_grant_id_fk.sql"), "utf8");

  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_grant_id_fkey;/i);
});

test("billable expenses base migration does not inline the projects FK", () => {
  const sql = fs.readFileSync(path.join(migrationsDir, "20260419_create_billable_expenses_table.sql"), "utf8");

  assert.match(sql, /project_id\s+UUID/i);
  assert.doesNotMatch(sql, /project_id\s+UUID\s+REFERENCES\s+projects\(id\)/i);
});

test("billable expenses checksum compatibility only allows the known historical inline-FK variant", () => {
  assert.equal(
    isCompatibleHistoricalMigrationChecksum(
      "20260419_create_billable_expenses_table.sql",
      "d25041a060a490bb68b9d783adeeb87f6a72ec0aae4858e8f80369c264e639dc"
    ),
    true
  );

  assert.equal(
    isCompatibleHistoricalMigrationChecksum(
      "20260419_create_billable_expenses_table.sql",
      "fb3d6f923d83707347a58d95dd7b9e6557b98c903fd1d1d060af81088986eebf"
    ),
    true
  );

  assert.equal(
    isCompatibleHistoricalMigrationChecksum(
      "20260419_create_billable_expenses_table.sql",
      "511cb26e8a82e807a87fbaa40d11ff521c37ae4363761fd42170120a175009ba"
    ),
    false
  );

  assert.equal(
    isCompatibleHistoricalMigrationChecksum("some_other_migration.sql", "511cb26e8a82e807a87fbaa40d11ff521c37ae4363761fd42170120a175009ba"),
    false
  );
});

test("migration checksum hashing is stable across LF and CRLF line endings", () => {
  const lfSql = "CREATE TABLE test (\n  id INT\n);\n";
  const crlfSql = lfSql.replace(/\n/g, "\r\n");
  const expected = crypto.createHash("sha256").update(lfSql, "utf8").digest("hex");

  assert.equal(computeChecksum(lfSql), expected);
  assert.equal(computeChecksum(crlfSql), expected);
});
