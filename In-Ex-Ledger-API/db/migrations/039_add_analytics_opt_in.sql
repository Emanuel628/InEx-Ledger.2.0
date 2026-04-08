-- Phase 1: Quebec-specific analytics opt-in column
-- analytics_opt_in is FALSE by default (analytics disabled until explicit consent).
-- Only meaningful for users whose data_residency is 'CA-QC' (Quebec Law 25).
ALTER TABLE user_privacy_settings
  ADD COLUMN IF NOT EXISTS analytics_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
