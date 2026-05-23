-- =========================================
-- MIGRATION: ENFORCE TAX COMPLIANCE CONSTRAINTS
-- 2026-05-23
-- =========================================
-- NOT VALID defers validation of existing rows so the migration succeeds
-- against live data that pre-dates these rules. New inserts and updates
-- are checked immediately. Run VALIDATE CONSTRAINT in a maintenance window
-- after cleaning up legacy rows to promote to full enforcement.

-- 1. Enforce strict 6-digit NAICS codes for US and CA
ALTER TABLE businesses
  ADD CONSTRAINT chk_business_activity_code
  CHECK (business_activity_code IS NULL OR business_activity_code ~ '^[0-9]{6}$')
  NOT VALID;

-- 2. Restrict Business Types to strict legal definitions
ALTER TABLE businesses
  ADD CONSTRAINT chk_business_type
  CHECK (business_type IS NULL OR business_type IN (
    'sole_proprietorship',
    'single_member_llc',
    'limited_liability_company',
    'corporation',
    'partnership'
  ))
  NOT VALID;

-- 3. Ensure Canadian businesses do not accidentally use Single Member LLC
ALTER TABLE businesses
  ADD CONSTRAINT chk_ca_entity_match
  CHECK (NOT (region = 'CA' AND business_type = 'single_member_llc'))
  NOT VALID;
