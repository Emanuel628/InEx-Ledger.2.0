// Vendors API routes (V2/Business)
const express = require('express');
const router = express.Router();

const vendorService = require('../services/vendorService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);

function isUuid(value) {
	return UUID_RE.test(String(value || ''));
}

function hasVendorPayload(body) {
	return typeof body?.name === 'string' && body.name.trim().length > 0;
}

// List vendors (GET /vendors)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const vendors = await vendorService.listVendors(businessId);
		res.json(vendors);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load vendors.' });
	}
});

// Create vendor (POST /vendors)
router.post('/', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!hasVendorPayload(req.body)) {
		return res.status(400).json({ error: 'Vendor name is required.' });
	}
	try {
		const vendor = await vendorService.createVendor(businessId, req.body);
		res.status(201).json(vendor);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create vendor.' });
	}
});

// Get vendor by ID (GET /vendors/:id)
router.get('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid vendor id.' });
	}
	try {
		const vendor = await vendorService.getVendor(businessId, req.params.id);
		if (!vendor) {
			return res.status(404).json({ error: 'Vendor not found.' });
		}
		res.json(vendor);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load vendor.' });
	}
});

// Update vendor (PUT /vendors/:id)
router.put('/:id', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid vendor id.' });
	}
	if (!hasVendorPayload(req.body)) {
		return res.status(400).json({ error: 'Vendor name is required.' });
	}
	try {
		const vendor = await vendorService.updateVendor(businessId, req.params.id, req.body);
		if (!vendor) {
			return res.status(404).json({ error: 'Vendor not found.' });
		}
		res.json(vendor);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update vendor.' });
	}
});

// Delete vendor (DELETE /vendors/:id)
router.delete('/:id', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid vendor id.' });
	}
	try {
		const deleted = await vendorService.deleteVendor(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Vendor not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete vendor.' });
	}
});

module.exports = router;
