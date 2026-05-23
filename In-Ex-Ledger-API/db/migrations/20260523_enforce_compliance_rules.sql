-- =========================================
-- MIGRATION: ENFORCE TAX COMPLIANCE CONSTRAINTS
-- 2026-05-23
-- =========================================
-- NOTE: These CHECK constraints validate ALL existing rows at migration time.
-- If the businesses table contains business_type or business_activity_code
-- values outside the allowed sets, this migration will fail. Remediate
-- existing rows before running, or add NOT VALID if deferred validation
-- is acceptable for your deployment.

-- 1. Enforce strict 6-digit NAICS codes for US and CA
ALTER TABLE businesses
  ADD CONSTRAINT chk_business_activity_code
  CHECK (business_activity_code IS NULL OR business_activity_code ~ '^[0-9]{6}$');

-- 2. Restrict Business Types to strict legal definitions
ALTER TABLE businesses
  ADD CONSTRAINT chk_business_type
  CHECK (business_type IS NULL OR business_type IN (
    'sole_proprietorship',
    'single_member_llc',
    'limited_liability_company',
    'corporation',
    'partnership'
  ));

-- 3. Ensure Canadian businesses do not accidentally use Single Member LLC
ALTER TABLE businesses
  ADD CONSTRAINT chk_ca_entity_match
  CHECK (NOT (region = 'CA' AND business_type = 'single_member_llc'));
