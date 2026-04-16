-- Cookie consent audit log: persists banner decisions for compliance evidence.
-- user_id is nullable because consent may be recorded before sign-in.
CREATE TABLE IF NOT EXISTS cookie_consent_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  decision     TEXT        NOT NULL CHECK (decision IN ('accepted', 'declined')),
  version      TEXT        NOT NULL DEFAULT '1',
  ip_address   TEXT,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cookie_consent_log_user_id_idx
  ON cookie_consent_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cookie_consent_log_created_at_idx
  ON cookie_consent_log (created_at DESC);
