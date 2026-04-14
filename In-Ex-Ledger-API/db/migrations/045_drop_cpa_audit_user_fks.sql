-- cpa_audit_logs is an immutable append-only table protected by PostgreSQL
-- DO-INSTEAD-NOTHING rules for both DELETE and UPDATE (migration 032).
-- Those rules silently swallow the FK cascade/set-null actions that fire
-- when a user row is deleted, leaving referencing rows intact.  PostgreSQL
-- then re-checks the FK constraint, finds non-null references to the now-
-- missing user, and raises a FK violation that aborts the DELETE /api/me
-- transaction with HTTP 500.
--
-- Fix: drop both user foreign keys so that:
--   • owner_user_id – the CASCADE no longer tries to delete audit rows
--   • actor_user_id – the SET NULL no longer tries to update audit rows
-- Audit records are preserved as historical evidence even after a user is
-- deleted (the UUID columns become orphaned references, which is intentional
-- and consistent with how migration 036 handled the business_id FK).

ALTER TABLE cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;

ALTER TABLE cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;
