// Bills API routes (V2/Business)
const express = require('express');
const router = express.Router();

const billService = require('../services/billService');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

router.use(requireV2BusinessEnabled, requireV2Entitlement);

// List bills (GET /bills)
router.get('/', async (req, res) => {
	const businessId = req.business.id;
	try {
		const bills = await billService.listBills(businessId);
		res.json(bills);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load bills.' });
	}
});

// Create bill (POST /bills)
router.post('/', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.vendor_id || !req.body?.number || !req.body?.status || !req.body?.issue_date || !req.body?.total_amount || !req.body?.currency) {
		return res.status(400).json({ error: 'Missing required bill fields.' });
	}
	try {
		const bill = await billService.createBill(businessId, req.body);
		res.status(201).json(bill);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create bill.' });
	}
});

// Get bill by ID (GET /bills/:id)
router.get('/:id', async (req, res) => {
	const businessId = req.business.id;
	try {
		const bill = await billService.getBill(businessId, req.params.id);
		if (!bill) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json(bill);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load bill.' });
	}
});

// Update bill (PUT /bills/:id)
router.put('/:id', async (req, res) => {
	const businessId = req.business.id;
	if (!req.body?.vendor_id || !req.body?.number || !req.body?.status || !req.body?.issue_date || !req.body?.total_amount || !req.body?.currency) {
		return res.status(400).json({ error: 'Missing required bill fields.' });
	}
	try {
		const bill = await billService.updateBill(businessId, req.params.id, req.body);
		if (!bill) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json(bill);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update bill.' });
	}
});

// Delete bill (DELETE /bills/:id)
router.delete('/:id', async (req, res) => {
	const businessId = req.business.id;
	try {
		const deleted = await billService.deleteBill(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Bill not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete bill.' });
	}
});

module.exports = router;
