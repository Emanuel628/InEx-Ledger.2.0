ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS account_category TEXT;

UPDATE accounts
   SET account_category = CASE
     WHEN lower(replace(COALESCE(type, ''), '-', '_')) IN ('checking', 'savings', 'credit_card', 'cash', 'loan', 'custom')
       THEN lower(replace(type, '-', '_'))
     WHEN lower(COALESCE(type, '')) IN ('credit', 'credit card', 'paypal')
       THEN 'credit_card'
     WHEN lower(COALESCE(type, '')) IN ('mortgage', 'student', 'auto', 'commercial', 'construction')
       THEN 'loan'
     WHEN lower(COALESCE(type, '')) IN ('money market', 'cd')
       THEN 'savings'
     WHEN lower(COALESCE(type, '')) IN ('depository', 'prepaid')
       THEN 'cash'
     ELSE 'custom'
   END
 WHERE account_category IS NULL
    OR account_category NOT IN ('checking', 'savings', 'credit_card', 'cash', 'loan', 'custom');

ALTER TABLE accounts
  ALTER COLUMN account_category SET DEFAULT 'custom',
  ALTER COLUMN account_category SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'accounts_account_category_check'
       AND conrelid = 'accounts'::regclass
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_account_category_check
      CHECK (account_category IN ('checking', 'savings', 'credit_card', 'cash', 'loan', 'custom'));
  END IF;
END $$;
