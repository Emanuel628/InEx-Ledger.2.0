ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance_as_of DATE;

COMMENT ON COLUMN accounts.opening_balance IS
  'Opening balance imported when a business starts using the ledger midstream.';

COMMENT ON COLUMN accounts.opening_balance_as_of IS
  'Effective date for the imported opening balance, if provided by the business.';
