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
    'SELECT * FROM bills WHERE business_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
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
    'SELECT * FROM bills WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL',
    [businessId, billId]
  );
  return result.rows[0] || null;
}

async function updateBill(businessId, billId, data) {
  const v = validateBillInput(data);
  const result = await pool.query(
    `UPDATE bills SET vendor_id = $1, number = $2, status = $3, issue_date = $4, due_date = $5, total_amount = $6, currency = $7, metadata = $8, updated_at = now()
     WHERE business_id = $9 AND id = $10 AND deleted_at IS NULL RETURNING *`,
    [v.vendor_id, v.number, v.status, v.issue_date, v.due_date, v.total_amount, v.currency, v.metadata, businessId, billId]
  );
  return result.rows[0] || null;
}

async function deleteBill(businessId, billId, { userId = null, reason = 'user_deleted' } = {}) {
  const result = await pool.query(
    `UPDATE bills
        SET deleted_at = now(),
            deleted_by_id = $3,
            deleted_reason = $4,
            updated_at = now()
      WHERE business_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id`,
    [businessId, billId, userId, reason]
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
