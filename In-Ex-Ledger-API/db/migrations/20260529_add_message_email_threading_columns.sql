-- Migration: add email-threading columns to messages
--
-- The inbound email webhook (routes/email.routes.js) records the original
-- email's threading headers when it stores an 'invoice_reply' message, and
-- the outbound reply endpoint (routes/messages.routes.js POST /:id/reply-email)
-- reads them back to populate the In-Reply-To / References headers so the
-- conversation threads correctly in the customer's mailbox.
--
-- These three columns were referenced in code but never created by a
-- migration. As a result every inbound reply INSERT failed with
-- "column external_message_id of relation messages does not exist", the
-- error was swallowed as a 500, and customer replies never appeared in the
-- in-app messaging system. Adding the columns restores inbound reply sync.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_message_id  TEXT,
  ADD COLUMN IF NOT EXISTS external_references  TEXT,
  ADD COLUMN IF NOT EXISTS external_in_reply_to TEXT;

COMMENT ON COLUMN messages.external_message_id IS
  'RFC 5322 Message-ID of the inbound email this message was created from (invoice replies).';
COMMENT ON COLUMN messages.external_references IS
  'Raw References header from the inbound email, used to thread outbound replies.';
COMMENT ON COLUMN messages.external_in_reply_to IS
  'Raw In-Reply-To header from the inbound email, used to thread outbound replies.';
