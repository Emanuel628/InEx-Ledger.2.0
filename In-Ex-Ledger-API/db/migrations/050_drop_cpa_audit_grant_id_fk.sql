-- cpa_audit_logs is an immutable append-only table protected by PostgreSQL
-- DO-INSTEAD-NOTHING rules for both DELETE and UPDATE (migration 032).
--
-- Problem: cpa_audit_logs.grant_id has ON DELETE SET NULL referencing
-- cpa_access_grants(id).  When a user is deleted, ON DELETE CASCADE on
-- cpa_access_grants.owner_user_id removes the user's grants.  Each removed
-- grant triggers ON DELETE SET NULL on cpa_audit_logs.grant_id — but that
-- SET NULL is an UPDATE, which the DO INSTEAD NOTHING rule silently swallows.
-- PostgreSQL then re-checks the FK constraint, finds audit rows still
-- referencing the deleted grants, and raises XX000 (internal_error), aborting
-- the DELETE /api/me transaction.
--
-- Fix: drop the grant_id foreign key so that cpa_audit_logs rows are never
-- involved in cascade/set-null actions.  Audit entries keep the original
-- grant UUID as historical evidence even after the grant and user are gone —
-- the same intentional "orphaned reference" pattern used in migrations 036
-- (business_id FK) and 045 (owner_user_id / actor_user_id FKs).

ALTER TABLE IF EXISTS cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_grant_id_fkey;
