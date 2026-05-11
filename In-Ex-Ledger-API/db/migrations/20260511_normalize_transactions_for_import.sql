-- Migration: normalize transactions for Plaid + future imports
-- Item 36: every imported transaction should fit a canonical shape with
--   source, external_id, posted_date, merchant_name, pending.
-- The "source" half is already on transactions (import_source); this adds
-- the rest plus a uniqueness constraint to make Plaid /transactions/sync
-- idempotent.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS posted_date DATE,
  ADD COLUMN IF NOT EXISTS merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false;

-- Make (account_id, external_id) unique when external_id is set so
-- repeated Plaid syncs cannot double-insert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_account_external_unique
  ON transactions (account_id, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN transactions.external_id IS
  'Provider-side identifier (e.g. Plaid transaction id). Used for idempotent imports.';
COMMENT ON COLUMN transactions.posted_date IS
  'Date the transaction posted/cleared. Authorized date is in date column.';
COMMENT ON COLUMN transactions.merchant_name IS
  'Normalized merchant name (e.g. "Stripe"), when distinct from description.';
COMMENT ON COLUMN transactions.pending IS
  'True if the bank still considers this transaction pending. Cleared rows are pending=false.';
