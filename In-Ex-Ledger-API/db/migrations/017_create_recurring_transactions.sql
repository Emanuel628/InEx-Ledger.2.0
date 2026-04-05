-- =========================================
-- Recurring transaction templates and runs
-- =========================================

CREATE TABLE IF NOT EXISTS recurring_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  description TEXT NOT NULL,
  note TEXT,
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly','biweekly','monthly','quarterly','yearly')),
  start_date DATE NOT NULL,
  next_run_date DATE NOT NULL,
  end_date DATE,
  last_run_date DATE,
  cleared_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS recurring_transactions_business_id_active_idx
  ON recurring_transactions (business_id, active, next_run_date);

CREATE TABLE IF NOT EXISTS recurring_transaction_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_transaction_id UUID NOT NULL REFERENCES recurring_transactions(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recurring_transaction_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS recurring_transaction_runs_business_id_occurrence_idx
  ON recurring_transaction_runs (business_id, occurrence_date DESC);

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurring_transaction_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS recurring_occurrence_date DATE;

CREATE INDEX IF NOT EXISTS transactions_recurring_transaction_id_idx
  ON transactions (recurring_transaction_id);
