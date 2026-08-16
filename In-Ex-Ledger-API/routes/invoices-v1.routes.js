const express = require("express");
const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logInfo } = require("../utils/logger.js");
const { ApiError, asyncRoute } = require("../utils/apiError.js");
const { sendInvoiceEmail } = require("../services/invoiceEmailService.js");
const { sendInvoiceOwnerActivityEmail } = require("../services/invoiceOwnerEmailService.js");
const {
  AUDIT_ACTIONS,
  recordAuditEventForRequest
} = require("../services/auditEventService.js");

let cachedResendClient = null;
function getResendClient() {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  if (!cachedResendClient) cachedResendClient = new Resend(key);
  return cachedResendClient;
}

const router = express.Router();
router.use(requireAuth);
router.use(requireCsrfProtection);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["draft", "sent", "paid", "void"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const MAX_INVOICE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_INVOICE_ATTACHMENTS = 5;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
  ".txt", ".csv", ".doc", ".docx", ".xls", ".xlsx"
]);

function attachmentFileFilter(_req, file, cb) {
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mime) || !ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    const error = new Error("Unsupported attachment type.");
    error.status = 400;
    return cb(error);
  }
  cb(null, true);
}

const invoiceAttachmentsUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_INVOICE_ATTACHMENT_BYTES, files: MAX_INVOICE_ATTACHMENTS },
  fileFilter: attachmentFileFilter
});

function sanitizeAttachmentFilename(name) {
  const base = path.basename(String(name || "attachment")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 150) || "attachment";
}

function buildResendAttachments(files) {
  return (files || []).map((file) => ({
    filename: sanitizeAttachmentFilename(file.originalname),
    content: file.buffer,
    contentType: file.mimetype
  }));
}

function parseEmailList(value) {
  const values = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[;,]/)
        .map((entry) => entry.trim());

  const normalized = [];
  const seen = new Set();

  for (const item of values) {
    const email = String(item || "").trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      return { ok: false, invalid: email };
    }
    if (seen.has(email)) continue;
    seen.add(email);
    normalized.push(email);
  }

  return { ok: true, emails: normalized };
}

function validateInvoicePayload(body) {
  const { title, customer_name, issue_date, due_date, line_items, currency } = body ?? {};

  if (!title || !String(title).trim()) {
    return { valid: false, message: "title is required." };
  }
  if (!customer_name || !String(customer_name).trim()) {
    return { valid: false, message: "customer_name is required." };
  }
  if (!issue_date || Number.isNaN(Date.parse(issue_date))) {
    return { valid: false, message: "issue_date must be a valid date." };
  }
  if (due_date && Number.isNaN(Date.parse(due_date))) {
    return { valid: false, message: "due_date must be a valid date." };
  }

  const items = Array.isArray(line_items) ? line_items : [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.description || !String(item.description).trim()) {
      return { valid: false, message: `Line item ${i + 1}: description is required.` };
    }
    const qty = Number(item.quantity ?? 1);
    const rate = Number(item.unit_price ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { valid: false, message: `Line item ${i + 1}: quantity must be a positive number.` };
    }
    if (!Number.isFinite(rate) || rate < 0) {
      return { valid: false, message: `Line item ${i + 1}: unit_price must be a non-negative number.` };
    }
  }

  const rawCurrency = String(currency || "CAD").trim().toUpperCase();
  const validCurrencies = new Set(["CAD", "USD", "EUR", "GBP", "AUD"]);
  if (!validCurrencies.has(rawCurrency)) {
    return { valid: false, message: "currency must be one of CAD, USD, EUR, GBP, AUD." };
  }

  const normalizedItems = items.map((item) => ({
    description: String(item.description).trim().slice(0, 500),
    quantity: Number(item.quantity ?? 1),
    unit_price: Number(item.unit_price ?? 0),
    amount: Number((Number(item.quantity ?? 1) * Number(item.unit_price ?? 0)).toFixed(2))
  }));

  const subtotal = normalizedItems.reduce((s, i) => s + i.amount, 0);
  const taxRate = Number(body.tax_rate ?? 0);
  const taxAmount = Number((subtotal * Math.min(Math.max(taxRate, 0), 1)).toFixed(2));
  const total = Number((subtotal + taxAmount).toFixed(2));

  return {
    valid: true,
    normalized: {
      title: String(title).trim().slice(0, 200),
      customer_name: String(customer_name).trim().slice(0, 200),
      customer_email: String(body.customer_email || "").trim().slice(0, 1000) || null,
      issue_date: String(issue_date).slice(0, 10),
      due_date: due_date ? String(due_date).slice(0, 10) : null,
      currency: rawCurrency,
      line_items: normalizedItems,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: total,
      notes: String(body.notes || "").trim().slice(0, 1000) || null
    }
  };
}

async function generateInvoiceNumber(businessId) {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COALESCE(
       MAX(
         CASE
           WHEN invoice_number ~ $2 THEN substring(invoice_number from $3)::integer
           ELSE NULL
         END
       ),
       0
     ) AS max_number
     FROM invoices_v1
     WHERE business_id = $1`,
    [
      businessId,
      `^INV-${year}-[0-9]+$`,
      `^INV-${year}-([0-9]+)$`
    ]
  );
  const nextNumber = Number(result.rows[0]?.max_number ?? 0) + 1;
  return `INV-${year}-${String(nextNumber).padStart(4, "0")}`;
}

/* ── GET /api/invoices-v1 ── list invoices */
router.get("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);

  const status = req.query.status ? String(req.query.status).toLowerCase() : null;
  const params = [businessId];

  let where = "WHERE business_id = $1 AND deleted_at IS NULL";

  if (status === "deleted") {
    where = "WHERE business_id = $1 AND deleted_at IS NOT NULL";
  } else if (status && VALID_STATUSES.has(status)) {
    where += " AND status = $2";
    params.push(status);
  }

  const result = await pool.query(
    `SELECT id, title, invoice_number, customer_name, customer_email, issue_date, due_date,
              status, currency, subtotal, tax_rate, tax_amount, total_amount, notes,
              line_items, created_at, updated_at
       FROM invoices_v1
       ${where}
       ORDER BY issue_date DESC, created_at DESC
       LIMIT 200`,
    params
  );

  res.json(result.rows);
}));

/* ── POST /api/invoices-v1 ── create invoice */
router.post("/", asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);

  const validation = validateInvoicePayload(req.body);
  if (!validation.valid) {
    throw new ApiError(400, validation.message);
  }

  const { title, customer_name, customer_email, issue_date, due_date, currency,
          line_items, subtotal, tax_rate, tax_amount, total_amount, notes } = validation.normalized;

  const status = String(req.body.status || "draft").toLowerCase();
  const finalStatus = VALID_STATUSES.has(status) ? status : "draft";
  let createdInvoice = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await generateInvoiceNumber(businessId);
    try {
      const result = await pool.query(
        `INSERT INTO invoices_v1
            (id, business_id, title, invoice_number, customer_name, customer_email,
             issue_date, due_date, status, currency, line_items,
             subtotal, tax_rate, tax_amount, total_amount, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now())
           RETURNING *`,
        [
          crypto.randomUUID(), businessId, title, invoiceNumber, customer_name, customer_email,
          issue_date, due_date, finalStatus, currency, JSON.stringify(line_items),
          subtotal, tax_rate, tax_amount, total_amount, notes
        ]
      );
      createdInvoice = result.rows[0];
      break;
    } catch (err) {
      if (err?.code === "23505") {
        continue;
      }
      throw err;
    }
  }

  if (!createdInvoice) {
    throw new ApiError(409, "Could not generate a unique invoice number. Please try again.");
  }

  res.status(201).json(createdInvoice);
}));

/* ── GET /api/invoices-v1/:id ── get single invoice */
router.get("/:id", asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);

  const result = await pool.query(
    "SELECT * FROM invoices_v1 WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL LIMIT 1",
    [req.params.id, businessId]
  );
  if (!result.rowCount) throw new ApiError(404, "Invoice not found.");

  res.json(result.rows[0]);
}));

/* ── PUT /api/invoices-v1/:id ── update invoice */
router.put("/:id", asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);

  const existing = await pool.query(
    "SELECT id, status FROM invoices_v1 WHERE id = $1 AND business_id = $2 AND deleted_at IS NULL LIMIT 1",
    [req.params.id, businessId]
  );
  if (!existing.rowCount) throw new ApiError(404, "Invoice not found.");
  if (existing.rows[0].status === "paid" || existing.rows[0].status === "void") {
    throw new ApiError(409, "Paid or voided invoices cannot be edited.");
  }

  const validation = validateInvoicePayload(req.body);
  if (!validation.valid) throw new ApiError(400, validation.message);

  const { title, customer_name, customer_email, issue_date, due_date, currency,
          line_items, subtotal, tax_rate, tax_amount, total_amount, notes } = validation.normalized;

  const statusRaw = String(req.body.status || existing.rows[0].status).toLowerCase();
  const status = VALID_STATUSES.has(statusRaw) ? statusRaw : existing.rows[0].status;

  const result = await pool.query(
    `UPDATE invoices_v1
       SET title=$1, customer_name=$2, customer_email=$3, issue_date=$4, due_date=$5, status=$6,
           currency=$7, line_items=$8, subtotal=$9, tax_rate=$10, tax_amount=$11,
           total_amount=$12, notes=$13, updated_at=now()
       WHERE id=$14 AND business_id=$15 AND deleted_at IS NULL
       RETURNING *`,
    [title, customer_name, customer_email, issue_date, due_date, status, currency,
     JSON.stringify(line_items), subtotal, tax_rate, tax_amount, total_amount, notes,
     req.params.id, businessId]
  );

  res.json(result.rows[0]);
}));

/* ── PATCH /api/invoices-v1/:id/status ── mark sent/paid/void */
router.patch("/:id/status", asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }
  const newStatus = String(req.body?.status || "").toLowerCase();
  if (!VALID_STATUSES.has(newStatus)) {
    throw new ApiError(400, "status must be one of: draft, sent, paid, void.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);

  const result = await pool.query(
    "UPDATE invoices_v1 SET status=$1, updated_at=now() WHERE id=$2 AND business_id=$3 AND deleted_at IS NULL RETURNING *",
    [newStatus, req.params.id, businessId]
  );
  if (!result.rowCount) throw new ApiError(404, "Invoice not found.");

  res.json(result.rows[0]);
}));

/* ── POST /api/invoices-v1/:id/send ── email the invoice to the customer */
router.post("/:id/send", invoiceAttachmentsUpload.array("attachments", MAX_INVOICE_ATTACHMENTS), asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }
  const businessId = await resolveBusinessIdForUser(req.user);

  const existing = await pool.query(
    `SELECT i.*, b.name AS business_name
         FROM invoices_v1 i
         JOIN businesses b ON b.id = i.business_id
        WHERE i.id = $1 AND i.business_id = $2
        AND i.deleted_at IS NULL
        LIMIT 1`,
    [req.params.id, businessId]
  );
  if (!existing.rowCount) throw new ApiError(404, "Invoice not found.");
  const invoice = existing.rows[0];

  const parsedTo = parseEmailList(req.body?.recipient_email || invoice.customer_email || "");
  if (!parsedTo.ok) {
    throw new ApiError(400, `Invalid recipient email: ${parsedTo.invalid}`);
  }
  if (!parsedTo.emails.length) {
    throw new ApiError(400, "Invoice has no customer email. Add one before sending.");
  }
  const parsedCc = parseEmailList(req.body?.cc_emails || "");
  if (!parsedCc.ok) {
    throw new ApiError(400, `Invalid CC email: ${parsedCc.invalid}`);
  }
  const ccEmails = parsedCc.emails.filter((email) => !parsedTo.emails.includes(email));
  const recipientEmail = parsedTo.emails.join(", ");
  const ccEmailText = ccEmails.join(", ");

  const customMessage = String(req.body?.message || "").trim().slice(0, 2000) || null;

  const resendClient = getResendClient();
  let sendResult;
  try {
    sendResult = await sendInvoiceEmail(resendClient, {
      invoice,
      recipientEmail: parsedTo.emails,
      ccEmails,
      businessName: invoice.business_name,
      senderName: req.user?.email || null,
      customMessage,
      attachments: req.files?.length ? buildResendAttachments(req.files) : undefined
    });
  } catch (err) {
    const status = err.status || 502;
    logError("POST /invoices-v1/:id/send error:", {
      message: err.message,
      code: err.code || "email_failed",
      details: err.details || null
    });
    await sendInvoiceOwnerActivityEmail({
      businessId,
      kind: "failed",
      userId: req.user.id,
      actionUrl: "/invoices",
      details: [
        { label: "Invoice", value: invoice.invoice_number || "Invoice" },
        { label: "Recipient", value: recipientEmail },
        ...(ccEmailText ? [{ label: "CC", value: ccEmailText }] : []),
        ...(err.message ? [{ label: "Issue", value: String(err.message).slice(0, 300) }] : [])
      ]
    });
    return res.status(status).json({
      error: err.message,
      code: err.code || "email_failed",
      details: err.details || null
    });
  }

  // Bump invoice status to "sent" when it was still a draft.
  if (invoice.status === "draft") {
    await pool.query(
      "UPDATE invoices_v1 SET status = 'sent', updated_at = now() WHERE id = $1 AND business_id = $2",
      [invoice.id, businessId]
    );
  }

  // Record an outbound message so the activity shows up in Messages.
  const messageId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO messages
         (id, sender_id, receiver_id, message_type, subject, body,
          external_sender_email, external_sender_name, invoice_id, business_id)
       VALUES ($1, $2, $2, 'invoice_sent', $3, $4, $5, $6, $7, $8)`,
    [
      messageId,
      req.user.id,
      `Invoice: ${invoice.title || invoice.invoice_number}`,
      customMessage || `Invoice ${invoice.invoice_number} was emailed to ${recipientEmail}${ccEmailText ? ` (cc ${ccEmailText})` : ""}.`,
      recipientEmail,
      invoice.customer_name || null,
      invoice.id,
      businessId
    ]
  );

  await recordAuditEventForRequest(pool, req, {
    userId: req.user.id,
    businessId,
    action: "invoice.sent",
    metadata: {
      invoice_id: invoice.id,
      recipient: recipientEmail,
      cc: ccEmails,
      resend_id: sendResult?.data?.id || null
    }
  });

  logInfo("Invoice email sent", {
    invoiceId: invoice.id,
    recipient: recipientEmail,
    cc: ccEmails
  });
  await sendInvoiceOwnerActivityEmail({
    businessId,
    kind: "sent",
    userId: req.user.id,
    actionUrl: "/invoices",
    details: [
      { label: "Invoice", value: invoice.invoice_number || "Invoice" },
      { label: "Recipient", value: recipientEmail },
      ...(ccEmailText ? [{ label: "CC", value: ccEmailText }] : []),
      { label: "Total", value: `${invoice.currency} ${Number(invoice.total_amount || 0).toFixed(2)}` }
    ]
  });

  res.json({
    ok: true,
    message_id: messageId,
    recipient_email: recipientEmail,
    cc_emails: ccEmails,
    resend_id: sendResult?.data?.id || null
  });
}));

/* ── DELETE /api/invoices-v1/:id ── soft-delete invoice */
router.delete("/:id", asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  const existing = await pool.query(
    "SELECT id, status, deleted_at FROM invoices_v1 WHERE id = $1 AND business_id = $2 LIMIT 1",
    [req.params.id, businessId]
  );

  if (!existing.rowCount || existing.rows[0].deleted_at) {
    throw new ApiError(404, "Invoice not found.");
  }

  await pool.query(
    `UPDATE invoices_v1
          SET deleted_at = NOW(),
              deleted_by = $1,
              updated_at = NOW()
        WHERE id = $2
          AND business_id = $3
          AND deleted_at IS NULL`,
    [req.user.id, req.params.id, businessId]
  );

  await recordAuditEventForRequest(pool, req, {
    userId: req.user.id,
    businessId,
    action: "invoice.deleted",
    metadata: {
      invoice_id: req.params.id,
      previous_status: existing.rows[0].status
    }
  });

  res.json({ ok: true });
}));

/* ── PATCH /api/invoices-v1/:id/restore ── restore soft-deleted invoice */
router.patch("/:id/restore", asyncRoute(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    throw new ApiError(400, "Invalid invoice ID.");
  }

  const businessId = await resolveBusinessIdForUser(req.user);

  const existing = await pool.query(
    "SELECT id, status, deleted_at FROM invoices_v1 WHERE id = $1 AND business_id = $2 LIMIT 1",
    [req.params.id, businessId]
  );

  if (!existing.rowCount) {
    throw new ApiError(404, "Invoice not found.");
  }

  if (!existing.rows[0].deleted_at) {
    throw new ApiError(409, "Invoice is not deleted.");
  }

  const result = await pool.query(
    `UPDATE invoices_v1
          SET deleted_at = NULL,
              deleted_by = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND business_id = $2
        RETURNING *`,
    [req.params.id, businessId]
  );

  await recordAuditEventForRequest(pool, req, {
    userId: req.user.id,
    businessId,
    action: "invoice.restored",
    metadata: {
      invoice_id: req.params.id,
      status: existing.rows[0].status
    }
  });

  res.json(result.rows[0]);
}));

router.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logError("invoices-v1 route error:", err);
  }
  const error = status < 500 ? err.message : "Internal server error";
  res.status(status).json({ error });
});

module.exports = router;
