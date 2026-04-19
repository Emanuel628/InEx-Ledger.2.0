const express = require('express');
const router = express.Router();
const BillableExpenseService = require('../services/billableExpenseService');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

// All routes require V2 feature flag and entitlement
router.use(requireV2BusinessEnabled, requireV2Entitlement);

// List billable expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await BillableExpenseService.listBillableExpenses(req.business.id);
    res.json({ expenses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list billable expenses' });
  }
});

// Get billable expense by id
router.get('/:id', async (req, res) => {
  try {
    const expense = await BillableExpenseService.getBillableExpense(req.business.id, req.params.id);
    if (!expense) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ expense });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get billable expense' });
  }
});

// Create billable expense
router.post('/', async (req, res) => {
  try {
    const expense = await BillableExpenseService.createBillableExpense(req.business.id, req.body);
    res.status(201).json({ expense });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create billable expense' });
  }
});

// Update billable expense
router.put('/:id', async (req, res) => {
  try {
    const expense = await BillableExpenseService.updateBillableExpense(req.business.id, req.params.id, req.body);
    if (!expense) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ expense });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update billable expense' });
  }
});

// Delete billable expense
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await BillableExpenseService.deleteBillableExpense(req.business.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete billable expense' });
  }
});

module.exports = router;
