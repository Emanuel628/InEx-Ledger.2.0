-- =========================================
-- Add CPA-ready edge case metadata to transactions
-- =========================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS currency TEXT,
ADD COLUMN IF NOT EXISTS source_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8),
ADD COLUMN IF NOT EXISTS exchange_date DATE,
ADD COLUMN IF NOT EXISTS converted_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS tax_treatment TEXT,
ADD COLUMN IF NOT EXISTS indirect_tax_amount NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS indirect_tax_recoverable BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS personal_use_pct NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'ready',
ADD COLUMN IF NOT EXISTS review_notes TEXT;

UPDATE transactions t
SET currency = COALESCE(t.currency, CASE WHEN b.region = 'CA' THEN 'CAD' ELSE 'USD' END),
    converted_amount = COALESCE(t.converted_amount, t.amount),
    tax_treatment = COALESCE(
      t.tax_treatment,
      CASE WHEN t.type = 'income' THEN 'income' ELSE 'operating' END
    )
FROM businesses b
WHERE b.id = t.business_id
  AND (
    t.currency IS NULL
    OR t.converted_amount IS NULL
    OR t.tax_treatment IS NULL
  );

ALTER TABLE transactions
ALTER COLUMN currency SET NOT NULL,
ALTER COLUMN currency SET DEFAULT 'USD',
ALTER COLUMN converted_amount SET NOT NULL,
ALTER COLUMN converted_amount SET DEFAULT 0,
ALTER COLUMN tax_treatment SET NOT NULL,
ALTER COLUMN tax_treatment SET DEFAULT 'operating',
ALTER COLUMN review_status SET NOT NULL,
ALTER COLUMN review_status SET DEFAULT 'ready';

UPDATE transactions
SET converted_amount = amount
WHERE converted_amount IS NULL;

UPDATE transactions
SET review_status = COALESCE(NULLIF(review_status, ''), 'ready');
