-- =========================================
-- Add storage path for receipts
-- =========================================

ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS storage_path TEXT;
