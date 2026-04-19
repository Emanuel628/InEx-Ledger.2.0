// Invoices API routes (V2/Business)
const express = require('express');
const router = express.Router();
const invoiceService = require('../services/invoiceService');

// Placeholder: List invoices (GET /invoices)
router.get('/', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return empty array
		res.json([]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoices.' });
	}
});

// Placeholder: Create invoice (POST /invoices)
router.post('/', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back posted data
		res.status(201).json({ ...req.body, id: 'stub-id' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create invoice.' });
	}
});

// Placeholder: Get invoice by ID (GET /invoices/:id)
router.get('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return stub invoice
		res.json({ id: req.params.id, number: 'INV-0001' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoice.' });
	}
});

// Placeholder: Update invoice (PUT /invoices/:id)
router.put('/:id', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back updated data
		res.json({ ...req.body, id: req.params.id });
	} catch (err) {
		res.status(500).json({ error: 'Failed to update invoice.' });
	}
});

// Placeholder: Delete invoice (DELETE /invoices/:id)
router.delete('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return success
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete invoice.' });
	}
});

module.exports = router;
