-- Migration: bank-import abstraction
-- Item 35: design the bank-import model now so Plaid plugs in cleanly later.
--
-- We extend the existing accounts table rather than create a parallel
-- bank_accounts table, since an "account" is what users already see in the
-- UI. Imports (CSV today, Plaid later) attach to those accounts.

CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('plaid', 'manual')),
  external_item_id TEXT,
  institution_name TEXT,
  institution_logo_url TEXT,
  access_token_encrypted TEXT,
  cursor TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'reauth_required', 'disconnected', 'error')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, provider, external_item_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_connections_business_status
  ON bank_connections (business_id, status);

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS bank_connection_id UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_account_id TEXT,
  ADD COLUMN IF NOT EXISTS account_mask TEXT,
  ADD COLUMN IF NOT EXISTS account_subtype TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'csv', 'plaid'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_connection_external_unique
  ON accounts (bank_connection_id, external_account_id)
  WHERE bank_connection_id IS NOT NULL AND external_account_id IS NOT NULL;

COMMENT ON TABLE bank_connections IS
  'One row per bank linkage (Plaid item, or a manual placeholder for CSV-only banks). Plaid access tokens are stored encrypted.';
COMMENT ON COLUMN bank_connections.cursor IS
  'Provider sync cursor (e.g. Plaid /transactions/sync cursor) so we resume incrementally on the next fetch.';
COMMENT ON COLUMN accounts.source IS
  'Where this account originated: manual, csv (created during a CSV import), or plaid.';
