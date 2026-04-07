-- Add encrypted sensitive-field columns for AES-256-GCM at-rest encryption

-- Accounts: store an optional encrypted account number (e.g. last-4, routing, IBAN)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_number_encrypted TEXT;

-- Businesses: store an optional encrypted tax identification number
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tax_id_encrypted TEXT;

-- Transactions: store encrypted description alongside (or replacing) the plain column.
-- The application layer handles encrypt-on-write / decrypt-on-read with a plain-text
-- fallback so that existing rows remain readable during the transition.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS description_encrypted TEXT;
