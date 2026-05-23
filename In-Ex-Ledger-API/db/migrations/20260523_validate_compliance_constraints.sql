-- =========================================================
-- MAINTENANCE WINDOW MIGRATION: VALIDATE COMPLIANCE CONSTRAINTS
-- 2026-05-23
-- =========================================================
-- Per operational rule: run during off-peak hours.
-- Step 1 nulls out legacy rows that still violate the three NOT VALID
-- constraints added in 20260523_enforce_compliance_rules.sql.
-- Step 2 promotes the constraints to full VALID enforcement so the query
-- planner can use constraint exclusion on these columns.
-- Step 3 verifies all three constraints are active.
--
-- Do not run this while the application is under heavy write load.
-- The VALIDATE CONSTRAINT steps hold ACCESS SHARE locks briefly; they do
-- not block reads but they do prevent concurrent DDL on businesses.

BEGIN;

-- 1a. Null out business_activity_code values that are not exactly 6 digits.
--     Operators must re-enter valid NAICS codes through the Settings UI.
UPDATE businesses
   SET business_activity_code = NULL
 WHERE business_activity_code IS NOT NULL
   AND business_activity_code !~ '^[0-9]{6}$';

-- 1b. Null out business_type values not in the allowed set.
--     Operators must re-select entity type through the Settings UI.
UPDATE businesses
   SET business_type = NULL
 WHERE business_type IS NOT NULL
   AND business_type NOT IN (
     'sole_proprietorship',
     'single_member_llc',
     'limited_liability_company',
     'corporation',
     'partnership'
   );

-- 1c. Null out Single Member LLC for Canadian businesses.
--     The chk_ca_entity_match constraint rejects this combination.
--     Operators must re-select a valid Canadian entity type (sole_proprietorship,
--     corporation, or partnership).
UPDATE businesses
   SET business_type = NULL
 WHERE region = 'CA'
   AND business_type = 'single_member_llc';

-- 2. Promote constraints from NOT VALID to full enforcement.
--    Each VALIDATE CONSTRAINT performs a sequential scan of businesses and
--    confirms no remaining rows violate the rule. After this step the query
--    planner can use constraint exclusion.
ALTER TABLE businesses VALIDATE CONSTRAINT chk_business_activity_code;
ALTER TABLE businesses VALIDATE CONSTRAINT chk_business_type;
ALTER TABLE businesses VALIDATE CONSTRAINT chk_ca_entity_match;

COMMIT;

-- 3. Verification query (run manually after commit to confirm).
--    convalidated = true for all three confirms full enforcement is active.
--    convalidated = false means VALIDATE CONSTRAINT was skipped or failed.
SELECT conname,
       convalidated,
       contype
  FROM pg_constraint
 WHERE conrelid = 'businesses'::regclass
   AND conname IN (
     'chk_business_activity_code',
     'chk_business_type',
     'chk_ca_entity_match'
   )
 ORDER BY conname;
