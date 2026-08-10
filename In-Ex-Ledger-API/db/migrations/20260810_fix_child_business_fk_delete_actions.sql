-- destructive-migration-reviewed: Replaces only the newly-added composite
-- child/business foreign keys so their ON DELETE actions match the original
-- single-column child links. No tables or data are dropped.

ALTER TABLE support_artifacts
  DROP CONSTRAINT IF EXISTS fk_support_artifacts_transaction_business;

ALTER TABLE support_artifacts
  ADD CONSTRAINT fk_support_artifacts_transaction_business
  FOREIGN KEY (transaction_id, business_id)
  REFERENCES transactions (id, business_id)
  ON DELETE SET NULL (transaction_id)
  NOT VALID;

ALTER TABLE support_artifacts
  DROP CONSTRAINT IF EXISTS fk_support_artifacts_legacy_receipt_business;

ALTER TABLE support_artifacts
  ADD CONSTRAINT fk_support_artifacts_legacy_receipt_business
  FOREIGN KEY (legacy_receipt_id, business_id)
  REFERENCES receipts (id, business_id)
  ON DELETE SET NULL (legacy_receipt_id)
  NOT VALID;

ALTER TABLE transaction_review_states
  DROP CONSTRAINT IF EXISTS fk_transaction_review_states_transaction_business;

ALTER TABLE transaction_review_states
  ADD CONSTRAINT fk_transaction_review_states_transaction_business
  FOREIGN KEY (transaction_id, business_id)
  REFERENCES transactions (id, business_id)
  ON DELETE CASCADE
  NOT VALID;

ALTER TABLE vehicle_expense_details
  DROP CONSTRAINT IF EXISTS fk_vehicle_expense_details_transaction_business;

ALTER TABLE vehicle_expense_details
  ADD CONSTRAINT fk_vehicle_expense_details_transaction_business
  FOREIGN KEY (transaction_id, business_id)
  REFERENCES transactions (id, business_id)
  ON DELETE CASCADE
  NOT VALID;
