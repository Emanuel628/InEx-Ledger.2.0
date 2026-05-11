const express = require("express");
const crypto = require("crypto");
const { Resend } = require("resend");
const { pool } = require("../db.js");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { requireCsrfProtection } = require("../middleware/csrf.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const { logError, logInfo } = require("../utils/logger.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const { sendInvoiceEmail } = require("../services/invoiceEmailService.js");
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

async function requireProPlan(businessId, res) {
  const sub = await getSubscriptionSnapshotForBusiness(businessId);
  if (!hasFeatureAccess(sub, "receipts")) {
    res.status(402).json({ error: "Invoicing requires an active InEx Ledger Pro plan." });
    return false;
  }
  return true;
}

function validateInvoicePayload(body) {
  const { customer_name, issue_date, due_date, line_items, currency } = body ?? {};

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
      customer_name: String(customer_name).trim().slice(0, 200),
      customer_email: String(body.customer_email || "").trim().slice(0, 200) || null,
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
router.get("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const status = req.query.status ? String(req.query.status).toLowerCase() : null;
    const params = [businessId];
    let where = "WHERE business_id = $1";
    if (status && VALID_STATUSES.has(status)) {
      where += " AND status = $2";
      params.push(status);
    }

    const result = await pool.query(
      `SELECT id, invoice_number, customer_name, customer_email, issue_date, due_date,
              status, currency, subtotal, tax_rate, tax_amount, total_amount, notes,
              line_items, created_at, updated_at
       FROM invoices_v1
       ${where}
       ORDER BY issue_date DESC, created_at DESC
       LIMIT 200`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    logError("GET /invoices-v1 error:", err);
    res.status(500).json({ error: "Failed to load invoices." });
  }
});

/* ── POST /api/invoices-v1 ── create invoice */
router.post("/", async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const validation = validateInvoicePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    const { customer_name, customer_email, issue_date, due_date, currency,
            line_items, subtotal, tax_rate, tax_amount, total_amount, notes } = validation.normalized;

    const status = String(req.body.status || "draft").toLowerCase();
    const finalStatus = VALID_STATUSES.has(status) ? status : "draft";
    let createdInvoice = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invoiceNumber = await generateInvoiceNumber(businessId);
      try {
        const result = await pool.query(
          `INSERT INTO invoices_v1
            (id, business_id, invoice_number, customer_name, customer_email,
             issue_date, due_date, status, currency, line_items,
             subtotal, tax_rate, tax_amount, total_amount, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),now())
           RETURNING *`,
          [
            crypto.randomUUID(), businessId, invoiceNumber, customer_name, customer_email,
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
      return res.status(409).json({ error: "Could not generate a unique invoice number. Please try again." });
    }

    res.status(201).json(createdInvoice);
  } catch (err) {
    logError("POST /invoices-v1 error:", err);
    res.status(500).json({ error: "Failed to create invoice." });
  }
});

/* ── GET /api/invoices-v1/:id ── get single invoice */
router.get("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid invoice ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const result = await pool.query(
      "SELECT * FROM invoices_v1 WHERE id = $1 AND business_id = $2 LIMIT 1",
      [req.params.id, businessId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Invoice not found." });

    res.json(result.rows[0]);
  } catch (err) {
    logError("GET /invoices-v1/:id error:", err);
    res.status(500).json({ error: "Failed to load invoice." });
  }
});

/* ── PUT /api/invoices-v1/:id ── update invoice */
router.put("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid invoice ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const existing = await pool.query(
      "SELECT id, status FROM invoices_v1 WHERE id = $1 AND business_id = $2 LIMIT 1",
      [req.params.id, businessId]
    );
    if (!existing.rowCount) return res.status(404).json({ error: "Invoice not found." });
    if (existing.rows[0].status === "paid" || existing.rows[0].status === "void") {
      return res.status(409).json({ error: "Paid or voided invoices cannot be edited." });
    }

    const validation = validateInvoicePayload(req.body);
    if (!validation.valid) return res.status(400).json({ error: validation.message });

    const { customer_name, customer_email, issue_date, due_date, currency,
            line_items, subtotal, tax_rate, tax_amount, total_amount, notes } = validation.normalized;

    const statusRaw = String(req.body.status || existing.rows[0].status).toLowerCase();
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : existing.rows[0].status;

    const result = await pool.query(
      `UPDATE invoices_v1
       SET customer_name=$1, customer_email=$2, issue_date=$3, due_date=$4, status=$5,
           currency=$6, line_items=$7, subtotal=$8, tax_rate=$9, tax_amount=$10,
           total_amount=$11, notes=$12, updated_at=now()
       WHERE id=$13 AND business_id=$14
       RETURNING *`,
      [customer_name, customer_email, issue_date, due_date, status, currency,
       JSON.stringify(line_items), subtotal, tax_rate, tax_amount, total_amount, notes,
       req.params.id, businessId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    logError("PUT /invoices-v1/:id error:", err);
    res.status(500).json({ error: "Failed to update invoice." });
  }
});

/* ── PATCH /api/invoices-v1/:id/status ── mark sent/paid/void */
router.patch("/:id/status", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid invoice ID." });
  }
  const newStatus = String(req.body?.status || "").toLowerCase();
  if (!VALID_STATUSES.has(newStatus)) {
    return res.status(400).json({ error: "status must be one of: draft, sent, paid, void." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const result = await pool.query(
      "UPDATE invoices_v1 SET status=$1, updated_at=now() WHERE id=$2 AND business_id=$3 RETURNING *",
      [newStatus, req.params.id, businessId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Invoice not found." });

    res.json(result.rows[0]);
  } catch (err) {
    logError("PATCH /invoices-v1/:id/status error:", err);
    res.status(500).json({ error: "Failed to update invoice status." });
  }
});

/* ── POST /api/invoices-v1/:id/send ── email the invoice to the customer */
router.post("/:id/send", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid invoice ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const existing = await pool.query(
      `SELECT i.*, b.name AS business_name
         FROM invoices_v1 i
         JOIN businesses b ON b.id = i.business_id
        WHERE i.id = $1 AND i.business_id = $2
        LIMIT 1`,
      [req.params.id, businessId]
    );
    if (!existing.rowCount) return res.status(404).json({ error: "Invoice not found." });
    const invoice = existing.rows[0];

    const overrideEmail = String(req.body?.recipient_email || "").trim();
    const recipientEmail = overrideEmail || invoice.customer_email;
    if (!recipientEmail) {
      return res.status(400).json({ error: "Invoice has no customer email. Add one before sending." });
    }

    const customMessage = String(req.body?.message || "").trim().slice(0, 2000) || null;

    const resendClient = getResendClient();
    let sendResult;
    try {
      sendResult = await sendInvoiceEmail(resendClient, {
        invoice,
        recipientEmail,
        businessName: invoice.business_name,
        senderName: req.user?.email || null,
        customMessage
      });
    } catch (err) {
      const status = err.status || 502;
      logError("POST /invoices-v1/:id/send error:", err.message);
      return res.status(status).json({ error: err.message, code: err.code || "email_failed" });
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
          external_sender_email, external_sender_name, invoice_id)
       VALUES ($1, $2, $2, 'invoice_sent', $3, $4, $5, $6, $7)`,
      [
        messageId,
        req.user.id,
        `Invoice ${invoice.invoice_number} sent to ${recipientEmail}`,
        customMessage || `Invoice ${invoice.invoice_number} was emailed to ${recipientEmail}.`,
        recipientEmail,
        invoice.customer_name || null,
        invoice.id
      ]
    );

    await recordAuditEventForRequest(pool, req, {
      userId: req.user.id,
      businessId,
      action: "invoice.sent",
      metadata: {
        invoice_id: invoice.id,
        recipient: recipientEmail,
        resend_id: sendResult?.data?.id || null
      }
    });

    logInfo("Invoice email sent", {
      invoiceId: invoice.id,
      recipient: recipientEmail
    });

    res.json({
      ok: true,
      message_id: messageId,
      recipient_email: recipientEmail,
      resend_id: sendResult?.data?.id || null
    });
  } catch (err) {
    logError("POST /invoices-v1/:id/send error:", err);
    res.status(500).json({ error: "Failed to send invoice." });
  }
});

/* ── DELETE /api/invoices-v1/:id ── delete draft invoice */
router.delete("/:id", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    return res.status(400).json({ error: "Invalid invoice ID." });
  }
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    if (!await requireProPlan(businessId, res)) return;

    const existing = await pool.query(
      "SELECT status FROM invoices_v1 WHERE id = $1 AND business_id = $2 LIMIT 1",
      [req.params.id, businessId]
    );
    if (!existing.rowCount) return res.status(404).json({ error: "Invoice not found." });
    if (existing.rows[0].status !== "draft") {
      return res.status(409).json({ error: "Only draft invoices can be deleted." });
    }

    await pool.query("DELETE FROM invoices_v1 WHERE id=$1 AND business_id=$2", [req.params.id, businessId]);
    res.json({ ok: true });
  } catch (err) {
    logError("DELETE /invoices-v1/:id error:", err);
    res.status(500).json({ error: "Failed to delete invoice." });
  }
});

module.exports = router;
