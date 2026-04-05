CREATE TABLE IF NOT EXISTS cpa_audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  grant_id UUID REFERENCES cpa_access_grants(id) ON DELETE SET NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cpa_audit_logs_owner_created_idx
  ON cpa_audit_logs (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cpa_audit_logs_actor_created_idx
  ON cpa_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cpa_audit_logs_grant_created_idx
  ON cpa_audit_logs (grant_id, created_at DESC);
