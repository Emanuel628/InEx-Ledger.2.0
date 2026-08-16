CREATE TABLE IF NOT EXISTS email_delivery_dedupe (
  dedupe_key TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  business_id UUID NULL REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_email TEXT NULL,
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'sent', 'failed')),
  provider_message_id TEXT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS email_delivery_dedupe_business_category_idx
  ON email_delivery_dedupe (business_id, category);

CREATE INDEX IF NOT EXISTS email_delivery_dedupe_status_updated_idx
  ON email_delivery_dedupe (status, updated_at DESC);
