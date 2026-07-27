-- Invoice title was previously just an alias for the first line item's
-- description, so editing the line item silently rewrote the invoice title
-- shown in the list. Give invoices a real, independent title column.
ALTER TABLE invoices_v1
ADD COLUMN IF NOT EXISTS title TEXT;

UPDATE invoices_v1
SET title = COALESCE(
  NULLIF(BTRIM(line_items->0->>'description'), ''),
  NULLIF(BTRIM(invoice_number), ''),
  'Untitled invoice'
)
WHERE title IS NULL;

ALTER TABLE invoices_v1
ALTER COLUMN title SET NOT NULL;
