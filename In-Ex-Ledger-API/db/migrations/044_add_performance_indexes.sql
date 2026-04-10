-- =========================================================
-- Migration 044: Add performance indexes for frequently-queried columns
-- =========================================================

-- Exports: queried by business_id (ORDER BY created_at DESC, LIMIT 50)
CREATE INDEX IF NOT EXISTS exports_business_id_created_idx
  ON exports (business_id, created_at DESC);

-- Exports: queried by user_id in some join paths
CREATE INDEX IF NOT EXISTS exports_user_id_idx
  ON exports (user_id);

-- Export metadata: joined to exports by export_id
CREATE INDEX IF NOT EXISTS export_metadata_export_id_idx
  ON export_metadata (export_id);

-- Messages: inbox/sent queries filter by archived flag
CREATE INDEX IF NOT EXISTS messages_receiver_archived_idx
  ON messages (receiver_id, is_archived_by_receiver, is_deleted_by_receiver, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_archived_idx
  ON messages (sender_id, is_archived_by_sender, is_deleted_by_sender, created_at DESC);

-- Refresh tokens: cleanup queries filter by expiry
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_at_revoked_idx
  ON refresh_tokens (expires_at, revoked)
  WHERE revoked = FALSE;

-- CPA access grants: queried by business_id for scope lookups
CREATE INDEX IF NOT EXISTS cpa_access_grants_business_id_idx
  ON cpa_access_grants (business_id, status);
