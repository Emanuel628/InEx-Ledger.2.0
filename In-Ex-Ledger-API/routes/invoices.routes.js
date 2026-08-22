// Invoices API routes (V2/Business)
const express = require('express');
const router = express.Router();

const invoiceService = require('../services/invoiceService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { normalizeV2Metadata } = require('../api/utils/v2MetadataValidator');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

const INVOICE_STATUS_VALUES = new Set(['draft', 'open', 'sent', 'partial', 'paid', 'void']);

router.use(requireAuth);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:invoices' }));
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

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
router.get('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	const invoices = await invoiceService.listInvoices(businessId);
	res.json(invoices);
}));

// Create invoice (POST /invoices)
router.post('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!hasInvoicePayload(req.body)) {
		throw new ApiError(400, 'Missing required invoice fields.');
	}
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		throw new ApiError(400, metadataCheck.error);
	}
	const invoice = await invoiceService.createInvoice(businessId, req.body);
	res.status(201).json(invoice);
}));

// Get invoice by ID (GET /invoices/:id)
router.get('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid invoice id.');
	}
	const invoice = await invoiceService.getInvoice(businessId, req.params.id);
	if (!invoice) {
		throw new ApiError(404, 'Invoice not found.');
	}
	res.json(invoice);
}));

// Update invoice (PUT /invoices/:id)
router.put('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid invoice id.');
	}
	if (!hasInvoicePayload(req.body)) {
		throw new ApiError(400, 'Missing required invoice fields.');
	}
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		throw new ApiError(400, metadataCheck.error);
	}
	const invoice = await invoiceService.updateInvoice(businessId, req.params.id, req.body);
	if (!invoice) {
		throw new ApiError(404, 'Invoice not found.');
	}
	res.json(invoice);
}));

// Delete invoice (DELETE /invoices/:id)
router.delete('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid invoice id.');
	}
	const deleted = await invoiceService.deleteInvoice(businessId, req.params.id, { userId: req.user?.id || null });
	if (!deleted) {
		throw new ApiError(404, 'Invoice not found.');
	}
	res.json({ success: true });
}));

module.exports = router;
