-- Migration 046: Add 1099-NEC / T4A payer fields to transactions
-- Allows freelancers to tag income by payer and tax form type for year-end reconciliation.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_form_type TEXT
    CHECK (tax_form_type IN ('1099-NEC', '1099-K', 'T4A', 'none') OR tax_form_type IS NULL);

COMMENT ON COLUMN transactions.payer_name IS
  'Optional payer / platform name (e.g. Uber, Fiverr, Stripe) for 1099-NEC / T4A reconciliation';

COMMENT ON COLUMN transactions.tax_form_type IS
  'Tax form type this income will be reported on: 1099-NEC, 1099-K, T4A, or none';
