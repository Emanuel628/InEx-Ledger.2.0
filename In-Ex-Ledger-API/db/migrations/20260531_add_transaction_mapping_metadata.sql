ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_mapping_reason TEXT,
  ADD COLUMN IF NOT EXISTS category_mapping_confidence TEXT,
  ADD COLUMN IF NOT EXISTS category_mapping_rule_id UUID REFERENCES transaction_mapping_rules(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.category_mapping_reason IS
  'How the current category was assigned during import mapping (mapping_rule, merchant_history, description_history, canonical_rule, review_only_pattern, fallback_imported).';

COMMENT ON COLUMN transactions.category_mapping_confidence IS
  'Confidence band for the current import mapping assignment (high, medium, low, manual).';

COMMENT ON COLUMN transactions.category_mapping_rule_id IS
  'Business-specific rule responsible for the current category assignment, when applicable.';
