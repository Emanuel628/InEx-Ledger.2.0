-- Phase 5: Advanced Financial Forecasting & Analytics
-- Financial goals table for goal-based tracking

CREATE TABLE IF NOT EXISTS financial_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  target_amount   NUMERIC(12, 2) NOT NULL CHECK (target_amount > 0),
  current_amount  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date     DATE,
  category        TEXT        NOT NULL DEFAULT 'savings'
                              CHECK (category IN ('savings', 'taxes', 'emergency', 'purchase', 'vacation', 'other')),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'completed', 'paused')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_goals_business_id_idx
  ON financial_goals (business_id, status, created_at DESC);
