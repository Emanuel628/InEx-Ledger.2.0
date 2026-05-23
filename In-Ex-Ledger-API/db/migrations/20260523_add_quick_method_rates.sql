-- =========================================
-- MIGRATION: CRA QUICK METHOD RATE TABLE
-- 2026-05-23
-- =========================================
-- Stores ETA Quick Method remittance rates by province group and supply type.
-- Rates are set by CRA and updated annually (or when HST rates change).

CREATE TABLE IF NOT EXISTS quick_method_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_group TEXT NOT NULL,  -- 'ON', 'NS_NB_NL_PEI', 'BC_MB_SK_AB_QC_NON_HST'
  supply_type    TEXT NOT NULL CHECK (supply_type IN ('services', 'goods')),
  hst_rate       NUMERIC(5, 4) NOT NULL,
  remittance_rate NUMERIC(5, 4) NOT NULL,
  effective_year SMALLINT NOT NULL,
  UNIQUE (province_group, supply_type, effective_year)
);

-- ----------------------------------------
-- Seed: 2024 and 2025 rates
-- Source: CRA RC4058 Quick Method of Accounting
-- ----------------------------------------

-- Ontario (13% HST)
INSERT INTO quick_method_rates (province_group, supply_type, hst_rate, remittance_rate, effective_year) VALUES
  ('ON', 'services', 0.13, 0.088, 2024),
  ('ON', 'goods',    0.13, 0.018, 2024),
  ('ON', 'services', 0.13, 0.088, 2025),
  ('ON', 'goods',    0.13, 0.018, 2025)
ON CONFLICT (province_group, supply_type, effective_year) DO NOTHING;

-- Nova Scotia, New Brunswick, Newfoundland & Labrador, PEI (15% HST)
INSERT INTO quick_method_rates (province_group, supply_type, hst_rate, remittance_rate, effective_year) VALUES
  ('NS_NB_NL_PEI', 'services', 0.15, 0.105, 2024),
  ('NS_NB_NL_PEI', 'goods',    0.15, 0.025, 2024),
  ('NS_NB_NL_PEI', 'services', 0.15, 0.105, 2025),
  ('NS_NB_NL_PEI', 'goods',    0.15, 0.025, 2025)
ON CONFLICT (province_group, supply_type, effective_year) DO NOTHING;

-- BC, MB, SK, AB, QC and all non-HST provinces (GST 5% only)
INSERT INTO quick_method_rates (province_group, supply_type, hst_rate, remittance_rate, effective_year) VALUES
  ('NON_HST', 'services', 0.05, 0.036, 2024),
  ('NON_HST', 'goods',    0.05, 0.010, 2024),
  ('NON_HST', 'services', 0.05, 0.036, 2025),
  ('NON_HST', 'goods',    0.05, 0.010, 2025)
ON CONFLICT (province_group, supply_type, effective_year) DO NOTHING;
