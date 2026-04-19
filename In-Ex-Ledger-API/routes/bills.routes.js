// Bills API routes (V2/Business)
const express = require('express');
const router = express.Router();
const billService = require('../services/billService');

// Placeholder: List bills (GET /bills)
router.get('/', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return empty array
		res.json([]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load bills.' });
	}
});

// Placeholder: Create bill (POST /bills)
router.post('/', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back posted data
		res.status(201).json({ ...req.body, id: 'stub-id' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create bill.' });
	}
});

// Placeholder: Get bill by ID (GET /bills/:id)
router.get('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return stub bill
		res.json({ id: req.params.id, number: 'BILL-0001' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to load bill.' });
	}
});

// Placeholder: Update bill (PUT /bills/:id)
router.put('/:id', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back updated data
		res.json({ ...req.body, id: req.params.id });
	} catch (err) {
		res.status(500).json({ error: 'Failed to update bill.' });
	}
});

// Placeholder: Delete bill (DELETE /bills/:id)
router.delete('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return success
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete bill.' });
	}
});

module.exports = router;
