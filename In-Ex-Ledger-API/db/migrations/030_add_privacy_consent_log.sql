-- Quebec Privacy Defaults: add explicit opt-in log table for consent tracking
-- and an index so we can efficiently query by user residency.

-- Track each explicit consent change event from users in Quebec (Law 25 requirement)
CREATE TABLE IF NOT EXISTS privacy_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_residency TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS privacy_consent_log_user_id_idx
  ON privacy_consent_log (user_id, created_at DESC);
