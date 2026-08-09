// Invoices API routes (V2/Business)
const express = require('express');
const router = express.Router();

const invoiceService = require('../services/invoiceService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { normalizeV2Metadata } = require('../api/utils/v2MetadataValidator');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { logError } = require('../utils/logger.js');

const INVOICE_STATUS_VALUES = new Set(['draft', 'open', 'sent', 'partial', 'paid', 'void']);

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:invoices' }));
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

function formatRouteError(err) {
	return err instanceof Error ? err.message : String(err || 'unknown_error');
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

function validateMetadata(body) {
	const normalized = normalizeV2Metadata(body?.metadata);
	if (!normalized.ok) {
		return normalized;
	}
	body.metadata = normalized.value;
	return normalized;
}

// List invoices (GET /invoices)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const invoices = await invoiceService.listInvoices(businessId);
		res.json(invoices);
	} catch (err) {
		logError('GET /invoices failed', { err: formatRouteError(err), businessId });
		res.status(500).json({ error: 'Failed to load invoices.' });
	}
});

// Create invoice (POST /invoices)
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!hasInvoicePayload(req.body)) {
		return res.status(400).json({ error: 'Missing required invoice fields.' });
	}
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		return res.status(400).json({ error: metadataCheck.error });
	}
	try {
		const invoice = await invoiceService.createInvoice(businessId, req.body);
		res.status(201).json(invoice);
	} catch (err) {
		logError('POST /invoices failed', { err: formatRouteError(err), businessId });
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
		logError('GET /invoices/:id failed', { err: formatRouteError(err), businessId, invoiceId: req.params.id });
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
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		return res.status(400).json({ error: metadataCheck.error });
	}
	try {
		const invoice = await invoiceService.updateInvoice(businessId, req.params.id, req.body);
		if (!invoice) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json(invoice);
	} catch (err) {
		logError('PUT /invoices/:id failed', { err: formatRouteError(err), businessId, invoiceId: req.params.id });
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
		logError('DELETE /invoices/:id failed', { err: formatRouteError(err), businessId, invoiceId: req.params.id });
		res.status(500).json({ error: 'Failed to delete invoice.' });
	}
});

module.exports = router;
