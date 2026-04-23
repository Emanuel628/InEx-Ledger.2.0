ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_email TEXT,
  ADD COLUMN IF NOT EXISTS recovery_email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS recovery_email_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_email_tokens_token_hash_idx
  ON recovery_email_tokens (token_hash);

CREATE INDEX IF NOT EXISTS recovery_email_tokens_user_id_idx
  ON recovery_email_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS recovery_email_tokens_expires_at_idx
  ON recovery_email_tokens (expires_at);
