CREATE TABLE IF NOT EXISTS business_email_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_count INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, reminder_key)
);

CREATE INDEX IF NOT EXISTS business_email_reminders_business_id_idx
  ON business_email_reminders (business_id, reminder_key);

CREATE INDEX IF NOT EXISTS business_email_reminders_last_sent_at_idx
  ON business_email_reminders (last_sent_at DESC);
