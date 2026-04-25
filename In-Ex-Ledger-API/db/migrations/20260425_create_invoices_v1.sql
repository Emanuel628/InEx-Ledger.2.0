-- Create invoices_v1 table for Pro-plan invoicing (V1 tier, no V2 gate)
CREATE TABLE IF NOT EXISTS invoices_v1 (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_number    TEXT NOT NULL,
  customer_name     TEXT NOT NULL,
  customer_email    TEXT,
  issue_date        DATE NOT NULL,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  currency          TEXT NOT NULL DEFAULT 'CAD',
  line_items        JSONB NOT NULL DEFAULT '[]',
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate          NUMERIC(6,4) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_v1_business_id_idx ON invoices_v1(business_id);
CREATE INDEX IF NOT EXISTS invoices_v1_status_idx ON invoices_v1(business_id, status);
