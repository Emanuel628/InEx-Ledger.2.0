const express = require('express');
const router = express.Router();
const BillableExpenseService = require('../services/billableExpenseService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { normalizeV2Metadata } = require('../api/utils/v2MetadataValidator');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

// V2 feature and entitlement checks run once at the parent routes/index.js mount.
router.use(requireAuth);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:billable-expenses' }));
router.use((req, res, next) => (
  ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ? requireCsrfProtection(req, res, next)
    : next()
));

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

function validateMetadata(body) {
  const normalized = normalizeV2Metadata(body?.metadata);
  if (!normalized.ok) {
    return normalized;
  }
  body.metadata = normalized.value;
  return normalized;
}

// List billable expenses
router.get('/', asyncRoute(async (req, res) => {
  const expenses = await BillableExpenseService.listBillableExpenses(req.business.id);
  res.json({ expenses });
}));

// Get billable expense by id
router.get('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid billable expense id.');
  }
  const expense = await BillableExpenseService.getBillableExpense(req.business.id, req.params.id);
  if (!expense) throw new ApiError(404, 'Billable expense not found');
  res.json({ expense });
}));

// Create billable expense
router.post('/', asyncRoute(async (req, res) => {
  if (!hasBillableExpensePayload(req.body)) {
    throw new ApiError(400, 'Missing required billable expense fields.');
  }
  const metadataCheck = validateMetadata(req.body);
  if (!metadataCheck.ok) {
    throw new ApiError(400, metadataCheck.error);
  }
  const expense = await BillableExpenseService.createBillableExpense(req.business.id, req.body);
  res.status(201).json({ expense });
}));

// Update billable expense
router.put('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid billable expense id.');
  }
  if (!hasBillableExpensePayload(req.body)) {
    throw new ApiError(400, 'Missing required billable expense fields.');
  }
  const metadataCheck = validateMetadata(req.body);
  if (!metadataCheck.ok) {
    throw new ApiError(400, metadataCheck.error);
  }
  const expense = await BillableExpenseService.updateBillableExpense(req.business.id, req.params.id, req.body);
  if (!expense) throw new ApiError(404, 'Billable expense not found');
  res.json({ expense });
}));

// Delete billable expense
router.delete('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid billable expense id.');
  }
  const deleted = await BillableExpenseService.deleteBillableExpense(req.business.id, req.params.id);
  if (!deleted) throw new ApiError(404, 'Billable expense not found');
  res.json({ success: true });
}));

module.exports = router;
