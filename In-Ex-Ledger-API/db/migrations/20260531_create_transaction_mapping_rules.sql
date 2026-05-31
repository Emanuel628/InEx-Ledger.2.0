CREATE TABLE IF NOT EXISTS transaction_mapping_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  transaction_kind TEXT NOT NULL CHECK (transaction_kind IN ('income', 'expense')),
  match_field TEXT NOT NULL CHECK (match_field IN ('merchant_name', 'category_guess', 'description')),
  match_operator TEXT NOT NULL DEFAULT 'equals' CHECK (match_operator IN ('equals')),
  match_value TEXT NOT NULL,
  match_value_normalized TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('confirmed', 'learned')),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_mapping_rules_unique_match
  ON transaction_mapping_rules (business_id, transaction_kind, match_field, match_value_normalized);

CREATE INDEX IF NOT EXISTS idx_tx_mapping_rules_business_kind
  ON transaction_mapping_rules (business_id, transaction_kind, match_field);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_guess TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS category_mapping_reason TEXT,
  ADD COLUMN IF NOT EXISTS category_mapping_confidence TEXT,
  ADD COLUMN IF NOT EXISTS category_mapping_rule_id UUID REFERENCES transaction_mapping_rules(id) ON DELETE SET NULL;

COMMENT ON TABLE transaction_mapping_rules IS
  'Business-specific import categorization rules learned from confirmed user categorizations or created explicitly later.';

COMMENT ON COLUMN transactions.category_guess IS
  'Provider/import category hint (for example Plaid personal finance category) retained for mapping and review.';
COMMENT ON COLUMN transactions.category_mapping_reason IS
  'How the current category was assigned during import mapping (mapping_rule, merchant_history, description_history, canonical_rule, review_only_pattern, fallback_imported).';
COMMENT ON COLUMN transactions.category_mapping_confidence IS
  'Confidence band for the current import mapping assignment (high, medium, low, manual).';
COMMENT ON COLUMN transactions.category_mapping_rule_id IS
  'Business-specific rule responsible for the current category assignment, when applicable.';
