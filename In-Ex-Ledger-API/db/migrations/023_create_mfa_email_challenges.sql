CREATE TABLE IF NOT EXISTS mfa_email_challenges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mfa_email_challenges_user_id_idx
  ON mfa_email_challenges (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS mfa_email_challenges_expires_at_idx
  ON mfa_email_challenges (expires_at);
