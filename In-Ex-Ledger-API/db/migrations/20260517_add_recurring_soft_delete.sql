ALTER TABLE recurring_transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_business_deleted
  ON recurring_transactions (business_id, deleted_at);
