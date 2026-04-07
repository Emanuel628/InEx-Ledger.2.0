-- Phase 3: Record the client IP address when a "Grant Access" invitation is
-- created, and capture the requesting IP on every CPA audit-log entry.

ALTER TABLE cpa_access_grants
  ADD COLUMN IF NOT EXISTS grant_ip TEXT;

ALTER TABLE cpa_audit_logs
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Enforce immutability of the audit log: rows may only be inserted, never
-- updated or deleted.  PostgreSQL conditional rules are used so that any
-- attempt to UPDATE or DELETE an audit row is silently discarded.  This
-- satisfies the "immutable, append-only audit trail" requirement.
DO $$
BEGIN
  -- Prevent UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'cpa_audit_logs'
       AND rulename   = 'cpa_audit_logs_no_update'
  ) THEN
    EXECUTE $rule$
      CREATE RULE cpa_audit_logs_no_update AS
        ON UPDATE TO cpa_audit_logs DO INSTEAD NOTHING
    $rule$;
  END IF;

  -- Prevent DELETE
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'cpa_audit_logs'
       AND rulename   = 'cpa_audit_logs_no_delete'
  ) THEN
    EXECUTE $rule$
      CREATE RULE cpa_audit_logs_no_delete AS
        ON DELETE TO cpa_audit_logs DO INSTEAD NOTHING
    $rule$;
  END IF;
END
$$;
