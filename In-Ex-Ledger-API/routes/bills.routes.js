// Bills API routes (V2/Business)
const express = require('express');
const router = express.Router();

const billService = require('../services/billService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { logError } = require('../utils/logger.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILL_STATUS_VALUES = new Set(['draft', 'open', 'sent', 'partial', 'paid', 'void']);

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:bills' }));
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

function formatRouteError(err) {
	return err instanceof Error ? err.message : String(err || 'unknown_error');
}

// List bills (GET /bills)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const bills = await billService.listBills(businessId);
		res.json(bills);
	} catch (err) {
		logError('GET /bills failed', { err: formatRouteError(err), businessId });
		res.status(500).json({ error: 'Failed to load bills.' });
	}
});

// Create bill (POST /bills)
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!hasBillPayload(req.body)) {
		return res.status(400).json({ error: 'Missing required bill fields.' });
	}
	try {
		const bill = await billService.createBill(businessId, req.body);
		res.status(201).json(bill);
	} catch (err) {
		logError('POST /bills failed', { err: formatRouteError(err), businessId });
		res.status(500).json({ error: 'Failed to create bill.' });
	}
});

// Get bill by ID (GET /bills/:id)
router.get('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid bill id.' });
	}
	try {
		const bill = await billService.getBill(businessId, req.params.id);
		if (!bill) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json(bill);
	} catch (err) {
		logError('GET /bills/:id failed', { err: formatRouteError(err), businessId, billId: req.params.id });
		res.status(500).json({ error: 'Failed to load bill.' });
	}
});

// Update bill (PUT /bills/:id)
router.put('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid bill id.' });
	}
	if (!hasBillPayload(req.body)) {
		return res.status(400).json({ error: 'Missing required bill fields.' });
	}
	try {
		const bill = await billService.updateBill(businessId, req.params.id, req.body);
		if (!bill) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json(bill);
	} catch (err) {
		logError('PUT /bills/:id failed', { err: formatRouteError(err), businessId, billId: req.params.id });
		res.status(500).json({ error: 'Failed to update bill.' });
	}
});

// Delete bill (DELETE /bills/:id)
router.delete('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid bill id.' });
	}
	try {
		const deleted = await billService.deleteBill(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		logError('DELETE /bills/:id failed', { err: formatRouteError(err), businessId, billId: req.params.id });
		res.status(500).json({ error: 'Failed to delete bill.' });
	}
});

module.exports = router;
