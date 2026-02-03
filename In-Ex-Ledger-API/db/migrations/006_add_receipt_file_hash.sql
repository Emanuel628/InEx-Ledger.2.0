-- =========================================
-- Add file_hash column to receipts
-- =========================================

ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS file_hash TEXT;

