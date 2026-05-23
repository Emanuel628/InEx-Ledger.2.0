-- =========================================
-- MIGRATION: CAPITAL ASSETS TABLE
-- 2026-05-23
-- =========================================
-- Tracks depreciable capital assets linked to transactions.
-- Supports both CCA (Canada) and MACRS/Section 179 (US) schedules.

CREATE TABLE IF NOT EXISTS capital_assets (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id               UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  transaction_id            UUID REFERENCES transactions(id) ON DELETE SET NULL,
  name                      TEXT NOT NULL,
  purchase_date             DATE NOT NULL,
  original_cost             NUMERIC(14, 2) NOT NULL CHECK (original_cost >= 0),
  asset_category            TEXT NOT NULL,  -- e.g. 'equipment', 'vehicle', 'computer', 'software', 'intangible'
  -- Canada CCA fields
  cca_class                 TEXT,           -- e.g. 'Class 8', 'Class 10', 'Class 12', 'Class 50', 'Class 14.1'
  cca_rate                  NUMERIC(6, 4),  -- e.g. 0.20 for Class 8
  -- US MACRS fields
  macrs_class               TEXT,           -- e.g. '5-year', '7-year'
  section_179_elected       BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_depreciation_pct    NUMERIC(5, 2) CHECK (bonus_depreciation_pct IS NULL OR (bonus_depreciation_pct >= 0 AND bonus_depreciation_pct <= 100)),
  -- Depreciation tracking
  prior_depreciation        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (prior_depreciation >= 0),
  current_year_depreciation NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (current_year_depreciation >= 0),
  remaining_basis           NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (remaining_basis >= 0),
  tax_year                  SMALLINT NOT NULL,
  is_disposed               BOOLEAN NOT NULL DEFAULT FALSE,
  disposed_date             DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_assets_business_year
  ON capital_assets (business_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_capital_assets_transaction
  ON capital_assets (transaction_id) WHERE transaction_id IS NOT NULL;
