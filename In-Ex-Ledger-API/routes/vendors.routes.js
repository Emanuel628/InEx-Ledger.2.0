// Vendors API routes (V2/Business)
const express = require('express');
const router = express.Router();

const vendorService = require('../services/vendorService');

// Feature flag and entitlement middleware
function requireV2BusinessEnabled(req, res, next) {
	if (process.env.ENABLE_V2_BUSINESS !== 'true') {
		return res.status(403).json({ error: 'V2/Business features are not enabled.' });
	}
	// TODO: Add real entitlement checks here (e.g., req.user.entitlements)
	next();
}

// List vendors (GET /vendors)
router.get('/', requireV2BusinessEnabled, async (req, res) => {
	// TODO: Replace with real business context and entitlement checks
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const vendors = await vendorService.listVendors(businessId);
		res.json(vendors);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load vendors.' });
	}
});

// Create vendor (POST /vendors)
router.post('/', requireV2BusinessEnabled, async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
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
router.get('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
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
router.put('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
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
router.delete('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
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
