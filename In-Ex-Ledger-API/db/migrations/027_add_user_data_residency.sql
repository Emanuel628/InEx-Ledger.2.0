-- Add data_residency column to users for jurisdiction tracking (PIPEDA / Quebec Law 25)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS data_residency TEXT GENERATED ALWAYS AS (
    CASE
      WHEN country = 'CA' AND province = 'QC' THEN 'CA-QC'
      WHEN country = 'CA' THEN 'CA'
      WHEN country IS NOT NULL THEN country
      ELSE 'US'
    END
  ) STORED;
