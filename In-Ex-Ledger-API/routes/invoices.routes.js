// Invoices API routes (V2/Business)
const express = require('express');
const router = express.Router();

const invoiceService = require('../services/invoiceService');

// Feature flag and entitlement middleware
function requireV2BusinessEnabled(req, res, next) {
	if (process.env.ENABLE_V2_BUSINESS !== 'true') {
		return res.status(403).json({ error: 'V2/Business features are not enabled.' });
	}
	// TODO: Add real entitlement checks here (e.g., req.user.entitlements)
	next();
}

// List invoices (GET /invoices)
router.get('/', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const invoices = await invoiceService.listInvoices(businessId);
		res.json(invoices);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoices.' });
	}
});

// Create invoice (POST /invoices)
router.post('/', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	if (!req.body?.customer_id || !req.body?.number || !req.body?.status || !req.body?.issue_date || !req.body?.total_amount || !req.body?.currency) {
		return res.status(400).json({ error: 'Missing required invoice fields.' });
	}
	try {
		const invoice = await invoiceService.createInvoice(businessId, req.body);
		res.status(201).json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to create invoice.' });
	}
});

// Get invoice by ID (GET /invoices/:id)
router.get('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const invoice = await invoiceService.getInvoice(businessId, req.params.id);
		if (!invoice) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to load invoice.' });
	}
});

// Update invoice (PUT /invoices/:id)
router.put('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	if (!req.body?.customer_id || !req.body?.number || !req.body?.status || !req.body?.issue_date || !req.body?.total_amount || !req.body?.currency) {
		return res.status(400).json({ error: 'Missing required invoice fields.' });
	}
	try {
		const invoice = await invoiceService.updateInvoice(businessId, req.params.id, req.body);
		if (!invoice) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json(invoice);
	} catch (err) {
		res.status(500).json({ error: 'Failed to update invoice.' });
	}
});

// Delete invoice (DELETE /invoices/:id)
router.delete('/:id', requireV2BusinessEnabled, async (req, res) => {
	const businessId = req.user?.business_id || req.user?.active_business_id || null;
	if (!businessId) {
		return res.status(400).json({ error: 'Missing business context.' });
	}
	try {
		const deleted = await invoiceService.deleteInvoice(businessId, req.params.id);
		if (!deleted) {
			return res.status(404).json({ error: 'Invoice not found.' });
		}
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: 'Failed to delete invoice.' });
	}
});

module.exports = router;
