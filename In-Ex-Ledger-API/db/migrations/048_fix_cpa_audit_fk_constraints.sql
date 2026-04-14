-- Follow-up migration for environments that still have legacy user FKs on
-- cpa_audit_logs due to missed/modified historical migration state.

ALTER TABLE IF EXISTS cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_owner_user_id_fkey;

ALTER TABLE IF EXISTS cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_actor_user_id_fkey;
