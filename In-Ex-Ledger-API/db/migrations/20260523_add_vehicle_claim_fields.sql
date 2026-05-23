-- =========================================
-- MIGRATION: VEHICLE EXPENSE CLAIM DETAILS
-- 2026-05-23
-- =========================================
-- Stores per-transaction vehicle claim method and deduction variables.
-- No location or address data is stored (PII-free audit trail).

CREATE TABLE IF NOT EXISTS vehicle_expense_details (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id        UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_year              SMALLINT NOT NULL,
  claim_method          TEXT NOT NULL CHECK (claim_method IN ('mileage', 'actual')),
  -- Mileage method fields
  distance              NUMERIC(10, 2),
  distance_unit         TEXT CHECK (distance_unit IN ('mi', 'km')),
  tax_year_rate         NUMERIC(6, 4),
  -- Actual expense method fields
  business_use_pct      NUMERIC(5, 2) CHECK (business_use_pct IS NULL OR (business_use_pct >= 0 AND business_use_pct <= 100)),
  -- Computed output (stored for audit reproducibility)
  calculated_deduction  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_expense_details_business_year
  ON vehicle_expense_details (business_id, tax_year);
