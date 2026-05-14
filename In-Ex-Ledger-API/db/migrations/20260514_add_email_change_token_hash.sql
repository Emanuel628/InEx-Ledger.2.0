ALTER TABLE email_change_requests
ADD COLUMN IF NOT EXISTS token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_email_change_requests_token_hash
  ON email_change_requests(token_hash);
