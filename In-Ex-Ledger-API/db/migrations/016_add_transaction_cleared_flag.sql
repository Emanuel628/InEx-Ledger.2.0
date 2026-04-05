-- =========================================
-- Add reconciliation status to transactions
-- =========================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS cleared BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS transactions_business_id_cleared_idx
  ON transactions (business_id, cleared, date DESC);
