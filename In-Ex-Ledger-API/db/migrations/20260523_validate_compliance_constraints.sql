-- =========================================================
-- MAINTENANCE WINDOW MIGRATION: VALIDATE COMPLIANCE CONSTRAINTS
-- 2026-05-23
-- =========================================================
-- Cleans legacy rows that violate the three NOT VALID constraints from
-- 20260523_enforce_compliance_rules.sql, then promotes them to full VALID
-- enforcement so the query planner can use constraint exclusion.
--
-- DO NOT add BEGIN/COMMIT here. The migration runner wraps every file in its
-- own transaction. A COMMIT inside the SQL would prematurely end that
-- transaction and leave the schema_migrations INSERT unprotected.
--
-- Constraint enforcement note:
-- NOT VALID constraints still fire on any row that is INSERT-ed or UPDATE-d,
-- even for columns other than the constrained column. Two separate UPDATEs
-- (one for business_activity_code, another for business_type) would fail
-- because touching business_activity_code on a row that also has an invalid
-- business_type causes PostgreSQL to re-evaluate ALL CHECK constraints on
-- the new row state. The single combined UPDATE below sets both columns in
-- one statement so all constraints see the final NULL values.

UPDATE businesses
   SET
       business_activity_code = CASE
         WHEN business_activity_code IS NOT NULL
              AND business_activity_code !~ '^[0-9]{6}$'
         THEN NULL
         ELSE business_activity_code
       END,
       business_type = CASE
         WHEN business_type IS NOT NULL
              AND business_type NOT IN (
                'sole_proprietorship',
                'single_member_llc',
                'limited_liability_company',
                'corporation',
                'partnership'
              )
         THEN NULL
         WHEN region = 'CA' AND business_type = 'single_member_llc'
         THEN NULL
         ELSE business_type
       END
 WHERE (business_activity_code IS NOT NULL AND business_activity_code !~ '^[0-9]{6}$')
    OR (business_type IS NOT NULL AND business_type NOT IN (
          'sole_proprietorship',
          'single_member_llc',
          'limited_liability_company',
          'corporation',
          'partnership'
        ))
    OR (region = 'CA' AND business_type = 'single_member_llc');

ALTER TABLE businesses VALIDATE CONSTRAINT chk_business_activity_code;
ALTER TABLE businesses VALIDATE CONSTRAINT chk_business_type;
ALTER TABLE businesses VALIDATE CONSTRAINT chk_ca_entity_match;

-- Verification: run this manually after the migration completes to confirm
-- convalidated = true for all three rows.
-- SELECT conname, convalidated, contype
--   FROM pg_constraint
--  WHERE conrelid = 'businesses'::regclass
--    AND conname IN (
--      'chk_business_activity_code',
--      'chk_business_type',
--      'chk_ca_entity_match'
--    )
--  ORDER BY conname;
