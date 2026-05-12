"use strict";

/**
 * Inbound email webhook. Designed to accept a Resend-style inbound payload:
 *
 *   {
 *     "from": { "email": "client@example.com", "name": "Client Co" },
 *     "to":   [{ "email": "invoices+<token>@inexledger.com" }],
 *     "subject": "Re: Invoice INV-2026-0001",
 *     "text":   "Plain text body...",
 *     "html":   "<p>HTML body...</p>"
 *   }
 *
 * We extract the reply token from any recipient that matches the
 * plus-addressing pattern, validate it against the optional HMAC secret,
 * load the invoice, and insert an 'invoice_reply' message owned by the
 * invoice's business owner (so it appears in their Messages page).
 *
 * The webhook is public (Resend webhooks have no per-call auth). Optional
 * defense in depth: if INBOUND_EMAIL_WEBHOOK_SECRET is set, the request
 * must include `X-Inbound-Secret: <value>` to be accepted.
 */

const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");
const {
  extractTokenFromRecipient,
  parseReplyToken
} = require("../services/invoiceEmailService.js");

const router = express.Router();
const { Resend } = require("resend");

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return false;
  }
}

function pickRecipientList(payload) {
  const out = [];
  const candidates = [
    payload?.to,
    payload?.data?.to,
    payload?.recipient,
    payload?.recipients,
    payload?.envelope?.to
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string") {
      out.push(candidate);
    } else if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") out.push(entry);
        else if (entry?.email) out.push(entry.email);
        else if (entry?.address) out.push(entry.address);
      }
    } else if (candidate?.email) {
      out.push(candidate.email);
    }
  }
  return out;
}

function pickFromAddress(payload) {
  const f = payload?.from || payload?.data?.from;
  if (typeof f === "string") return { email: f, name: null };
  if (Array.isArray(f) && f[0]) return { email: f[0].email || f[0].address || null, name: f[0].name || null };
  if (f?.email) return { email: f.email, name: f.name || null };
  if (f?.address) return { email: f.address, name: f.name || null };
  return { email: null, name: null };
}

function pickBody(payload) {
  return String(payload?.text || payload?.plain || payload?.body || "")
    .slice(0, 50000)
    || String(payload?.html || "").slice(0, 50000);
}

/**
 * POST /api/email/inbound
 * Public webhook entry point.
 */
router.post("/inbound", express.json({ limit: "256kb" }), async (req, res) => {
  const expected = String(process.env.INBOUND_EMAIL_WEBHOOK_SECRET || "").trim();
  if (expected) {
    const provided = req.get("x-inbound-secret") || req.get("x-webhook-secret") || "";
    if (!timingSafeStringEqual(provided, expected)) {
      logWarn("inbound email webhook rejected: bad secret");
      return res.status(401).json({ ok: false, error: "Invalid webhook secret." });
    }
  }

  const payload = req.body || {};
  const recipients = pickRecipientList(payload);
  if (!recipients.length) {
    logWarn("inbound email webhook: no recipients in payload");
    return res.status(200).json({ ok: true, ignored: "no_recipients" });
  }

  let invoiceId = null;
  for (const recipient of recipients) {
    const token = extractTokenFromRecipient(recipient);
    if (!token) continue;
    const candidate = parseReplyToken(token);
    if (candidate) {
      invoiceId = candidate;
      break;
    }
  }

  if (!invoiceId) {
    logWarn("inbound email webhook: no matching reply token", { recipients });
    return res.status(200).json({ ok: true, ignored: "no_matching_invoice" });
  }

  try {
    const invoiceResult = await pool.query(
      `SELECT i.id, i.invoice_number, i.business_id, b.user_id AS owner_id
         FROM invoices_v1 i
         JOIN businesses b ON b.id = i.business_id
        WHERE i.id = $1
        LIMIT 1`,
      [invoiceId]
    );
    if (!invoiceResult.rowCount) {
      logWarn("inbound email webhook: invoice not found", { invoiceId });
      return res.status(200).json({ ok: true, ignored: "invoice_not_found" });
    }
    const invoice = invoiceResult.rows[0];
    const ownerId = invoice.owner_id;
    if (!ownerId) {
      logWarn("inbound email webhook: business has no owner", { invoiceId });
      return res.status(200).json({ ok: true, ignored: "no_owner" });
    }

    const from = pickFromAddress(payload);
    const subject = String(payload?.subject || payload?.data?.subject || `Re: Invoice ${invoice.invoice_number}`).slice(0, 200);
    const body = pickBody(payload).trim() || "(reply received — body not included in Resend webhook metadata)";

    const messageId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body,
          external_sender_email, external_sender_name, invoice_id)
       VALUES ($1, NULL, $2, 'invoice_reply', $3, $4, $5, $6, $7)`,
      [
        messageId,
        ownerId,
        subject,
        body,
        from.email,
        from.name,
        invoice.id
      ]
    );

    logInfo("inbound email webhook: invoice reply stored", {
      invoiceId: invoice.id,
      messageId,
      from: from.email
    });

    res.json({
      ok: true,
      invoice_id: invoice.id,
      message_id: messageId
    });
  } catch (err) {
    logError("inbound email webhook error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to process inbound email." });
  }
});

module.exports = router;
