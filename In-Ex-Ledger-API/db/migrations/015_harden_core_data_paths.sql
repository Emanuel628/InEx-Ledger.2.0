-- =========================================
-- Harden core operational queries and relationship rules
-- =========================================

CREATE INDEX IF NOT EXISTS accounts_business_id_idx
  ON accounts (business_id);

CREATE INDEX IF NOT EXISTS categories_business_kind_name_idx
  ON categories (business_id, kind, name);

CREATE INDEX IF NOT EXISTS transactions_business_id_date_idx
  ON transactions (business_id, date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS transactions_account_id_idx
  ON transactions (account_id);

CREATE INDEX IF NOT EXISTS transactions_category_id_idx
  ON transactions (category_id);

CREATE INDEX IF NOT EXISTS receipts_business_id_idx
  ON receipts (business_id);

CREATE INDEX IF NOT EXISTS receipts_transaction_id_idx
  ON receipts (transaction_id);

CREATE INDEX IF NOT EXISTS mileage_business_id_trip_date_idx
  ON mileage (business_id, trip_date DESC, created_at DESC);

DO $$
DECLARE
  existing_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel
    ON rel.oid = con.conrelid
  JOIN pg_namespace nsp
    ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att
    ON att.attrelid = rel.oid
   AND att.attnum = ANY (con.conkey)
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'transactions'
    AND att.attname = 'account_id'
  LIMIT 1;

  IF existing_constraint IS NOT NULL
     AND existing_constraint <> 'transactions_account_id_fkey_restrict' THEN
    EXECUTE format(
      'ALTER TABLE transactions DROP CONSTRAINT %I',
      existing_constraint
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_account_id_fkey_restrict'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_account_id_fkey_restrict
      FOREIGN KEY (account_id)
      REFERENCES accounts (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
DECLARE
  existing_constraint TEXT;
BEGIN
  SELECT con.conname
    INTO existing_constraint
  FROM pg_constraint con
  JOIN pg_class rel
    ON rel.oid = con.conrelid
  JOIN pg_namespace nsp
    ON nsp.oid = rel.relnamespace
  JOIN pg_attribute att
    ON att.attrelid = rel.oid
   AND att.attnum = ANY (con.conkey)
  WHERE con.contype = 'f'
    AND nsp.nspname = 'public'
    AND rel.relname = 'transactions'
    AND att.attname = 'category_id'
  LIMIT 1;

  IF existing_constraint IS NOT NULL
     AND existing_constraint <> 'transactions_category_id_fkey_restrict' THEN
    EXECUTE format(
      'ALTER TABLE transactions DROP CONSTRAINT %I',
      existing_constraint
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_category_id_fkey_restrict'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_category_id_fkey_restrict
      FOREIGN KEY (category_id)
      REFERENCES categories (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cleanup_expired_app_tokens()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM verification_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM export_grant_jtis WHERE expires_at < NOW() - INTERVAL '1 day';
  DELETE FROM email_change_requests WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$;
