// Customers API routes (V2/Business)
const express = require('express');
const router = express.Router();

const customerService = require('../services/customerService');

// Feature flag and entitlement middleware
function requireV2BusinessEnabled(req, res, next) {
	if (process.env.ENABLE_V2_BUSINESS !== 'true') {
		return res.status(403).json({ error: 'V2/Business features are not enabled.' });
	}
	// TODO: Add real entitlement checks here (e.g., req.user.entitlements)
	next();
}

// List customers (GET /customers)
router.get('/', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const customers = await customerService.listCustomers(businessId);
		res.json(customers);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load customers.' });
	}
});

// Create customer (POST /customers)
router.post('/', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
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
router.get('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
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
router.put('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
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
router.delete('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
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
