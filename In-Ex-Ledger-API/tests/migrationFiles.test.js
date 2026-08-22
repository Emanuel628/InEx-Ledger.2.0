"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  computeChecksum,
  getCanonicalMigrationFilename,
  hasRequiredColumns,
  isCompatibleHistoricalMigrationChecksum
} = require("../db.js");

const migrationsDir = path.join(__dirname, "..", "db", "migrations");
const HISTORICAL_NUMERIC_PREFIX_MIGRATIONS = new Set([
  "001_init_luna_business.sql",
  "002_enforce_business_name_uniqueness.sql",
  "003_add_receipt_storage.sql",
  "004_create_refresh_tokens.sql",
  "005_drop_accounts_name_unique_index.sql",
  "006_add_receipt_file_hash.sql",
  "007_add_marketing_email_opt_in.sql",
  "007_add_user_columns.sql",
  "008_create_exports.sql",
  "009_create_auth_tokens.sql",
  "010_create_export_grant_jtis.sql",
  "011_business_and_user_profile.sql",
  "012_create_business_subscriptions.sql",
  "013_expand_business_profile.sql",
  "014_add_category_color.sql",
  "015_harden_core_data_paths.sql",
  "016_add_transaction_cleared_flag.sql",
  "017_create_recurring_transactions.sql",
  "018_add_active_business_context.sql",
  "019_create_cpa_access_grants.sql",
  "020_create_cpa_audit_logs.sql",
  "021_add_user_mfa.sql",
  "022_create_mfa_trusted_devices.sql",
  "023_create_mfa_email_challenges.sql",
  "024_add_user_onboarding_state.sql",
  "025_finalize_business_profile_columns.sql",
  "026_create_user_privacy_settings.sql",
  "026_fix_exports_schema.sql",
  "027_add_user_data_residency.sql",
  "028_add_encrypted_sensitive_fields.sql",
  "029_add_transaction_audit_pivot.sql",
  "030_add_privacy_consent_log.sql",
  "031_add_cpa_license_verification.sql",
  "032_cpa_ip_tracking_and_audit_immutability.sql",
  "033_phase4_user_rights_and_audit_trail.sql",
  "035_fix_schema_gaps.sql",
  "036_drop_cpa_audit_business_fk.sql",
  "037_add_cpa_edge_case_metadata.sql",
  "038_create_messages.sql",
  "039_add_analytics_opt_in.sql",
  "040_add_accounting_period_locks_and_transaction_archival.sql",
  "041_enforce_category_name_ci_unique.sql",
  "042_add_transaction_soft_delete.sql",
  "043_drop_goals.sql",
  "044_add_performance_indexes.sql",
  "045_add_refresh_token_mfa_authenticated.sql",
  "045_drop_cpa_audit_user_fks.sql",
  "046_add_1099_payer_fields_to_transactions.sql",
  "047_add_signin_device_tracking_and_secure_reset_tokens.sql",
  "048_add_cookie_consent_log.sql",
  "048_fix_cpa_audit_fk_constraints.sql",
  "048_reset_ip_based_signin_device_fingerprints.sql",
  "049_create_stripe_webhook_events.sql",
  "050_drop_cpa_audit_grant_id_fk.sql"
]);
const HISTORICAL_DESTRUCTIVE_MIGRATIONS = new Set([
  "002_enforce_business_name_uniqueness.sql",
  "015_harden_core_data_paths.sql",
  "026_fix_exports_schema.sql",
  "035_fix_schema_gaps.sql",
  "036_drop_cpa_audit_business_fk.sql",
  "041_enforce_category_name_ci_unique.sql",
  "043_drop_goals.sql",
  "045_drop_cpa_audit_user_fks.sql",
  "048_fix_cpa_audit_fk_constraints.sql",
  "048_reset_ip_based_signin_device_fingerprints.sql",
  "050_drop_cpa_audit_grant_id_fk.sql",
  "20260511_extend_messages_for_invoices.sql",
  "20260731_add_transaction_receipt_status.sql"
]);

function readMigration(filename) {
  return fs.readFileSync(path.join(migrationsDir, filename), "utf8");
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function containsDestructiveSql(sql) {
  return /\bDELETE\s+FROM\b|\bDROP\s+TABLE\b|\bDROP\s+CONSTRAINT\b|\bTRUNCATE\b/i.test(sqlWithoutComments(sql));
}

test("migration naming policy keeps historical numeric prefixes but requires date-prefixed new files", () => {
  const readme = fs.readFileSync(path.join(migrationsDir, "README.md"), "utf8");
  assert.match(readme, /YYYYMMDD_short_description\.sql/);
  assert.match(readme, /Do not rename them/);

  const numericPrefixFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{3}_.+\.sql$/.test(file))
    .sort();

  assert.deepEqual(
    numericPrefixFiles,
    Array.from(HISTORICAL_NUMERIC_PREFIX_MIGRATIONS).sort(),
    "new migrations must use YYYYMMDD_*.sql names; numeric prefixes are historical only"
  );
});

test("migration 045 keeps original applied SQL shape", () => {
  const sql = readMigration("045_drop_cpa_audit_user_fks.sql");

  assert.match(sql, /ALTER TABLE cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;/i);
  assert.match(sql, /ALTER TABLE cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;/i);
  assert.doesNotMatch(sql, /ALTER TABLE IF EXISTS cpa_audit_logs/i);
});

test("migration 048 idempotently drops legacy cpa_audit_logs user FKs", () => {
  const sql = readMigration("048_fix_cpa_audit_fk_constraints.sql");

  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;/i);
  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;/i);
});

test("migration 049 creates persistent Stripe webhook idempotency table", () => {
  const sql = readMigration("049_create_stripe_webhook_events.sql");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS stripe_webhook_events/i);
  assert.match(sql, /event_id\s+TEXT\s+PRIMARY KEY/i);
  assert.match(sql, /processed_at\s+TIMESTAMPTZ\s+NOT NULL\s+DEFAULT NOW\(\)/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at/i);
});

test("migration 20260816 creates durable email delivery dedupe table", () => {
  const sql = readMigration("20260816_create_email_delivery_dedupe.sql");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS email_delivery_dedupe/i);
  assert.match(sql, /dedupe_key\s+TEXT\s+PRIMARY KEY/i);
  assert.match(sql, /status\s+TEXT\s+NOT NULL\s+DEFAULT 'reserved'/i);
  assert.match(sql, /CHECK \(status IN \('reserved', 'sent', 'failed'\)\)/i);
  assert.match(sql, /provider_message_id\s+TEXT\s+NULL/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS email_delivery_dedupe_business_category_idx/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS email_delivery_dedupe_status_updated_idx/i);
});

test("migration 050 drops cpa_audit_logs grant_id FK to prevent XX000 on account deletion", () => {
  const sql = readMigration("050_drop_cpa_audit_grant_id_fk.sql");

  assert.match(sql, /ALTER TABLE IF EXISTS cpa_audit_logs\s+DROP CONSTRAINT IF EXISTS cpa_audit_logs_grant_id_fkey;/i);
});

test("billable expenses base migration does not inline the projects FK", () => {
  const sql = readMigration("20260419_create_billable_expenses_table.sql");

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

test("historical exports migration filename alias resolves to the canonical filename", () => {
  assert.equal(
    getCanonicalMigrationFilename("20260510_fix_exports_schema.sql"),
    "026_fix_exports_schema.sql"
  );

  assert.equal(
    getCanonicalMigrationFilename("026_fix_exports_schema.sql"),
    "026_fix_exports_schema.sql"
  );

  assert.equal(
    getCanonicalMigrationFilename("045_drop_cpa_audit_user_fks.sql"),
    "045_drop_cpa_audit_user_fks.sql"
  );
});

test("transaction mapping metadata migration sorts after the table it references", () => {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const createIndex = files.indexOf("20260531_create_transaction_mapping_rules.sql");
  const metadataIndex = files.indexOf("20260601_add_transaction_mapping_metadata.sql");

  assert.ok(createIndex !== -1, "expected the create-rules migration to exist");
  assert.ok(metadataIndex !== -1, "expected the metadata migration to exist");
  // The metadata migration adds a FK to transaction_mapping_rules, so the table
  // must be created first in apply order (fresh databases run in filename sort).
  assert.ok(
    createIndex < metadataIndex,
    "transaction_mapping_rules must be created before the metadata FK migration"
  );
});

test("renamed transaction mapping metadata migration resolves from its historical filename", () => {
  assert.equal(
    getCanonicalMigrationFilename("20260531_add_transaction_mapping_metadata.sql"),
    "20260601_add_transaction_mapping_metadata.sql"
  );
});

test("required-column helper only passes when every expected column exists", () => {
  assert.equal(
    hasRequiredColumns(
      ["id", "business_id", "project_id", "description"],
      ["id", "business_id", "project_id"]
    ),
    true
  );

  assert.equal(
    hasRequiredColumns(
      ["id", "business_id", "description"],
      ["id", "business_id", "project_id"]
    ),
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

test("child business integrity migration enforces composite tenant links safely", () => {
  const sql = readMigration("20260809_add_child_business_integrity_constraints.sql");

  assert.match(sql, /ON transactions \(id, business_id\)/i);
  assert.match(sql, /ON receipts \(id, business_id\)/i);
  assert.match(sql, /fk_support_artifacts_transaction_business/i);
  assert.match(sql, /FOREIGN KEY \(transaction_id, business_id\)\s+REFERENCES transactions \(id, business_id\)\s+NOT VALID/i);
  assert.match(sql, /fk_support_artifacts_legacy_receipt_business/i);
  assert.match(sql, /FOREIGN KEY \(legacy_receipt_id, business_id\)\s+REFERENCES receipts \(id, business_id\)\s+NOT VALID/i);
  assert.match(sql, /fk_transaction_review_states_transaction_business/i);
  assert.match(sql, /fk_vehicle_expense_details_transaction_business/i);
  assert.doesNotMatch(sqlWithoutComments(sql), /\bVALIDATE\s+CONSTRAINT\b/i);
});

test("child business integrity follow-up preserves original delete actions", () => {
  const sql = readMigration("20260810_fix_child_business_fk_delete_actions.sql");

  assert.match(sql, /destructive-migration-reviewed:/i);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS fk_support_artifacts_transaction_business/i);
  assert.match(sql, /FOREIGN KEY \(transaction_id, business_id\)\s+REFERENCES transactions \(id, business_id\)\s+ON DELETE SET NULL \(transaction_id\)\s+NOT VALID/i);
  assert.match(sql, /FOREIGN KEY \(legacy_receipt_id, business_id\)\s+REFERENCES receipts \(id, business_id\)\s+ON DELETE SET NULL \(legacy_receipt_id\)\s+NOT VALID/i);
  assert.match(sql, /FOREIGN KEY \(transaction_id, business_id\)\s+REFERENCES transactions \(id, business_id\)\s+ON DELETE CASCADE\s+NOT VALID/i);
  assert.doesNotMatch(sqlWithoutComments(sql), /\bVALIDATE\s+CONSTRAINT\b/i);
});

test("account category migration adds a constrained canonical account category", () => {
  const sql = readMigration("20260816_add_account_category_invariant.sql");

  assert.match(sql, /ADD COLUMN IF NOT EXISTS account_category TEXT/i);
  assert.match(sql, /SET account_category = CASE/i);
  assert.match(sql, /ALTER COLUMN account_category SET NOT NULL/i);
  assert.match(sql, /accounts_account_category_check/i);
  assert.match(
    sql,
    /CHECK \(account_category IN \('checking', 'savings', 'credit_card', 'cash', 'loan', 'custom'\)\)/i
  );
  assert.doesNotMatch(sqlWithoutComments(sql), /\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
});

test("new destructive migrations require an explicit review marker", () => {
  const unreviewed = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => {
      const sql = readMigration(file);
      return (
        containsDestructiveSql(sql)
        && !HISTORICAL_DESTRUCTIVE_MIGRATIONS.has(file)
        && !/destructive-migration-reviewed:/i.test(sql)
      );
    });

  assert.deepEqual(
    unreviewed,
    [],
    "destructive migrations must document review with a destructive-migration-reviewed: comment"
  );
});
