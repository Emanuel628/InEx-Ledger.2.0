-- CPA audit logs are immutable append-only records.
-- Drop the business foreign key so deleting a business does not try to mutate
-- historical audit rows via ON DELETE SET NULL.

ALTER TABLE cpa_audit_logs
  DROP CONSTRAINT IF EXISTS cpa_audit_logs_business_id_fkey;
