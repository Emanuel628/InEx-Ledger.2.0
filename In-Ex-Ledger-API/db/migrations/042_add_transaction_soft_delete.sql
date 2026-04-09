-- Soft-delete support for transactions
-- Instead of hard-deleting rows, mark them as voided so the audit trail is preserved.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_is_void_idx
  ON transactions (is_void)
  WHERE is_void = true;
