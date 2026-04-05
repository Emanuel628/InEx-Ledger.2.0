ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS fiscal_year_start TEXT DEFAULT '01-01';

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS province TEXT;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_type TEXT;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address TEXT;

UPDATE businesses
SET fiscal_year_start = '01-01'
WHERE fiscal_year_start IS NULL OR fiscal_year_start = '';
