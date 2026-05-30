-- =========================================
-- MIGRATION: CORRECT CRA QUICK METHOD RATES
-- 2026-05-30
-- =========================================
-- The original seed used incorrect diagonal remittance rates for several
-- province groups and could not represent Nova Scotia's 2026 split from
-- the other Atlantic HST provinces.

-- Correct 2024/2025 diagonal rates for legacy groups.
INSERT INTO quick_method_rates (province_group, supply_type, hst_rate, remittance_rate, effective_year) VALUES
  ('ON', 'services', 0.13, 0.088, 2024),
  ('ON', 'goods',    0.13, 0.044, 2024),
  ('ON', 'services', 0.13, 0.088, 2025),
  ('ON', 'goods',    0.13, 0.044, 2025),
  ('NS_NB_NL_PEI', 'services', 0.15, 0.100, 2024),
  ('NS_NB_NL_PEI', 'goods',    0.15, 0.050, 2024),
  ('NS_NB_NL_PEI', 'services', 0.15, 0.100, 2025),
  ('NS_NB_NL_PEI', 'goods',    0.15, 0.050, 2025),
  ('NON_HST', 'services', 0.05, 0.036, 2024),
  ('NON_HST', 'goods',    0.05, 0.018, 2024),
  ('NON_HST', 'services', 0.05, 0.036, 2025),
  ('NON_HST', 'goods',    0.05, 0.018, 2025)
ON CONFLICT (province_group, supply_type, effective_year)
DO UPDATE SET
  hst_rate = EXCLUDED.hst_rate,
  remittance_rate = EXCLUDED.remittance_rate;

-- Seed 2026 rates with Nova Scotia split out from NB/NL/PEI.
INSERT INTO quick_method_rates (province_group, supply_type, hst_rate, remittance_rate, effective_year) VALUES
  ('ON', 'services', 0.13, 0.088, 2026),
  ('ON', 'goods',    0.13, 0.044, 2026),
  ('NS', 'services', 0.14, 0.094, 2026),
  ('NS', 'goods',    0.14, 0.047, 2026),
  ('NB_NL_PEI', 'services', 0.15, 0.100, 2026),
  ('NB_NL_PEI', 'goods',    0.15, 0.050, 2026),
  ('NON_HST', 'services', 0.05, 0.036, 2026),
  ('NON_HST', 'goods',    0.05, 0.018, 2026)
ON CONFLICT (province_group, supply_type, effective_year)
DO UPDATE SET
  hst_rate = EXCLUDED.hst_rate,
  remittance_rate = EXCLUDED.remittance_rate;
