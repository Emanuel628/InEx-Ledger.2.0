// Bills API routes (V2/Business)
const express = require('express');
const router = express.Router();

const billService = require('../services/billService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { normalizeV2Metadata } = require('../api/utils/v2MetadataValidator');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

const BILL_STATUS_VALUES = new Set(['draft', 'open', 'sent', 'partial', 'paid', 'void']);

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:bills' }));
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

function isValidDateOnly(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function hasBillPayload(body) {
	if (!body || typeof body !== 'object') {
		return false;
	}
	const status = String(body.status || '').trim().toLowerCase();
	const amount = Number(body.total_amount);
	const currency = String(body.currency || '').trim();
	return (
		isUuid(body.vendor_id) &&
		typeof body.number === 'string' &&
		body.number.trim().length > 0 &&
		BILL_STATUS_VALUES.has(status) &&
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

// List bills (GET /bills)
router.get('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	const bills = await billService.listBills(businessId);
	res.json(bills);
}));

// Create bill (POST /bills)
router.post('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!hasBillPayload(req.body)) {
		throw new ApiError(400, 'Missing required bill fields.');
	}
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		throw new ApiError(400, metadataCheck.error);
	}
	const bill = await billService.createBill(businessId, req.body);
	res.status(201).json(bill);
}));

// Get bill by ID (GET /bills/:id)
router.get('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid bill id.');
	}
	const bill = await billService.getBill(businessId, req.params.id);
	if (!bill) {
		throw new ApiError(404, 'Bill not found.');
	}
	res.json(bill);
}));

// Update bill (PUT /bills/:id)
router.put('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid bill id.');
	}
	if (!hasBillPayload(req.body)) {
		throw new ApiError(400, 'Missing required bill fields.');
	}
	const metadataCheck = validateMetadata(req.body);
	if (!metadataCheck.ok) {
		throw new ApiError(400, metadataCheck.error);
	}
	const bill = await billService.updateBill(businessId, req.params.id, req.body);
	if (!bill) {
		throw new ApiError(404, 'Bill not found.');
	}
	res.json(bill);
}));

// Delete bill (DELETE /bills/:id)
router.delete('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid bill id.');
	}
	const deleted = await billService.deleteBill(businessId, req.params.id);
	if (!deleted) {
		throw new ApiError(404, 'Bill not found.');
	}
	res.json({ success: true });
}));

module.exports = router;
