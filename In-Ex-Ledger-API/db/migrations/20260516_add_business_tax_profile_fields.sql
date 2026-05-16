ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS accounting_method TEXT,
  ADD COLUMN IF NOT EXISTS material_participation BOOLEAN,
  ADD COLUMN IF NOT EXISTS gst_hst_registered BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gst_hst_number TEXT,
  ADD COLUMN IF NOT EXISTS gst_hst_method TEXT;
