-- Phase 4: User Rights & Data Governance
-- 1. Track erasure status on users (Right to Be Forgotten)
-- 2. Immutable audit log for user data governance actions

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_erased   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS erased_at   TIMESTAMPTZ;

-- Immutable audit log for all user-facing governance actions
CREATE TABLE IF NOT EXISTS user_action_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  action        TEXT        NOT NULL CHECK (action IN ('data_export', 'erasure_request', 'data_deletion', 'admin_override')),
  format        TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  performed_by  UUID,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_action_audit_log_user_id_idx
  ON user_action_audit_log (user_id, created_at DESC);

-- Enforce immutability: rows may only be inserted, never updated or deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'user_action_audit_log'
       AND rulename  = 'user_action_audit_log_no_update'
  ) THEN
    EXECUTE $rule$
      CREATE RULE user_action_audit_log_no_update AS
        ON UPDATE TO user_action_audit_log DO INSTEAD NOTHING
    $rule$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'user_action_audit_log'
       AND rulename  = 'user_action_audit_log_no_delete'
  ) THEN
    EXECUTE $rule$
      CREATE RULE user_action_audit_log_no_delete AS
        ON DELETE TO user_action_audit_log DO INSTEAD NOTHING
    $rule$;
  END IF;
END
$$;
