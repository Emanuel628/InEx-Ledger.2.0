// Customers API routes (V2/Business)
const express = require('express');
const router = express.Router();
const customerService = require('../services/customerService');

// Placeholder: List customers (GET /customers)
router.get('/', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return empty array
		res.json([]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load customers.' });
	}
});

// Placeholder: Create customer (POST /customers)
router.post('/', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back posted data
		res.status(201).json({ ...req.body, id: 'stub-id' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create customer.' });
	}
});

// Placeholder: Get customer by ID (GET /customers/:id)
router.get('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return stub customer
		res.json({ id: req.params.id, name: 'Stub Customer' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to load customer.' });
	}
});

// Placeholder: Update customer (PUT /customers/:id)
router.put('/:id', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back updated data
		res.json({ ...req.body, id: req.params.id });
	} catch (err) {
		res.status(500).json({ error: 'Failed to update customer.' });
	}
});

// Placeholder: Delete customer (DELETE /customers/:id)
router.delete('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return success
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete customer.' });
	}
});

module.exports = router;
