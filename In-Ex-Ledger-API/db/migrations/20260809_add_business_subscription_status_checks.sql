-- =========================================
-- MIGRATION: CONSTRAIN BUSINESS SUBSCRIPTION PLAN AND STATUS
-- 2026-08-09
-- =========================================
-- `business_subscriptions` is the source of truth for paid-feature access.
-- Add these invariants as NOT VALID so deployment does not fail on any
-- historical rows; PostgreSQL still enforces the checks for new writes.
-- Validate in a maintenance window after confirming legacy rows are clean.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_business_subscriptions_plan_code'
  ) THEN
    ALTER TABLE business_subscriptions
      ADD CONSTRAINT chk_business_subscriptions_plan_code
      CHECK (plan_code IN ('free', 'v1', 'business'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_business_subscriptions_status'
  ) THEN
    ALTER TABLE business_subscriptions
      ADD CONSTRAINT chk_business_subscriptions_status
      CHECK (
        status IN (
          'free',
          'trialing',
          'active',
          'past_due',
          'unpaid',
          'canceled',
          'incomplete',
          'incomplete_expired',
          'paused'
        )
      )
      NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT chk_business_subscriptions_plan_code ON business_subscriptions IS
  'Allowed internal plan codes: free, v1, business. Added NOT VALID to avoid failing deployment on historical rows; new writes are enforced.';

COMMENT ON CONSTRAINT chk_business_subscriptions_status ON business_subscriptions IS
  'Allowed subscription statuses: app free plus Stripe subscription lifecycle statuses. Added NOT VALID to avoid failing deployment on historical rows; new writes are enforced.';
