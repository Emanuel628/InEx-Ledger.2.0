-- Structured home-office worksheet inputs, one per business + tax year.
-- Eligible expenses are NOT stored here; they are aggregated at export time
-- from home-office-categorized ledger transactions, so the ledger stays the
-- single source of truth. This table only captures the judgment inputs a CPA
-- needs (area split, method, months used).
CREATE TABLE IF NOT EXISTS home_office_worksheets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_year          SMALLINT NOT NULL,
  method            TEXT NOT NULL DEFAULT 'actual' CHECK (method IN ('actual', 'simplified')),
  total_area_sqft   NUMERIC(10, 2) CHECK (total_area_sqft IS NULL OR total_area_sqft > 0),
  office_area_sqft  NUMERIC(10, 2) CHECK (office_area_sqft IS NULL OR office_area_sqft >= 0),
  months_used       SMALLINT NOT NULL DEFAULT 12 CHECK (months_used BETWEEN 1 AND 12),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_office_worksheets_business_year
  ON home_office_worksheets (business_id, tax_year);

COMMENT ON TABLE home_office_worksheets IS
  'Home-office deduction inputs per business per tax year (US Form 8829 / CA T2125 line 9945). Eligible expenses are aggregated from the ledger at export time.';
COMMENT ON COLUMN home_office_worksheets.method IS
  'actual = business-use percent of eligible home expenses (US actual / CA work-space-in-home); simplified = US-only $5/sq ft up to 300 sq ft.';
