ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS locked_through_date DATE,
  ADD COLUMN IF NOT EXISTS locked_period_note TEXT,
  ADD COLUMN IF NOT EXISTS locked_period_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_period_updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS transactions_active_business_date_idx
  ON transactions (business_id, date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_deleted_at_idx
  ON transactions (deleted_at)
  WHERE deleted_at IS NOT NULL;
