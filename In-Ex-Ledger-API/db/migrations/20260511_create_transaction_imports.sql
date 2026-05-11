-- Migration: create transaction_imports batch tracking
-- Lets users see, audit, and undo any CSV import batch.

CREATE TABLE IF NOT EXISTS transaction_imports (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'csv',
  filename TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_by_user_id UUID,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'reverted', 'partial')),
  reverted_at TIMESTAMPTZ,
  reverted_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_imports_business
  ON transaction_imports (business_id, created_at DESC);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES transaction_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_source TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_import_batch
  ON transactions (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

COMMENT ON TABLE transaction_imports IS
  'One row per CSV/Plaid/other import batch. Used for history, audit, and undo.';
COMMENT ON COLUMN transactions.import_batch_id IS
  'If set, links this transaction to a transaction_imports row.';
COMMENT ON COLUMN transactions.import_source IS
  'Origin of the transaction: csv, plaid, manual. Null for legacy rows.';
