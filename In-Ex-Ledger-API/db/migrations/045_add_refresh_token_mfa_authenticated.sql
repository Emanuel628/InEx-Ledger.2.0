ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS mfa_authenticated BOOLEAN NOT NULL DEFAULT false;
