-- Enforce tenant-consistent child links for new review/support writes.
-- Constraints are NOT VALID so historical rows can be audited separately without
-- blocking deploys; PostgreSQL still enforces them for new or updated rows.

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_id_business_id_unique
  ON transactions (id, business_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_id_business_id_unique
  ON receipts (id, business_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_support_artifacts_transaction_business'
  ) THEN
    ALTER TABLE support_artifacts
      ADD CONSTRAINT fk_support_artifacts_transaction_business
      FOREIGN KEY (transaction_id, business_id)
      REFERENCES transactions (id, business_id)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_support_artifacts_legacy_receipt_business'
  ) THEN
    ALTER TABLE support_artifacts
      ADD CONSTRAINT fk_support_artifacts_legacy_receipt_business
      FOREIGN KEY (legacy_receipt_id, business_id)
      REFERENCES receipts (id, business_id)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_transaction_review_states_transaction_business'
  ) THEN
    ALTER TABLE transaction_review_states
      ADD CONSTRAINT fk_transaction_review_states_transaction_business
      FOREIGN KEY (transaction_id, business_id)
      REFERENCES transactions (id, business_id)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vehicle_expense_details_transaction_business'
  ) THEN
    ALTER TABLE vehicle_expense_details
      ADD CONSTRAINT fk_vehicle_expense_details_transaction_business
      FOREIGN KEY (transaction_id, business_id)
      REFERENCES transactions (id, business_id)
      NOT VALID;
  END IF;
END $$;
