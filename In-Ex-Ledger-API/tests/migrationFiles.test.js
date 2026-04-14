"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

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
