-- This column is now added in 026_create_user_privacy_settings.sql (which creates the table).
-- This file is intentionally a no-op so that fresh databases do not fail
-- when migrations run in lexical order (007 executes before the table exists in 026).
-- Existing databases that already have the column are unaffected because
-- 026 uses ADD COLUMN IF NOT EXISTS.
DO $$ BEGIN
  -- no-op: marketing_email_opt_in is handled in 026_create_user_privacy_settings.sql
END $$;