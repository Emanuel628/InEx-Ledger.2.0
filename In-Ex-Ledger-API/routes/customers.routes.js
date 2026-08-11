// Customers API routes (V2/Business)
const express = require('express');
const router = express.Router();

const customerService = require('../services/customerService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:customers' }));
router.use((req, res, next) => (
	["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
		? requireCsrfProtection(req, res, next)
		: next()
));

function hasCustomerPayload(body) {
	return typeof body?.name === 'string' && body.name.trim().length > 0;
}

// List customers (GET /customers)
router.get('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	const customers = await customerService.listCustomers(businessId);
	res.json(customers);
}));

// Create customer (POST /customers)
router.post('/', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!hasCustomerPayload(req.body)) {
		throw new ApiError(400, 'Customer name is required.');
	}
	const customer = await customerService.createCustomer(businessId, req.body);
	res.status(201).json(customer);
}));

// Get customer by ID (GET /customers/:id)
router.get('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid customer id.');
	}
	const customer = await customerService.getCustomer(businessId, req.params.id);
	if (!customer) {
		throw new ApiError(404, 'Customer not found.');
	}
	res.json(customer);
}));

// Update customer (PUT /customers/:id)
router.put('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid customer id.');
	}
	if (!hasCustomerPayload(req.body)) {
		throw new ApiError(400, 'Customer name is required.');
	}
	const customer = await customerService.updateCustomer(businessId, req.params.id, req.body);
	if (!customer) {
		throw new ApiError(404, 'Customer not found.');
	}
	res.json(customer);
}));

// Delete customer (DELETE /customers/:id)
router.delete('/:id', asyncRoute(async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		throw new ApiError(400, 'Invalid customer id.');
	}
	const deleted = await customerService.deleteCustomer(businessId, req.params.id);
	if (!deleted) {
		throw new ApiError(404, 'Customer not found.');
	}
	res.json({ success: true });
}));

module.exports = router;
