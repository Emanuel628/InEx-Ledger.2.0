ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS operating_name TEXT;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS business_activity_code TEXT;
