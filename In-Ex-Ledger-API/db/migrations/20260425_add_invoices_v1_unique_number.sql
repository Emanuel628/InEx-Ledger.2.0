CREATE UNIQUE INDEX IF NOT EXISTS invoices_v1_business_invoice_number_unique
  ON invoices_v1 (business_id, invoice_number);
