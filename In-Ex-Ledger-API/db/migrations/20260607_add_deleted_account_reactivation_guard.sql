ALTER TABLE users
  ADD COLUMN IF NOT EXISTS trial_eligible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS deleted_account_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  country TEXT,
  province TEXT,
  had_trial BOOLEAN NOT NULL DEFAULT FALSE,
  had_paid_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reactivated_at TIMESTAMPTZ,
  reactivation_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS deleted_account_records_deleted_at_idx
  ON deleted_account_records (deleted_at DESC);
