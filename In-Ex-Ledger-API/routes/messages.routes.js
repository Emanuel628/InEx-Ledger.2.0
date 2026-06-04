const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const { Resend } = require("resend");
const { getInvoiceFromEmail, buildReplyToAddress } = require("../services/invoiceEmailService.js");
const {
  buildSupportReplyToAddress,
  getSupportFromEmail,
  getSupportToEmail
} = require("../services/supportEmailService.js");
const {
  AUDIT_ACTIONS,
  recordAuditEventForRequest
} = require("../services/auditEventService.js");


const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);
router.use(createDataApiLimiter({ max: 120 }));

const VALID_MESSAGE_TYPES = new Set(["it_support", "general", "support_request"]);
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 10000;
const MAX_PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function getResendClient() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return new Resend(key);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mapMessageRow(row, viewerId) {
  const isSender = row.sender_id === viewerId;
  const isArchived = isSender ? row.is_archived_by_sender : row.is_archived_by_receiver;
  // For inbound external email (e.g. invoice_reply from a customer), sender_id
  // is NULL — surface the external sender's name/email instead.
  const senderName = row.sender_name || row.external_sender_name || row.external_sender_email || null;
  const senderEmail = row.sender_email || row.external_sender_email || null;
  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_name: senderName,
    sender_email: senderEmail,
    external_sender_name: row.external_sender_name || null,
    external_sender_email: row.external_sender_email || null,
    receiver_id: row.receiver_id,
    receiver_name: row.receiver_name || null,
    receiver_email: row.receiver_email || null,
    message_type: row.message_type,
    subject: row.subject || null,
    body: row.body,
    invoice_id: row.invoice_id || null,
    invoice_number: row.invoice_number || null,
    is_read: row.is_read,
    is_archived: isArchived || false,
    parent_id: row.parent_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    thread_count: row.thread_count || 1,
    thread_has_unread: Boolean(row.thread_has_unread || false),
  };
}

function threadKeySql(alias = "m") {
  return `CASE
    WHEN ${alias}.invoice_id IS NOT NULL THEN 'invoice:' || ${alias}.invoice_id::text
    ELSE 'message:' || COALESCE(${alias}.parent_id, ${alias}.id)::text
  END`;
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
            -- Previously exchanged messages (reply flow)
            EXISTS (
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
  `WITH visible_messages AS (
      SELECT m.*,
             ${threadKeySql("m")} AS thread_key
        FROM messages m
       WHERE m.receiver_id = $1
         AND m.is_deleted_by_receiver = FALSE
         AND m.is_archived_by_receiver = $2
    ),
    ranked AS (
      SELECT vm.*,
             COUNT(*) OVER (PARTITION BY vm.thread_key)::int AS thread_count,
            BOOL_OR(vm.receiver_id = $1 AND vm.is_read = FALSE) OVER (PARTITION BY vm.thread_key) AS thread_has_unread,
            ROW_NUMBER() OVER (PARTITION BY vm.thread_key
            ORDER BY vm.created_at DESC) AS rn
        FROM visible_messages vm
    )
    SELECT r.*,
           r.thread_count,
           r.thread_has_unread,
           COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
           s.email AS sender_email,
           COALESCE(u.display_name, u.full_name, u.email) AS receiver_name,
           u.email AS receiver_email,
           inv.invoice_number AS invoice_number
      FROM ranked r
      LEFT JOIN users s ON s.id = r.sender_id
      LEFT JOIN users u ON u.id = r.receiver_id
      LEFT JOIN invoices_v1 inv ON inv.id = r.invoice_id
     WHERE r.rn = 1
     ORDER BY r.created_at DESC
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
  `WITH visible_messages AS (
      SELECT m.*,
             ${threadKeySql("m")} AS thread_key
        FROM messages m
       WHERE m.sender_id = $1
         AND m.is_deleted_by_sender = FALSE
         AND m.is_archived_by_sender = $2
    ),
    ranked AS (
      SELECT vm.*,
             COUNT(*) OVER (PARTITION BY vm.thread_key)::int AS thread_count,
             ROW_NUMBER() OVER (
               PARTITION BY vm.thread_key
               ORDER BY vm.created_at DESC
             ) AS rn
        FROM visible_messages vm
    )
    SELECT r.*,
           r.thread_count,
           COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
           s.email AS sender_email,
           COALESCE(u.display_name, u.full_name, u.email) AS receiver_name,
           u.email AS receiver_email,
           inv.invoice_number AS invoice_number
      FROM ranked r
      LEFT JOIN users s ON s.id = r.sender_id
      LEFT JOIN users u ON u.id = r.receiver_id
      LEFT JOIN invoices_v1 inv ON inv.id = r.invoice_id
     WHERE r.rn = 1
     ORDER BY r.created_at DESC
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
  `WITH visible_messages AS (
      SELECT m.*,
             ${threadKeySql("m")} AS thread_key
        FROM messages m
       WHERE (
          m.receiver_id = $1
          AND m.is_deleted_by_receiver = FALSE
          AND m.is_archived_by_receiver = TRUE
       ) OR (
          m.sender_id = $1
          AND m.is_deleted_by_sender = FALSE
          AND m.is_archived_by_sender = TRUE
       )
    ),
    ranked AS (
      SELECT vm.*,
             COUNT(*) OVER (PARTITION BY vm.thread_key)::int AS thread_count,
             ROW_NUMBER() OVER (
               PARTITION BY vm.thread_key
               ORDER BY vm.created_at DESC
             ) AS rn
        FROM visible_messages vm
    )
    SELECT r.*,
           r.thread_count,
           COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
           s.email AS sender_email,
           COALESCE(u.display_name, u.full_name, u.email) AS receiver_name,
           u.email AS receiver_email,
           inv.invoice_number AS invoice_number
      FROM ranked r
      LEFT JOIN users s ON s.id = r.sender_id
      LEFT JOIN users u ON u.id = r.receiver_id
      LEFT JOIN invoices_v1 inv ON inv.id = r.invoice_id
     WHERE r.rn = 1
     ORDER BY r.created_at DESC
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
// POST /api/messages/:id/reply-email
router.post("/:id/reply-email", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();
    const replyBody = String(req.body?.body || "").trim().slice(0, 10000);

    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }

    if (!replyBody) {
      return res.status(400).json({ error: "Reply body is required." });
    }

    const resend = getResendClient();
    if (!resend) {
      return res.status(503).json({ error: "Email service is not configured." });
    }

    const { rows } = await pool.query(
      `SELECT m.*,
              inv.invoice_number,
              inv.business_id,
              b.name AS business_name,
              b.user_id AS owner_id,
              COALESCE(m.parent_id, m.id) AS thread_root_id
         FROM messages m
         LEFT JOIN invoices_v1 inv ON inv.id = m.invoice_id
         LEFT JOIN businesses b ON b.id = inv.business_id
        WHERE m.id = $1
          AND (
            (m.receiver_id = $2 AND m.is_deleted_by_receiver = FALSE)
            OR
            (m.sender_id = $2 AND m.is_deleted_by_sender = FALSE)
          )
          AND m.external_sender_email IS NOT NULL
        LIMIT 1`,
      [messageId, req.user.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Email reply message not found." });
    }

    const original = rows[0];

    if (original.invoice_id && original.owner_id !== req.user.id) {
      return res.status(403).json({ error: "You are not allowed to reply to this message." });
    }

    const replyTo = original.invoice_id
      ? buildReplyToAddress(original.invoice_id)
      : buildSupportReplyToAddress(original.thread_root_id || original.id);
    const companyName = String(original.business_name || "InEx Ledger")
      .replace(/[<>"]/g, "")
      .trim()
      .slice(0, 70);

    const subject = String(original.subject || `Re: Invoice ${original.invoice_number}`).startsWith("Re:")
      ? String(original.subject || `Re: Invoice ${original.invoice_number}`)
      : `Re: ${original.subject || `Invoice ${original.invoice_number}`}`;

    const references = [
      original.external_references,
      original.external_message_id
    ].filter(Boolean).join(" ");

    const payload = {
      from: getInvoiceFromEmail(),
      to: original.external_sender_email,
      subject,
      text: replyBody,
      html: `<p>${escapeHtml(replyBody).replace(/\n/g, "<br/>")}</p>`,
      headers: {
        ...(original.external_message_id ? { "In-Reply-To": original.external_message_id } : {}),
        ...(references ? { References: references } : {})
      }
    };

    if (replyTo) {
      const replyToDisplay = `${companyName} Billing <${replyTo}>`;
      payload.replyTo = replyToDisplay;
      payload.reply_to = replyToDisplay;
    }

    const sendResult = await resend.emails.send(payload);

    if (sendResult?.error) {
      return res.status(sendResult.error.statusCode || 502).json({
        error: sendResult.error.message || "Failed to send email reply.",
        details: sendResult.error
      });
    }

    const outboundMessageId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body,
          external_sender_email, external_sender_name, invoice_id, parent_id,
          is_read, is_deleted_by_receiver)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, TRUE)`,
      [
        outboundMessageId,
        req.user.id,
        original.invoice_id ? "invoice_sent" : "support_request",
        subject,
        replyBody,
        original.external_sender_email,
        original.external_sender_name,
        original.invoice_id || null,
        original.thread_root_id || original.id
      ]
    );

    logInfo("invoice reply email sent", {
      originalMessageId: original.id,
      outboundMessageId,
      invoiceId: original.invoice_id || null,
      threadRootId: original.thread_root_id || original.id,
      to: original.external_sender_email,
      resendId: sendResult?.data?.id || null
    });

    res.json({
      ok: true,
      message_id: outboundMessageId,
      resend_id: sendResult?.data?.id || null
    });
  } catch (err) {
    logError("POST /messages/:id/reply-email error:", err.message);
    res.status(500).json({ error: "Failed to send email reply." });
  }
});


// GET /api/messages/:id/thread
// Returns the full visible conversation for a message.
// For invoice messages, this groups by invoice_id so the user sees the whole email thread.
router.get("/:id/thread", async (req, res) => {
  try {
    const messageId = String(req.params.id || "").trim();

    if (!isUuid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID." });
    }

    const baseResult = await pool.query(
      `SELECT id, invoice_id, COALESCE(parent_id, id) AS thread_root_id
         FROM messages
        WHERE id = $1
          AND (
            (receiver_id = $2 AND is_deleted_by_receiver = FALSE)
            OR
            (sender_id = $2 AND is_deleted_by_sender = FALSE)
          )
        LIMIT 1`,
      [messageId, req.user.id]
    );

    if (!baseResult.rowCount) {
      return res.status(404).json({ error: "Message not found." });
    }

    const baseMessage = baseResult.rows[0];

    let rows;

    if (baseMessage.invoice_id) {
      const result = await pool.query(
        `SELECT m.*,
                COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
                s.email AS sender_email,
                COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
                r.email AS receiver_email,
                inv.invoice_number AS invoice_number
           FROM messages m
           LEFT JOIN users s ON s.id = m.sender_id
           LEFT JOIN users r ON r.id = m.receiver_id
           LEFT JOIN invoices_v1 inv ON inv.id = m.invoice_id
          WHERE m.invoice_id = $1
            AND (
              (m.receiver_id = $2 AND m.is_deleted_by_receiver = FALSE)
              OR
              (m.sender_id = $2 AND m.is_deleted_by_sender = FALSE)
            )
          ORDER BY m.created_at ASC`,
        [baseMessage.invoice_id, req.user.id]
      );

      rows = result.rows;
    } else {
      const rootId = baseMessage.thread_root_id || baseMessage.id;
      const result = await pool.query(
        `SELECT m.*,
                COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
                s.email AS sender_email,
                COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
                r.email AS receiver_email,
                inv.invoice_number AS invoice_number
           FROM messages m
           LEFT JOIN users s ON s.id = m.sender_id
           LEFT JOIN users r ON r.id = m.receiver_id
           LEFT JOIN invoices_v1 inv ON inv.id = m.invoice_id
          WHERE COALESCE(m.parent_id, m.id) = $1
            AND (
              (m.receiver_id = $2 AND m.is_deleted_by_receiver = FALSE)
              OR
              (m.sender_id = $2 AND m.is_deleted_by_sender = FALSE)
            )
          ORDER BY m.created_at ASC`,
        [rootId, req.user.id]
      );

      rows = result.rows;
    }

    // Mark unread messages in this thread as read when the receiver opens it.
    await pool.query(
      `UPDATE messages
          SET is_read = TRUE, updated_at = NOW()
        WHERE id = ANY($1::uuid[])
          AND receiver_id = $2
          AND is_read = FALSE`,
      [rows.map((row) => row.id), req.user.id]
    );

    res.json({
      thread: rows.map((row) => mapMessageRow(row, req.user.id))
    });
  } catch (err) {
    logError("GET /messages/:id/thread error:", err.message);
    res.status(500).json({ error: "Failed to fetch message thread." });
  }
});


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
              r.email AS receiver_email,
              inv.invoice_number AS invoice_number
         FROM messages m
         LEFT JOIN users s ON s.id = m.sender_id
         LEFT JOIN users r ON r.id = m.receiver_id
         LEFT JOIN invoices_v1 inv ON inv.id = m.invoice_id
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

router.post("/support-email", async (req, res) => {
  try {
    const subject = String(req.body?.subject || "Support Request").trim().slice(0, MAX_SUBJECT_LEN);
    const body = String(req.body?.body || "").trim().slice(0, MAX_BODY_LEN);

    if (!body) {
      return res.status(400).json({ error: "Message body is required." });
    }

    const resend = getResendClient();
    if (!resend) {
      return res.status(503).json({ error: "Email service is not configured." });
    }

    const supportTo = getSupportToEmail();
    const supportFrom = getSupportFromEmail();

    const userResult = await pool.query(
      `SELECT full_name, display_name, email
         FROM users
        WHERE id = $1
        LIMIT 1`,
      [req.user.id]
    );

    const userRow = userResult.rows[0] || {};
    const accountName =
      userRow.full_name ||
      userRow.display_name ||
      userRow.email ||
      req.user?.email ||
      "Unknown account";
    const userEmail = userRow.email || req.user?.email || "Unknown email";
    const userId = req.user?.id || "Unknown ID";
    
    const messageId = crypto.randomUUID();
    const replyTo = buildSupportReplyToAddress(messageId);
    
    logInfo("support email reply-to debug", {
      messageId,
       supportReplyBaseEmail: process.env.SUPPORT_REPLY_BASE_EMAIL || null,
      hasSupportReplyBaseEmail: Boolean(process.env.SUPPORT_REPLY_BASE_EMAIL),
      replyTo,
      hasReplyTo: Boolean(replyTo)
    });
    
    const text = [
      `Support request from InEx Ledger`,
      ``,
      `From: ${accountName}`,
      `Email: ${userEmail}`,
      ``,
      `Subject: ${subject}`,
      ``,
      body,
      ``,
      `---`,
      `Technical details`,
      `User ID: ${userId}`
    ].join("\n");

    const html = `<p><strong>Support request from InEx Ledger</strong></p>
    <p> <strong>From:</strong> ${escapeHtml(accountName)}<br/>
    <strong>Email:</strong> ${escapeHtml(userEmail)} </p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>
    <hr/>
    <p style="color:#64748b;font-size:12px;"><strong>Technical details</strong><br/>
    User ID: ${escapeHtml(userId)}</p>
    `;

    const payload = {
      from: supportFrom,
      to: supportTo,
      subject: `[InEx Support] ${subject}`,
      text,
      html
    };

    if (replyTo) {
      const replyToDisplay = `InEx Ledger Support <${replyTo}>`;
      payload.replyTo = replyToDisplay;
      payload.reply_to = replyToDisplay;
    }

    const sendResult = await resend.emails.send(payload);

    if (sendResult?.error) {
      return res.status(sendResult.error.statusCode || 502).json({
        error: sendResult.error.message || "Failed to send support request.",
        details: sendResult.error
      });
    }

    await pool.query(
      `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body,
          external_sender_email, external_sender_name,
          is_read, is_deleted_by_receiver, external_message_id)
       VALUES ($1, $2, $3, 'support_request', $4, $5, $6, $7, TRUE, TRUE, $8)`,
      [
        messageId,
        req.user.id,
        req.user.id,
        subject,
        body,
        supportTo,
        "InEx Support",
        sendResult?.data?.id || null
      ]
    );

    await recordAuditEventForRequest(pool, req, {
      action: AUDIT_ACTIONS.SUPPORT_REQUEST_CREATED,
      metadata: {
        messageId,
        delivery: "email",
        to: supportTo,
        subject
      }
    });

    res.status(201).json({
      ok: true,
      message_id: messageId,
      delivery: "email",
      to: supportTo,
      resend_id: sendResult?.data?.id || null
    });
  } catch (err) {
    logError("POST /messages/support-email error:", err.message);
    res.status(500).json({ error: "Failed to send support request." });
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
              -- Prior message exchange exists (reply flow)
              EXISTS (
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
        `SELECT id, COALESCE(parent_id, id) AS thread_root_id FROM messages
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
      req.threadRootId = parentCheck.rows[0].thread_root_id || parentCheck.rows[0].id;
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
        req.threadRootId || parentId || null
      ]
    );

    // Fetch display names for the response
    const { rows } = await pool.query(
      `SELECT m.*,
              COALESCE(s.display_name, s.full_name, s.email) AS sender_name,
              s.email AS sender_email,
              COALESCE(r.display_name, r.full_name, r.email) AS receiver_name,
              r.email AS receiver_email,
              inv.invoice_number AS invoice_number
         FROM messages m
         LEFT JOIN users s ON s.id = m.sender_id
         LEFT JOIN users r ON r.id = m.receiver_id
         LEFT JOIN invoices_v1 inv ON inv.id = m.invoice_id
        WHERE m.id = $1`,
      [result.rows[0].id]
    );

    if (messageType === "support_request" || messageType === "it_support") {
      await recordAuditEventForRequest(pool, req, {
        action: AUDIT_ACTIONS.SUPPORT_REQUEST_CREATED,
        metadata: {
          messageId: result.rows[0].id,
          messageType,
          receiverId,
          parentId: parentId || null
        }
      });
    }

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
