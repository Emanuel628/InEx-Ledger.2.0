-- Migration: create audit_events table
-- General-purpose audit log for sensitive user/business actions
-- (login, password reset, MFA changes, transaction mutations, billing,
-- export generation, period lock/unlock, account deletion, etc.)

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  user_id UUID,
  business_id UUID,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx
  ON audit_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_business_created_idx
  ON audit_events (business_id, created_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events (action, created_at DESC);

-- Immutability: only inserts allowed, never UPDATE / DELETE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'audit_events'
       AND rulename  = 'audit_events_no_update'
  ) THEN
    EXECUTE 'CREATE RULE audit_events_no_update AS ON UPDATE TO audit_events DO INSTEAD NOTHING';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_rules
     WHERE tablename = 'audit_events'
       AND rulename  = 'audit_events_no_delete'
  ) THEN
    EXECUTE 'CREATE RULE audit_events_no_delete AS ON DELETE TO audit_events DO INSTEAD NOTHING';
  END IF;
END;
$$;

COMMENT ON TABLE audit_events IS
  'Immutable audit trail of sensitive actions. Insert-only; UPDATE / DELETE are silently dropped via rules.';
