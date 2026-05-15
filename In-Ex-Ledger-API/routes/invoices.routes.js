// Invoices API routes (V2/Business)
const express = require('express');
const router = express.Router();

const invoiceService = require('../services/invoiceService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVOICE_STATUS_VALUES = new Set(['draft', 'open', 'sent', 'partial', 'paid', 'void']);

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

function isUuid(value) {
	return UUID_RE.test(String(value || ''));
}

function isValidDateOnly(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function hasInvoicePayload(body) {
	if (!body || typeof body !== 'object') {
		return false;
	}
	const status = String(body.status || '').trim().toLowerCase();
	const amount = Number(body.total_amount);
	const currency = String(body.currency || '').trim();
	return (
		isUuid(body.customer_id) &&
		typeof body.number === 'string' &&
		body.number.trim().length > 0 &&
		INVOICE_STATUS_VALUES.has(status) &&
		isValidDateOnly(body.issue_date) &&
		Number.isFinite(amount) &&
		amount >= 0 &&
		/^[A-Za-z]{3}$/.test(currency)
	);
}

// List invoices (GET /invoices)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const invoices = await invoiceService.listInvoices(businessId);
		res.json(invoices);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoices.' });
	}
});

// Create invoice (POST /invoices)
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!hasInvoicePayload(req.body)) {
		return res.status(400).json({ error: 'Missing required invoice fields.' });
	}
	try {
		const invoice = await invoiceService.createInvoice(businessId, req.body);
		res.status(201).json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create invoice.' });
	}
});

// Get invoice by ID (GET /invoices/:id)
router.get('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid invoice id.' });
	}
	try {
		const invoice = await invoiceService.getInvoice(businessId, req.params.id);
		if (!invoice) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoice.' });
	}
});

// Update invoice (PUT /invoices/:id)
router.put('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid invoice id.' });
	}
	if (!hasInvoicePayload(req.body)) {
		return res.status(400).json({ error: 'Missing required invoice fields.' });
	}
	try {
		const invoice = await invoiceService.updateInvoice(businessId, req.params.id, req.body);
		if (!invoice) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update invoice.' });
	}
});

// Delete invoice (DELETE /invoices/:id)
router.delete('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid invoice id.' });
	}
	try {
		const deleted = await invoiceService.deleteInvoice(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete invoice.' });
	}
});

module.exports = router;
