ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS vehicle_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('expense', 'maintenance')),
  entry_date DATE NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vehicle_costs_business_entry_date_idx
  ON vehicle_costs (business_id, entry_date DESC, created_at DESC);
