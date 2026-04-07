-- Phase 3: CPA license verification fields on the users table.
-- These columns track whether a user who acts as a CPA has had their
-- professional licence validated through the external verification API.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cpa_license_number      TEXT,
  ADD COLUMN IF NOT EXISTS cpa_license_verified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cpa_license_status       TEXT,
  ADD COLUMN IF NOT EXISTS cpa_license_verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cpa_license_jurisdiction TEXT;

-- Index to quickly look up verified CPAs by licence number
CREATE INDEX IF NOT EXISTS users_cpa_license_number_idx
  ON users (cpa_license_number)
  WHERE cpa_license_number IS NOT NULL;
