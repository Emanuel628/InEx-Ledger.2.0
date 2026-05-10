-- Fix exports table schema mismatch.
-- The production database has 'type' instead of 'export_type', and is missing
-- status and completed_at columns that migration 008 intended to create.
-- Rename 'type' -> 'export_type' (idempotent), then add missing columns.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exports' AND column_name = 'type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'exports' AND column_name = 'export_type'
  ) THEN
    ALTER TABLE exports RENAME COLUMN type TO export_type;
  END IF;
END $$;

ALTER TABLE exports ADD COLUMN IF NOT EXISTS export_type TEXT NOT NULL DEFAULT 'pdf';
ALTER TABLE exports ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'complete' CHECK (status IN ('pending', 'processing', 'complete', 'failed'));
ALTER TABLE exports ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Widen the export_type check constraint to include csv_full and csv_basic
-- (original constraint only allowed 'csv', 'pdf', 'cpa').
ALTER TABLE exports DROP CONSTRAINT IF EXISTS exports_type_check;
ALTER TABLE exports ADD CONSTRAINT exports_type_check
  CHECK (export_type = ANY (ARRAY['csv'::text, 'csv_full'::text, 'csv_basic'::text, 'pdf'::text, 'cpa'::text]));
