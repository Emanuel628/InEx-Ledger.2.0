-- Append-only Audit Pivot for transactions
-- Edits no longer overwrite rows; instead they insert an adjustment entry that
-- references the original transaction, preserving an immutable audit trail.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjusted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMPTZ;

-- Index to efficiently fetch all adjustment entries for a given original transaction
CREATE INDEX IF NOT EXISTS transactions_original_transaction_id_idx
  ON transactions (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
