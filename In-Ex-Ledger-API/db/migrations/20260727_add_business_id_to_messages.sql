-- Migration: scope messages to a business
--
-- The messages table (and every route in routes/messages.routes.js) only
-- ever filtered by sender_id/receiver_id (the user), never by business. A
-- user with more than one business therefore saw the same inbox, sent
-- folder, archive, and contact list regardless of which business was
-- currently active — messages created under one business "bled into"
-- every other business on the same account.
--
-- Add business_id and backfill existing rows to each user's oldest
-- business (the same fallback resolveBusinessIdForUser.js uses), which is
-- the best available guess for accounts that only ever had one business —
-- the common case. Accounts that already had multiple businesses before
-- this migration may have some historical rows attributed to the wrong
-- business; there is no other signal to disambiguate them from.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

UPDATE messages m
   SET business_id = COALESCE(
     (SELECT b.id FROM businesses b WHERE b.user_id = m.receiver_id ORDER BY b.created_at ASC, b.id ASC LIMIT 1),
     (SELECT b.id FROM businesses b WHERE b.user_id = m.sender_id ORDER BY b.created_at ASC, b.id ASC LIMIT 1)
   )
 WHERE m.business_id IS NULL;

CREATE INDEX IF NOT EXISTS messages_business_id_idx
  ON messages (business_id, created_at DESC);

COMMENT ON COLUMN messages.business_id IS
  'The business active when this message was created (or, for inbound replies, the business the original thread belongs to). Scopes the inbox/sent/archive views per business.';
