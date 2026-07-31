-- =========================================
-- MIGRATION: ADD RECEIPT EVIDENCE STATUS TO TRANSACTIONS
-- 2026-07-31
-- =========================================
-- Tracks, per transaction, whether supporting receipt evidence is on file.
-- This is distinct from the per-file `receipts.review_status` / the
-- `support_artifacts` review workflow: receipt_status is a transaction-level
-- summary a bookkeeper/owner can rely on when assembling records for tax
-- filing, independent of how many receipt files exist.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS receipt_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS receipt_missing_reason TEXT,
  ADD COLUMN IF NOT EXISTS business_purpose TEXT,
  ADD COLUMN IF NOT EXISTS supporting_evidence TEXT,
  ADD COLUMN IF NOT EXISTS receipt_status_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_status_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS chk_transactions_receipt_status;

ALTER TABLE transactions
  ADD CONSTRAINT chk_transactions_receipt_status
  CHECK (receipt_status IN ('pending', 'attached', 'missing', 'not_required'));

-- Backfill: any transaction that already has at least one receipt on file is
-- considered 'attached' rather than left at the default 'pending'.
UPDATE transactions t
   SET receipt_status = 'attached'
  FROM (SELECT DISTINCT transaction_id FROM receipts WHERE transaction_id IS NOT NULL) r
 WHERE r.transaction_id = t.id
   AND t.receipt_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transactions_receipt_status ON transactions (business_id, receipt_status);

COMMENT ON COLUMN transactions.receipt_status IS
  'Evidence status for this transaction: pending (no decision yet), attached (an active receipt file is on record — derived automatically, never set directly by the client), missing (user confirmed no receipt exists, with receipt_missing_reason), not_required (user attested a receipt is not needed for this transaction, with business_purpose).';
COMMENT ON COLUMN transactions.receipt_missing_reason IS
  'User-provided reason a receipt is missing, required when receipt_status = missing.';
COMMENT ON COLUMN transactions.business_purpose IS
  'User-provided business purpose attestation, required when receipt_status = not_required.';
COMMENT ON COLUMN transactions.supporting_evidence IS
  'Optional free-text note describing alternate supporting evidence in lieu of a receipt file.';
COMMENT ON COLUMN transactions.receipt_status_confirmed_at IS
  'Timestamp the current receipt_status was last set (by upload, detach/delete, or explicit user confirmation).';
COMMENT ON COLUMN transactions.receipt_status_confirmed_by IS
  'User who last set the current receipt_status.';
