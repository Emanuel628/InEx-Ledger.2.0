// Vendors API routes (V2/Business)
const express = require('express');
const router = express.Router();

const vendorService = require('../services/vendorService');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

router.use(requireV2BusinessEnabled, requireV2Entitlement);

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
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.name) {
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
router.put('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.name) {
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
router.delete('/:id', async (req, res) => {
	const businessId = req.business.id;
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
