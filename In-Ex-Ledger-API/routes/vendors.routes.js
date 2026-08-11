// Vendors API routes (V2/Business)
const express = require('express');
const router = express.Router();

const vendorService = require('../services/vendorService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:vendors' }));
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

function hasVendorPayload(body) {
	return typeof body?.name === 'string' && body.name.trim().length > 0;
}

// List vendors (GET /vendors)
router.get('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	const vendors = await vendorService.listVendors(businessId);
	res.json(vendors);
}));

// Create vendor (POST /vendors)
router.post('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!hasVendorPayload(req.body)) {
		throw new ApiError(400, 'Vendor name is required.');
	}
	const vendor = await vendorService.createVendor(businessId, req.body);
	res.status(201).json(vendor);
}));

// Get vendor by ID (GET /vendors/:id)
router.get('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid vendor id.');
	}
	const vendor = await vendorService.getVendor(businessId, req.params.id);
	if (!vendor) {
		throw new ApiError(404, 'Vendor not found.');
	}
	res.json(vendor);
}));

// Update vendor (PUT /vendors/:id)
router.put('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid vendor id.');
	}
	if (!hasVendorPayload(req.body)) {
		throw new ApiError(400, 'Vendor name is required.');
	}
	const vendor = await vendorService.updateVendor(businessId, req.params.id, req.body);
	if (!vendor) {
		throw new ApiError(404, 'Vendor not found.');
	}
	res.json(vendor);
}));

// Delete vendor (DELETE /vendors/:id)
router.delete('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid vendor id.');
	}
	const deleted = await vendorService.deleteVendor(businessId, req.params.id);
	if (!deleted) {
		throw new ApiError(404, 'Vendor not found.');
	}
	res.json({ success: true });
}));

module.exports = router;
