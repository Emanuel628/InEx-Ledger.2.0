// Vendors API routes (V2/Business)
const express = require('express');
const router = express.Router();
const vendorService = require('../services/vendorService');

// Placeholder: List vendors (GET /vendors)
router.get('/', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return empty array
		res.json([]);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load vendors.' });
	}
});

// Placeholder: Create vendor (POST /vendors)
router.post('/', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back posted data
		res.status(201).json({ ...req.body, id: 'stub-id' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to create vendor.' });
	}
});

// Placeholder: Get vendor by ID (GET /vendors/:id)
router.get('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return stub vendor
		res.json({ id: req.params.id, name: 'Stub Vendor' });
	} catch (err) {
		res.status(500).json({ error: 'Failed to load vendor.' });
	}
});

// Placeholder: Update vendor (PUT /vendors/:id)
router.put('/:id', async (req, res) => {
	// TODO: Add validation, business context, and entitlement checks
	try {
		// Placeholder: echo back updated data
		res.json({ ...req.body, id: req.params.id });
	} catch (err) {
		res.status(500).json({ error: 'Failed to update vendor.' });
	}
});

// Placeholder: Delete vendor (DELETE /vendors/:id)
router.delete('/:id', async (req, res) => {
	// TODO: Add business context and entitlement checks
	try {
		// Placeholder: return success
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete vendor.' });
	}
});

module.exports = router;
