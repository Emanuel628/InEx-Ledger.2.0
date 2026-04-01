-- Export grant JTIs table (replaces in-memory Map in exportGrantService.js)
CREATE TABLE IF NOT EXISTS export_grant_jtis (
  jti UUID PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_grant_jtis_expires ON export_grant_jtis(expires_at);
