-- Change the default plan_code from 'v1' (Pro) to 'free' so any subscription
-- row inserted without an explicit plan_code is treated as free tier, not Pro.
-- seedDefaultsForBusiness now always inserts an explicit plan_code = 'v1' row
-- for new Pro trials, so existing creation paths are unaffected.
ALTER TABLE business_subscriptions
  ALTER COLUMN plan_code SET DEFAULT 'free';
