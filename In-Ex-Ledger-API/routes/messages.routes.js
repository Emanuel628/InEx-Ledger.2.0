const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter({ max: 120 }));

const VALID_MESSAGE_TYPES = new Set(["cpa", "it_support", "general", "support_request"]);
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 10000;
const MAX_PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function mapMessageRow(row, viewerId) {
  const isSender = row.sender_id === viewerId;
  const isArchived = isSender ? row.is_archived_by_sender : row.is_archived_by_receiver;
  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.sender_name || null,
    sender_email: row.sender_email || null,
    receiver_id: row.receiver_id,
    receiver_name: row.receiver_name || null,
    receiver_email: row.receiver_email || null,
    message_type: row.message_type,
    subject: row.subject || null,
    body: row.body,
    is_read: row.is_read,
    is_archived: isArchived || false,
    parent_id: row.parent_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// GET /api/messages/unread-count
// Lightweight endpoint polled by the frontend for notification badge.
router.get("/unread-count", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM messages
        WHERE receiver_id = $1
          AND is_read = FALSE
          AND is_deleted_by_receiver = FALSE`,
      [req.user.id]
    );
    res.json({ count: result.rows[0]?.count ?? 0 });
  } catch (err) {
    logError("GET /messages/unread-count error:", err.message);
    res.status(500).json({ error: "Failed to fetch unread count." });
  }
});

// GET /api/messages/contacts
// Returns users that the current user is permitted to message.
// A user may message:
//   - Any CPA who has been granted access to one of their businesses
//   - Any client whose business they have been granted CPA access to
//   - Anyone who has previously sent them a message (reply flow)
//   - Users with role = 'it_support' or 'admin' (support channel)
router.get("/contacts", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id,
              COALESCE(u.display_name, u.full_name, u.email) AS name,
              u.email,
              u.role
         FROM users u
        WHERE u.id != $1
          AND (
            -- CPAs granted access to this user's businesses
            EXISTS (
              SELECT 1 FROM cpa_access_grants g
               JOIN businesses b ON b.id = g.business_id
              WHERE b.user_id = $1
                AND g.grantee_user_id = u.id
                AND g.status IN ('active', 'pending')
            )
            -- Businesses this user (acting as CPA) was granted access to
            OR EXISTS (
              SELECT 1 FROM cpa_access_grants g
               JOIN businesses b ON b.id = g.business_id
              WHERE g.grantee_user_id = $1
                AND b.user_id = u.id
                AND g.status IN ('active', 'pending')
            )
            -- Previously exchanged messages (reply flow)
            OR EXISTS (
              SELECT 1 FROM messages m
              WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                 OR (m.receiver_id = $1 AND m.sender_id = u.id)
            )
            -- Support staff — always visible
            OR u.role IN ('it_support', 'admin')
          )
        ORDER BY name ASC
        LIMIT 200`,
      [req.user.id]
    );

    const contacts = rows
      .filter((r) => isUuid(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role
      }));

    res.json({ contacts });
  } catch (err) {
    logError("GET /messages/contacts error:", err.message);
    res.status(500).json({ error: "Failed to fetch contacts." });
  }
});

// GET /api/messages/inbox
router.get("/inbox", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), MAX_PAGE_SIZE);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const archived = req.query.archived === "true";

    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         JOIN users r ON r.id = m.receiver_id
        WHERE m.receiver_id = $1
          AND m.is_deleted_by_receiver = FALSE
          AND m.is_archived_by_receiver = $2
        ORDER BY m.created_at DESC
        LIMIT $3 OFFSET $4`,
      [req.user.id, archived, limit, offset]
    );

    res.json({ messages: rows.map((r) => mapMessageRow(r, req.user.id)) });
  } catch (err) {
    logError("GET /messages/inbox error:", err.message);
    res.status(500).json({ error: "Failed to fetch inbox." });
  }
});

// GET /api/messages/sent
router.get("/sent", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), MAX_PAGE_SIZE);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const archived = req.query.archived === "true";

    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         JOIN users r ON r.id = m.receiver_id
        WHERE m.sender_id = $1
          AND m.is_deleted_by_sender = FALSE
          AND m.is_archived_by_sender = $2
        ORDER BY m.created_at DESC
        LIMIT $3 OFFSET $4`,
      [req.user.id, archived, limit, offset]
    );

    res.json({ messages: rows.map((r) => mapMessageRow(r, req.user.id)) });
  } catch (err) {
    logError("GET /messages/sent error:", err.message);
    res.status(500).json({ error: "Failed to fetch sent messages." });
  }
});

// GET /api/messages/archived
// Returns archived messages for both inbox and sent conversations.
router.get("/archived", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), MAX_PAGE_SIZE);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         JOIN users r ON r.id = m.receiver_id
        WHERE (
          m.receiver_id = $1
          AND m.is_deleted_by_receiver = FALSE
          AND m.is_archived_by_receiver = TRUE
        ) OR (
          m.sender_id = $1
          AND m.is_deleted_by_sender = FALSE
          AND m.is_archived_by_sender = TRUE
        )
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    res.json({ messages: rows.map((r) => mapMessageRow(r, req.user.id)) });
  } catch (err) {
    logError("GET /messages/archived error:", err.message);
    res.status(500).json({ error: "Failed to fetch archived messages." });
  }
});

// GET /api/messages/:id
// Fetches a single message and marks it as read if the current user is the receiver.
router.get("/:id", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }
    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         JOIN users r ON r.id = m.receiver_id
        WHERE m.id = $1
          AND (
            (m.receiver_id = $2 AND m.is_deleted_by_receiver = FALSE)
            OR (m.sender_id = $2 AND m.is_deleted_by_sender = FALSE)
          )
        LIMIT 1`,
      [messageId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Message not found." });
    }

    const msg = rows[0];

    // Mark as read when the receiver opens it
    if (msg.receiver_id === req.user.id && !msg.is_read) {
      await pool.query(
        "UPDATE messages SET is_read = TRUE, updated_at = NOW() WHERE id = $1",
        [msg.id]
      );
      msg.is_read = true;
    }

    res.json({ message: mapMessageRow(msg, req.user.id) });
  } catch (err) {
    logError("GET /messages/:id error:", err.message);
    res.status(500).json({ error: "Failed to fetch message." });
  }
});

// POST /api/messages
// Send a new message (or reply when parent_id is provided).
router.post("/", async (req, res) => {
  const receiverId = String(req.body?.receiver_id || "").trim();
  const messageType = String(req.body?.message_type || "general").trim();
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  const parentId = req.body?.parent_id ? String(req.body.parent_id).trim() : null;

  if (!receiverId) {
    return res.status(400).json({ error: "receiver_id is required." });
  }
  if (!isUuid(receiverId)) {
    return res.status(400).json({ error: "receiver_id must be a valid UUID." });
  }
  if (receiverId === req.user.id) {
    return res.status(400).json({ error: "You cannot send a message to yourself." });
  }
  if (!VALID_MESSAGE_TYPES.has(messageType)) {
    return res.status(400).json({ error: `message_type must be one of: ${[...VALID_MESSAGE_TYPES].join(", ")}.` });
  }
  if (!body) {
    return res.status(400).json({ error: "Message body is required." });
  }
  if (body.length > MAX_BODY_LEN) {
    return res.status(400).json({ error: `Message body must not exceed ${MAX_BODY_LEN} characters.` });
  }
  if (subject && subject.length > MAX_SUBJECT_LEN) {
    return res.status(400).json({ error: `Subject must not exceed ${MAX_SUBJECT_LEN} characters.` });
  }
  if (parentId && !isUuid(parentId)) {
    return res.status(400).json({ error: "parent_id must be a valid UUID when provided." });
  }

  try {
    // Verify receiver exists
    const receiverCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1 LIMIT 1",
      [receiverId]
    );
    if (!receiverCheck.rowCount) {
      return res.status(404).json({ error: "Receiver not found." });
    }

    // Enforce contact allowlist: sender must be permitted to contact the receiver.
    // Mirrors the logic in GET /contacts.
    const receiver = receiverCheck.rows[0];
    const isSupportStaff = receiver.role === "it_support" || receiver.role === "admin";
    if (!isSupportStaff) {
      const contactCheck = await pool.query(
        `SELECT 1
           FROM users u
          WHERE u.id = $2
            AND (
              -- Receiver is a CPA granted access to one of sender's businesses
              EXISTS (
                SELECT 1 FROM cpa_access_grants g
                 JOIN businesses b ON b.id = g.business_id
                WHERE b.user_id = $1
                  AND g.grantee_user_id = u.id
                  AND g.status IN ('active', 'pending')
              )
              -- Receiver is a client whose business sender (acting as CPA) was granted access to
              OR EXISTS (
                SELECT 1 FROM cpa_access_grants g
                 JOIN businesses b ON b.id = g.business_id
                WHERE g.grantee_user_id = $1
                  AND b.user_id = u.id
                  AND g.status IN ('active', 'pending')
              )
              -- Prior message exchange exists (reply flow)
              OR EXISTS (
                SELECT 1 FROM messages m
                WHERE (m.sender_id = $1 AND m.receiver_id = u.id)
                   OR (m.receiver_id = $1 AND m.sender_id = u.id)
              )
            )
          LIMIT 1`,
        [req.user.id, receiverId]
      );
      if (!contactCheck.rowCount) {
        return res.status(403).json({ error: "You are not permitted to message this user." });
      }
    }

    // Verify parent message exists and belongs to this conversation (if provided)
    if (parentId) {
      const parentCheck = await pool.query(
        `SELECT id FROM messages
          WHERE id = $1
            AND (
              (sender_id = $2 AND receiver_id = $3)
              OR (sender_id = $3 AND receiver_id = $2)
            )
          LIMIT 1`,
        [parentId, req.user.id, receiverId]
      );
      if (!parentCheck.rowCount) {
        return res.status(400).json({ error: "Invalid parent message." });
      }
    }

    const result = await pool.query(
      `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        crypto.randomUUID(),
        req.user.id,
        receiverId,
        messageType,
        subject || null,
        body,
        parentId || null
      ]
    );

    // Fetch display names for the response
    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email
         FROM messages m
         JOIN users s ON s.id = m.sender_id
         JOIN users r ON r.id = m.receiver_id
        WHERE m.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({ message: mapMessageRow(rows[0], req.user.id) });
  } catch (err) {
    logError("POST /messages error:", err.message);
    res.status(500).json({ error: "Failed to send message." });
  }
});

// PATCH /api/messages/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }
    const result = await pool.query(
      `UPDATE messages
          SET is_read = TRUE, updated_at = NOW()
        WHERE id = $1
          AND receiver_id = $2
          AND is_deleted_by_receiver = FALSE
        RETURNING id, is_read`,
      [messageId, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Message not found." });
    }

    res.json({ success: true, id: result.rows[0].id, is_read: true });
  } catch (err) {
    logError("PATCH /messages/:id/read error:", err.message);
    res.status(500).json({ error: "Failed to mark message as read." });
  }
});

// PATCH /api/messages/:id/archive
// Toggles archive status for the current user.
router.patch("/:id/archive", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }
    // Determine which column to toggle
    const msgCheck = await pool.query(
      `SELECT id, sender_id, receiver_id,
              is_archived_by_sender, is_archived_by_receiver
         FROM messages
        WHERE id = $1
          AND (sender_id = $2 OR receiver_id = $2)
        LIMIT 1`,
      [messageId, req.user.id]
    );

    if (!msgCheck.rowCount) {
      return res.status(404).json({ error: "Message not found." });
    }

    const msg = msgCheck.rows[0];

    if (msg.receiver_id === req.user.id) {
      const next = !msg.is_archived_by_receiver;
      await pool.query(
        "UPDATE messages SET is_archived_by_receiver = $1, updated_at = NOW() WHERE id = $2",
        [next, msg.id]
      );
      res.json({ success: true, archived: next });
    } else {
      const next = !msg.is_archived_by_sender;
      await pool.query(
        "UPDATE messages SET is_archived_by_sender = $1, updated_at = NOW() WHERE id = $2",
        [next, msg.id]
      );
      res.json({ success: true, archived: next });
    }
  } catch (err) {
    logError("PATCH /messages/:id/archive error:", err.message);
    res.status(500).json({ error: "Failed to archive message." });
  }
});

// PATCH /api/messages/:id/resolve
// Marks a support/CPA message as resolved (sets message_type to 'resolved' placeholder).
// Implemented as setting review_resolved flag via archived_by_sender (sender side).
router.patch("/:id/resolve", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }
    const result = await pool.query(
      `UPDATE messages
          SET is_archived_by_sender = TRUE, updated_at = NOW()
        WHERE id = $1
          AND sender_id = $2
          AND is_deleted_by_sender = FALSE
        RETURNING id`,
      [messageId, req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: "Message not found." });
    }

    res.json({ success: true });
  } catch (err) {
    logError("PATCH /messages/:id/resolve error:", err.message);
    res.status(500).json({ error: "Failed to resolve message." });
  }
});

// DELETE /api/messages/:id
// Soft-deletes the message for the current user.
router.delete("/:id", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }
    const msgCheck = await pool.query(
      `SELECT id, sender_id, receiver_id
         FROM messages
        WHERE id = $1
          AND (sender_id = $2 OR receiver_id = $2)
        LIMIT 1`,
      [messageId, req.user.id]
    );

    if (!msgCheck.rowCount) {
      return res.status(404).json({ error: "Message not found." });
    }

    const msg = msgCheck.rows[0];

    if (msg.receiver_id === req.user.id) {
      await pool.query(
        "UPDATE messages SET is_deleted_by_receiver = TRUE, updated_at = NOW() WHERE id = $1",
        [msg.id]
      );
    } else {
      await pool.query(
        "UPDATE messages SET is_deleted_by_sender = TRUE, updated_at = NOW() WHERE id = $1",
        [msg.id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    logError("DELETE /messages/:id error:", err.message);
    res.status(500).json({ error: "Failed to delete message." });
  }
});

module.exports = router;
