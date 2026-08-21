// Bill service logic (V2/Business)
const { pool } = require('../db');
const {
  requireUuid,
  requireDocumentNumber,
  requireDocumentStatus,
  requireDateOnly,
  optionalDateOnly,
  requireFiniteNonNegativeAmount,
  requireCurrency,
  optionalJsonObject
} = require('./v2BusinessValidationService');

async function listBills(businessId) {
  const result = await pool.query(
    'SELECT * FROM bills WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

function validateBillInput(data) {
  const vendor_id = requireUuid(data?.vendor_id, 'vendor_id');
  const number = requireDocumentNumber(data?.number, 'number');
  const status = requireDocumentStatus(data?.status, 'status');
  const issue_date = requireDateOnly(data?.issue_date, 'issue_date');
  const due_date = optionalDateOnly(data?.due_date, 'due_date');
  const total_amount = requireFiniteNonNegativeAmount(data?.total_amount, 'total_amount');
  const currency = requireCurrency(data?.currency, 'currency');
  const metadata = optionalJsonObject(data?.metadata, 'metadata');
  return { vendor_id, number, status, issue_date, due_date, total_amount, currency, metadata };
}

async function createBill(businessId, data) {
  const v = validateBillInput(data);
  const result = await pool.query(
    `INSERT INTO bills (business_id, vendor_id, number, status, issue_date, due_date, total_amount, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [businessId, v.vendor_id, v.number, v.status, v.issue_date, v.due_date, v.total_amount, v.currency, v.metadata]
  );
  return result.rows[0];
}

async function getBill(businessId, billId) {
  const result = await pool.query(
    'SELECT * FROM bills WHERE business_id = $1 AND id = $2',
    [businessId, billId]
  );
  return result.rows[0] || null;
}

async function updateBill(businessId, billId, data) {
  const v = validateBillInput(data);
  const result = await pool.query(
    `UPDATE bills SET vendor_id = $1, number = $2, status = $3, issue_date = $4, due_date = $5, total_amount = $6, currency = $7, metadata = $8, updated_at = now()
     WHERE business_id = $9 AND id = $10 RETURNING *`,
    [v.vendor_id, v.number, v.status, v.issue_date, v.due_date, v.total_amount, v.currency, v.metadata, businessId, billId]
  );
  return result.rows[0] || null;
}

// NOTE: hard delete. The `bills` table (db/migrations/20260419_create_v2_
// business_tables.sql) has no `deleted_at`/audit columns, unlike
// `transactions` (see services/transactionAuditService.js, which soft-deletes
// via deleted_at/is_void/deleted_by_id/deleted_reason). Adding soft-delete
// parity here would require a new migration adding those columns to `bills`
// (and updating listBills/getBill to filter them out) -- that schema change
// is out of scope for this pass and is left as a flagged follow-up rather
// than invented ad hoc against real financial data. Also note: `payments`
// rows reference bills via ON DELETE CASCADE, so a hard delete here silently
// deletes payment history too -- another reason soft-delete parity matters
// and should be tracked.
async function deleteBill(businessId, billId) {
  const result = await pool.query(
    'DELETE FROM bills WHERE business_id = $1 AND id = $2 RETURNING id',
    [businessId, billId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listBills,
  createBill,
  getBill,
  updateBill,
  deleteBill
};
