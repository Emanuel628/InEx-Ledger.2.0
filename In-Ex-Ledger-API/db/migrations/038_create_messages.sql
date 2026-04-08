-- =========================================
-- Message Center: messages & notifications
-- =========================================

CREATE TABLE IF NOT EXISTS messages (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id                UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type             TEXT        NOT NULL DEFAULT 'general'
                                       CHECK (message_type IN ('cpa', 'it_support', 'general', 'support_request')),
  subject                  TEXT,
  body                     TEXT        NOT NULL,
  is_read                  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_archived_by_sender    BOOLEAN     NOT NULL DEFAULT FALSE,
  is_archived_by_receiver  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_deleted_by_sender     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_deleted_by_receiver   BOOLEAN     NOT NULL DEFAULT FALSE,
  parent_id                UUID        REFERENCES messages(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_receiver_id_idx
  ON messages (receiver_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_sender_id_idx
  ON messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_thread_idx
  ON messages (parent_id, created_at ASC);
