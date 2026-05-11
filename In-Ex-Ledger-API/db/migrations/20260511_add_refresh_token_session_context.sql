-- Migration: enrich refresh_tokens with session context for the
-- user-facing "active sessions" view (item 23).

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS device_label TEXT;

COMMENT ON COLUMN refresh_tokens.last_used_at IS
  'Updated on each successful /auth/refresh exchange so users can see when a session was last active.';
COMMENT ON COLUMN refresh_tokens.ip_address IS
  'Best-effort IP captured at issuance/refresh. May be null for legacy rows.';
COMMENT ON COLUMN refresh_tokens.user_agent IS
  'Raw user-agent string at issuance (truncated to 512 chars). May be null for legacy rows.';
COMMENT ON COLUMN refresh_tokens.device_label IS
  'Friendly device label derived from user_agent (e.g. "Chrome on Mac"). May be null for legacy rows.';
