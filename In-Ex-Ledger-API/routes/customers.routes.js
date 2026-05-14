// Customers API routes (V2/Business)
const express = require('express');
const router = express.Router();

const customerService = require('../services/customerService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);

function isUuid(value) {
	return UUID_RE.test(String(value || ''));
}

function hasCustomerPayload(body) {
	return typeof body?.name === 'string' && body.name.trim().length > 0;
}

// List customers (GET /customers)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const customers = await customerService.listCustomers(businessId);
		res.json(customers);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load customers.' });
	}
});

// Create customer (POST /customers)
router.post('/', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!hasCustomerPayload(req.body)) {
		return res.status(400).json({ error: 'Customer name is required.' });
	}
	try {
		const customer = await customerService.createCustomer(businessId, req.body);
		res.status(201).json(customer);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create customer.' });
	}
});

// Get customer by ID (GET /customers/:id)
router.get('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid customer id.' });
	}
	try {
		const customer = await customerService.getCustomer(businessId, req.params.id);
		if (!customer) {
			return res.status(404).json({ error: 'Customer not found.' });
		}
		res.json(customer);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load customer.' });
	}
});

// Update customer (PUT /customers/:id)
router.put('/:id', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid customer id.' });
	}
	if (!hasCustomerPayload(req.body)) {
		return res.status(400).json({ error: 'Customer name is required.' });
	}
	try {
		const customer = await customerService.updateCustomer(businessId, req.params.id, req.body);
		if (!customer) {
			return res.status(404).json({ error: 'Customer not found.' });
		}
		res.json(customer);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update customer.' });
	}
});

// Delete customer (DELETE /customers/:id)
router.delete('/:id', requireCsrfProtection, async (req, res) => {
	const businessId = req.business.id;
	if (!isUuid(req.params.id)) {
		return res.status(400).json({ error: 'Invalid customer id.' });
	}
	try {
		const deleted = await customerService.deleteCustomer(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Customer not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete customer.' });
	}
});

module.exports = router;
