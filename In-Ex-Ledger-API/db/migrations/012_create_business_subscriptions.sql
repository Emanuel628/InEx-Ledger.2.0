CREATE TABLE IF NOT EXISTS business_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  plan_code TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'trialing',
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_status
  ON business_subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_business_subscriptions_trial_ends
  ON business_subscriptions(trial_ends_at);
