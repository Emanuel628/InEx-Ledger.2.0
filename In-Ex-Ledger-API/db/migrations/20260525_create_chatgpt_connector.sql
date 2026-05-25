CREATE TABLE IF NOT EXISTS chatgpt_connector_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  consent_type TEXT NOT NULL DEFAULT 'oauth'
    CHECK (consent_type IN ('oauth', 'personal_access')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_connector_consents_user_business
  ON chatgpt_connector_consents (user_id, business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS chatgpt_connector_auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id UUID NOT NULL REFERENCES chatgpt_connector_consents(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256'
    CHECK (code_challenge_method IN ('S256', 'plain')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_connector_auth_codes_lookup
  ON chatgpt_connector_auth_codes (client_id, redirect_uri, expires_at);

CREATE TABLE IF NOT EXISTS chatgpt_connector_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id UUID NOT NULL REFERENCES chatgpt_connector_consents(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  token_kind TEXT NOT NULL DEFAULT 'oauth_access'
    CHECK (token_kind IN ('oauth_access', 'personal_access')),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatgpt_connector_access_tokens_user_business
  ON chatgpt_connector_access_tokens (user_id, business_id, token_kind, revoked_at, created_at DESC);
