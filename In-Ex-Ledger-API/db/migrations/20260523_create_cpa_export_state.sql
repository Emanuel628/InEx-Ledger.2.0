-- =========================================
-- MIGRATION: CPA EXPORT STATE FOUNDATION
-- 2026-05-23
-- =========================================
-- Establishes the Phase 1 foundation for CPA-ready exports:
--   1. generalized support artifacts
--   2. transaction review state overrides
--   3. immutable export snapshots
--   4. snapshot membership for invalidation / traceability
--
-- This migration is additive and does not replace the current receipts/exports
-- runtime yet. It creates the forward-compatible schema that future services
-- can adopt incrementally.

-- -----------------------------------------
-- 1. Lightweight review workflow fields on transactions
-- -----------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bookkeeping_review_status TEXT NOT NULL DEFAULT 'unreviewed';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_transactions_bookkeeping_review_status'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT chk_transactions_bookkeeping_review_status
      CHECK (bookkeeping_review_status IN ('unreviewed', 'in_review', 'reviewed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_bookkeeping_review_status
  ON transactions (business_id, bookkeeping_review_status);

-- -----------------------------------------
-- 2. Generalized support artifacts
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS support_artifacts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  transaction_id        UUID REFERENCES transactions(id) ON DELETE SET NULL,
  legacy_receipt_id     UUID REFERENCES receipts(id) ON DELETE SET NULL,
  artifact_type         TEXT NOT NULL,
  scope_type            TEXT NOT NULL,
  scope_id              UUID,
  filename              TEXT NOT NULL,
  mime_type             TEXT,
  storage_path          TEXT,
  file_hash             TEXT,
  storage_status        TEXT NOT NULL DEFAULT 'present',
  review_status         TEXT NOT NULL DEFAULT 'pending',
  notes                 TEXT,
  uploaded_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_support_artifacts_type CHECK (
    artifact_type IN (
      'receipt',
      'invoice',
      'mileage_log',
      'allocation_worksheet',
      'home_office_worksheet',
      'capital_asset_support',
      'tax_profile_support',
      'review_note'
    )
  ),
  CONSTRAINT chk_support_artifacts_scope CHECK (
    scope_type IN ('transaction', 'business', 'schedule', 'export')
  ),
  CONSTRAINT chk_support_artifacts_storage_status CHECK (
    storage_status IN ('present', 'missing', 'deleted', 'unavailable')
  ),
  CONSTRAINT chk_support_artifacts_review_status CHECK (
    review_status IN ('pending', 'accepted', 'rejected')
  ),
  CONSTRAINT chk_support_artifacts_scope_link CHECK (
    (scope_type = 'transaction' AND transaction_id IS NOT NULL)
    OR (scope_type <> 'transaction')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_artifacts_legacy_receipt_id
  ON support_artifacts (legacy_receipt_id)
  WHERE legacy_receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_artifacts_business_scope
  ON support_artifacts (business_id, scope_type, artifact_type);

CREATE INDEX IF NOT EXISTS idx_support_artifacts_transaction
  ON support_artifacts (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_artifacts_storage_status
  ON support_artifacts (business_id, storage_status, review_status);

-- Seed existing receipts into the generalized artifact table exactly once.
INSERT INTO support_artifacts (
  business_id,
  transaction_id,
  legacy_receipt_id,
  artifact_type,
  scope_type,
  scope_id,
  filename,
  mime_type,
  storage_path,
  file_hash,
  storage_status,
  review_status,
  uploaded_at,
  created_at,
  updated_at
)
SELECT
  r.business_id,
  r.transaction_id,
  r.id,
  'receipt',
  CASE
    WHEN r.transaction_id IS NOT NULL THEN 'transaction'
    ELSE 'business'
  END,
  CASE
    WHEN r.transaction_id IS NOT NULL THEN r.transaction_id
    ELSE r.business_id
  END,
  r.filename,
  r.mime_type,
  r.storage_path,
  r.file_hash,
  CASE
    WHEN r.storage_path IS NULL OR BTRIM(r.storage_path) = '' THEN 'unavailable'
    ELSE 'present'
  END,
  'accepted',
  COALESCE(r.uploaded_at, NOW()),
  COALESCE(r.uploaded_at, NOW()),
  NOW()
FROM receipts r
LEFT JOIN support_artifacts sa
  ON sa.legacy_receipt_id = r.id
WHERE sa.id IS NULL;

-- -----------------------------------------
-- 3. Transaction review overrides
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS transaction_review_states (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id               UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  business_id                  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bookkeeping_override_status  TEXT,
  support_override_status      TEXT,
  filing_override_status       TEXT,
  issue_code                   TEXT,
  issue_severity               TEXT NOT NULL DEFAULT 'warning',
  issue_status                 TEXT NOT NULL DEFAULT 'open',
  review_notes                 TEXT,
  resolved_by_user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at                  TIMESTAMPTZ,
  created_by_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transaction_review_bookkeeping_override CHECK (
    bookkeeping_override_status IS NULL
    OR bookkeeping_override_status IN ('unreviewed', 'in_review', 'reviewed')
  ),
  CONSTRAINT chk_transaction_review_support_override CHECK (
    support_override_status IS NULL
    OR support_override_status IN (
      'ready',
      'needs_receipt',
      'needs_business_purpose',
      'needs_allocation',
      'needs_mileage_log',
      'needs_home_office_support',
      'needs_capital_asset_support',
      'needs_payer_support',
      'cpa_review'
    )
  ),
  CONSTRAINT chk_transaction_review_filing_override CHECK (
    filing_override_status IS NULL
    OR filing_override_status IN ('blocked', 'warning_only', 'ready')
  ),
  CONSTRAINT chk_transaction_review_issue_severity CHECK (
    issue_severity IN ('warning', 'hard')
  ),
  CONSTRAINT chk_transaction_review_issue_status CHECK (
    issue_status IN ('open', 'resolved', 'waived')
  )
);

CREATE INDEX IF NOT EXISTS idx_transaction_review_states_transaction
  ON transaction_review_states (transaction_id, issue_status);

CREATE INDEX IF NOT EXISTS idx_transaction_review_states_business_status
  ON transaction_review_states (business_id, issue_status, issue_severity);

-- -----------------------------------------
-- 4. Immutable export snapshots
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS export_snapshots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id               UUID REFERENCES exports(id) ON DELETE SET NULL,
  business_id             UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  generated_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  export_mode             TEXT NOT NULL,
  export_format           TEXT NOT NULL,
  jurisdiction            TEXT NOT NULL,
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  dataset_schema_version  TEXT NOT NULL,
  rule_version            TEXT NOT NULL,
  dataset_hash            TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'snapshotted',
  invalidated_at          TIMESTAMPTZ,
  invalidation_reason     TEXT,
  certified_by_user       BOOLEAN NOT NULL DEFAULT FALSE,
  certified_at            TIMESTAMPTZ,
  certified_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_export_snapshots_mode CHECK (
    export_mode IN ('draft', 'workpaper', 'finalized')
  ),
  CONSTRAINT chk_export_snapshots_format CHECK (
    export_format IN ('pdf', 'csv')
  ),
  CONSTRAINT chk_export_snapshots_jurisdiction CHECK (
    jurisdiction IN ('US', 'CA')
  ),
  CONSTRAINT chk_export_snapshots_status CHECK (
    status IN ('ephemeral', 'snapshotted', 'invalidated')
  ),
  CONSTRAINT chk_export_snapshots_date_range CHECK (
    start_date <= end_date
  )
);

CREATE INDEX IF NOT EXISTS idx_export_snapshots_business_created
  ON export_snapshots (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_export_snapshots_status
  ON export_snapshots (business_id, status, export_mode);

-- -----------------------------------------
-- 5. Snapshot membership for invalidation and explainability
-- -----------------------------------------
CREATE TABLE IF NOT EXISTS export_snapshot_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id     UUID NOT NULL REFERENCES export_snapshots(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL,
  item_id         UUID NOT NULL,
  item_hash       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_export_snapshot_items_type CHECK (
    item_type IN ('transaction', 'artifact', 'schedule_input')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_export_snapshot_items_membership
  ON export_snapshot_items (snapshot_id, item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_export_snapshot_items_lookup
  ON export_snapshot_items (item_type, item_id);
