ALTER TABLE invoices_v1
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_invoices_v1_business_deleted
  ON invoices_v1 (business_id, deleted_at);
