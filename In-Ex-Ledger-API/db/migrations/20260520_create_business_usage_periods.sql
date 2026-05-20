-- Basic-tier monthly usage tracking.
--
-- Stores per-business, per-month usage and usage-limit email threshold
-- tracking. Supports the Basic plan caps of 50 transactions / 25 receipts /
-- 50 imported CSV rows per calendar month.
--
-- Notes on the data model:
--   * receipts_used is an authoritative counter. Receipt rows are hard-deleted,
--     so a live COUNT(*) on the receipts table would let a user bypass the cap
--     by deleting and re-uploading. The counter is incremented on upload and
--     never decremented.
--   * transactions_used and csv_import_rows_used are kept here as a synced
--     snapshot for observability. Enforcement reads live counts from the
--     transactions table (transaction rows are soft-deleted, so they remain
--     countable and cannot be bypassed by archiving).
--   * The *_email_*_sent_at columns make usage-limit emails idempotent: one
--     email per threshold per monthly period. A new period row resets them.

CREATE TABLE IF NOT EXISTS business_usage_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  transactions_used integer NOT NULL DEFAULT 0,
  receipts_used integer NOT NULL DEFAULT 0,
  csv_import_rows_used integer NOT NULL DEFAULT 0,
  transaction_email_70_sent_at timestamptz NULL,
  transaction_email_90_sent_at timestamptz NULL,
  transaction_email_100_sent_at timestamptz NULL,
  receipt_email_70_sent_at timestamptz NULL,
  receipt_email_90_sent_at timestamptz NULL,
  receipt_email_100_sent_at timestamptz NULL,
  csv_import_email_70_sent_at timestamptz NULL,
  csv_import_email_90_sent_at timestamptz NULL,
  csv_import_email_100_sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_usage_periods_business_period_unique
  ON business_usage_periods (business_id, period_start);

-- Backfill the current UTC month so enforcement starts from accurate counts
-- on the day this ships rather than resetting every business to zero.
INSERT INTO business_usage_periods (
  business_id, period_start, period_end,
  transactions_used, receipts_used, csv_import_rows_used
)
SELECT
  b.id,
  date_trunc('month', (now() AT TIME ZONE 'UTC'))::date,
  (date_trunc('month', (now() AT TIME ZONE 'UTC')) + interval '1 month')::date,
  COALESCE(tx.cnt, 0),
  COALESCE(rc.cnt, 0),
  COALESCE(csv.cnt, 0)
FROM businesses b
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS cnt
    FROM transactions t
   WHERE t.business_id = b.id
     AND t.created_at >= date_trunc('month', (now() AT TIME ZONE 'UTC'))
     AND (t.is_adjustment = false OR t.is_adjustment IS NULL)
) tx ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS cnt
    FROM receipts r
   WHERE r.business_id = b.id
     AND r.uploaded_at >= date_trunc('month', (now() AT TIME ZONE 'UTC'))
) rc ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS cnt
    FROM transactions t
   WHERE t.business_id = b.id
     AND t.created_at >= date_trunc('month', (now() AT TIME ZONE 'UTC'))
     AND t.import_source = 'csv'
) csv ON true
ON CONFLICT (business_id, period_start) DO NOTHING;
