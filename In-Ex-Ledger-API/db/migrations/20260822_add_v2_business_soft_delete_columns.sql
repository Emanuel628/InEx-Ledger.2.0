ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS vendors_business_active_idx
  ON vendors (business_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS customers_business_active_idx
  ON customers (business_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS invoices_business_active_idx
  ON invoices (business_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_id UUID,
  ADD COLUMN IF NOT EXISTS deleted_reason TEXT;

CREATE INDEX IF NOT EXISTS bills_business_active_idx
  ON bills (business_id, created_at DESC)
  WHERE deleted_at IS NULL;
