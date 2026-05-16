const express = require('express');
const router = express.Router();
const BillableExpenseService = require('../services/billableExpenseService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');
const { logError } = require('../utils/logger.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// All routes require V2 feature flag and entitlement
router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:billable-expenses' }));
router.use((req, res, next) => (
  ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ? requireCsrfProtection(req, res, next)
    : next()
));

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function isValidDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function hasBillableExpensePayload(body) {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const amount = Number(body.amount);
  const currency = String(body.currency || '').trim();
  return (
    isUuid(body.project_id) &&
    typeof body.description === 'string' &&
    body.description.trim().length > 0 &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    /^[A-Za-z]{3}$/.test(currency) &&
    isValidDateOnly(body.expense_date)
	);
}

function formatRouteError(err) {
  return err instanceof Error ? err.message : String(err || 'unknown_error');
}

// List billable expenses
router.get('/', async (req, res) => {
  try {
    const expenses = await BillableExpenseService.listBillableExpenses(req.business.id);
    res.json({ expenses });
  } catch (err) {
    logError('GET /billable-expenses failed', { err: formatRouteError(err), businessId: req.business?.id });
    res.status(500).json({ error: 'Failed to list billable expenses' });
  }
});

// Get billable expense by id
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid billable expense id.' });
  }
  try {
    const expense = await BillableExpenseService.getBillableExpense(req.business.id, req.params.id);
    if (!expense) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ expense });
  } catch (err) {
    logError('GET /billable-expenses/:id failed', { err: formatRouteError(err), businessId: req.business?.id, expenseId: req.params.id });
    res.status(500).json({ error: 'Failed to get billable expense' });
  }
});

// Create billable expense
router.post('/', async (req, res) => {
  if (!hasBillableExpensePayload(req.body)) {
    return res.status(400).json({ error: 'Missing required billable expense fields.' });
  }
  try {
    const expense = await BillableExpenseService.createBillableExpense(req.business.id, req.body);
    res.status(201).json({ expense });
  } catch (err) {
    logError('POST /billable-expenses failed', { err: formatRouteError(err), businessId: req.business?.id });
    res.status(400).json({ error: 'Failed to create billable expense' });
  }
});

// Update billable expense
router.put('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid billable expense id.' });
  }
  if (!hasBillableExpensePayload(req.body)) {
    return res.status(400).json({ error: 'Missing required billable expense fields.' });
  }
  try {
    const expense = await BillableExpenseService.updateBillableExpense(req.business.id, req.params.id, req.body);
    if (!expense) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ expense });
  } catch (err) {
    logError('PUT /billable-expenses/:id failed', { err: formatRouteError(err), businessId: req.business?.id, expenseId: req.params.id });
    res.status(400).json({ error: 'Failed to update billable expense' });
  }
});

// Delete billable expense
router.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid billable expense id.' });
  }
  try {
    const deleted = await BillableExpenseService.deleteBillableExpense(req.business.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Billable expense not found' });
    res.json({ success: true });
  } catch (err) {
    logError('DELETE /billable-expenses/:id failed', { err: formatRouteError(err), businessId: req.business?.id, expenseId: req.params.id });
    res.status(400).json({ error: 'Failed to delete billable expense' });
  }
});

module.exports = router;
