CREATE TABLE IF NOT EXISTS cpa_access_grants (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  grantee_email TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('all', 'business')),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cpa_access_grants_owner_status_idx
  ON cpa_access_grants (owner_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS cpa_access_grants_grantee_email_status_idx
  ON cpa_access_grants (lower(grantee_email), status, created_at DESC);

CREATE INDEX IF NOT EXISTS cpa_access_grants_grantee_user_status_idx
  ON cpa_access_grants (grantee_user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS cpa_access_grants_active_scope_unique_idx
  ON cpa_access_grants (
    owner_user_id,
    lower(grantee_email),
    scope,
    COALESCE(business_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('pending', 'active');
