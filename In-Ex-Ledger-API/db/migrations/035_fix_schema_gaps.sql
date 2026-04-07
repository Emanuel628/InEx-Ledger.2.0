-- =========================================
-- Fix schema gaps: add columns that were only present in CREATE TABLE IF NOT EXISTS
-- statements and not covered by any ALTER TABLE ADD COLUMN IF NOT EXISTS migration.
-- Required for production databases that had a pre-existing schema.
-- =========================================

-- categories: ensure tax mapping and is_default columns exist
-- (originally defined in 001_init_luna_business.sql CREATE TABLE only)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tax_map_us   TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS tax_map_ca   TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_default   BOOLEAN DEFAULT false;

-- mileage: ensure business_id has NOT NULL enforced
-- Log and remove any orphaned rows (NULL business_id) before adding the constraint
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM mileage WHERE business_id IS NULL;
  IF v_count > 0 THEN
    RAISE NOTICE 'Migration 035: removing % mileage row(s) with NULL business_id', v_count;
    DELETE FROM mileage WHERE business_id IS NULL;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'mileage'
      AND column_name  = 'business_id'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE mileage ALTER COLUMN business_id SET NOT NULL;
  END IF;
END $$;

-- mileage: ensure trip_date and purpose have NOT NULL enforced
-- (migration 015 already backfills NULLs; this enforces the constraint)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'mileage'
      AND column_name  = 'trip_date'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE mileage ALTER COLUMN trip_date SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'mileage'
      AND column_name  = 'purpose'
      AND is_nullable  = 'YES'
  ) THEN
    ALTER TABLE mileage ALTER COLUMN purpose SET NOT NULL;
  END IF;
END $$;
