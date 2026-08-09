-- =========================================
-- MIGRATION: CONSTRAIN TRANSACTION REVIEW STATUS
-- 2026-08-09
-- =========================================
-- `review_status` drives user-visible review queues and export readiness.
-- Add the database invariant as NOT VALID so live databases with historical
-- rows can deploy safely; PostgreSQL still checks all new inserts and updates.
-- Validate in a maintenance window after confirming there are no legacy values
-- outside this set.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_transactions_review_status'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_review_status
      CHECK (review_status IN ('needs_review', 'ready', 'matched', 'locked'))
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT chk_transactions_review_status ON transactions IS
  'Allowed transaction review states: needs_review, ready, matched, locked. Added NOT VALID to avoid failing deployment on historical rows; new writes are enforced.';
