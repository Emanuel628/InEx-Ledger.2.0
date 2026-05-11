-- Migration: extend messages for invoice email send + inbound replies
--
-- Outbound invoice emails record an 'invoice_sent' message owned by the
-- sender (the user who clicked Email Invoice).
-- Inbound replies from customers arrive via the Resend inbound webhook and
-- become 'invoice_reply' messages. Customers don't have user accounts, so
-- sender_id is null and we capture their email + display name in two new
-- columns.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS external_sender_email TEXT,
  ADD COLUMN IF NOT EXISTS external_sender_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices_v1(id) ON DELETE SET NULL;

ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;

-- Allow new message types alongside the existing CHECK list.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('cpa', 'it_support', 'general', 'support_request', 'invoice_sent', 'invoice_reply'));

CREATE INDEX IF NOT EXISTS messages_invoice_id_idx
  ON messages (invoice_id, created_at DESC)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN messages.external_sender_email IS
  'Email address of an external sender (e.g. a customer replying to an invoice). Used when sender_id is NULL.';
COMMENT ON COLUMN messages.external_sender_name IS
  'Display name parsed from the external sender''s From header, when available.';
COMMENT ON COLUMN messages.invoice_id IS
  'Optional link to the invoice this message relates to (outbound send or inbound reply).';
