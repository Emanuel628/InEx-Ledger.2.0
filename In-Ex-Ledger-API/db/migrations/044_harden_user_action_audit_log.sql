DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'user_action_audit_log_performed_by_fk'
  ) THEN
    ALTER TABLE user_action_audit_log
      ADD CONSTRAINT user_action_audit_log_performed_by_fk
      FOREIGN KEY (performed_by)
      REFERENCES users(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS user_action_audit_log_performed_by_created_at_idx
  ON user_action_audit_log (performed_by, created_at DESC)
  WHERE performed_by IS NOT NULL;
