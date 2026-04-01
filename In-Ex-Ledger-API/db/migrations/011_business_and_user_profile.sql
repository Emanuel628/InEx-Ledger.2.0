-- Add fiscal year start to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS fiscal_year_start TEXT DEFAULT '01-01';

-- Add province for Canadian tax rates
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS province TEXT;

-- Add user profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Email change requests table
CREATE TABLE IF NOT EXISTS email_change_requests (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_change_requests_user ON email_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_requests_expires ON email_change_requests(expires_at);
