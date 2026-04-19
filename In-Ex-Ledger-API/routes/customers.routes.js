// Customers API routes (V2/Business)
const express = require('express');
const router = express.Router();

const customerService = require('../services/customerService');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

router.use(requireV2BusinessEnabled, requireV2Entitlement);

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
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.name) {
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
router.put('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.name) {
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
router.delete('/:id', async (req, res) => {
	const businessId = req.business.id;
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
