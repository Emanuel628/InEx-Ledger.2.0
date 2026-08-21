// Invoice service logic (V2/Business)
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

async function listInvoices(businessId) {
  const result = await pool.query(
    'SELECT * FROM invoices WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

function validateInvoiceInput(data) {
  const customer_id = requireUuid(data?.customer_id, 'customer_id');
  const number = requireDocumentNumber(data?.number, 'number');
  const status = requireDocumentStatus(data?.status, 'status');
  const issue_date = requireDateOnly(data?.issue_date, 'issue_date');
  const due_date = optionalDateOnly(data?.due_date, 'due_date');
  const total_amount = requireFiniteNonNegativeAmount(data?.total_amount, 'total_amount');
  const currency = requireCurrency(data?.currency, 'currency');
  const metadata = optionalJsonObject(data?.metadata, 'metadata');
  return { customer_id, number, status, issue_date, due_date, total_amount, currency, metadata };
}

async function createInvoice(businessId, data) {
  const v = validateInvoiceInput(data);
  const result = await pool.query(
    `INSERT INTO invoices (business_id, customer_id, number, status, issue_date, due_date, total_amount, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [businessId, v.customer_id, v.number, v.status, v.issue_date, v.due_date, v.total_amount, v.currency, v.metadata]
  );
  return result.rows[0];
}

async function getInvoice(businessId, invoiceId) {
  const result = await pool.query(
    'SELECT * FROM invoices WHERE business_id = $1 AND id = $2',
    [businessId, invoiceId]
  );
  return result.rows[0] || null;
}

async function updateInvoice(businessId, invoiceId, data) {
  const v = validateInvoiceInput(data);
  const result = await pool.query(
    `UPDATE invoices SET customer_id = $1, number = $2, status = $3, issue_date = $4, due_date = $5, total_amount = $6, currency = $7, metadata = $8, updated_at = now()
     WHERE business_id = $9 AND id = $10 RETURNING *`,
    [v.customer_id, v.number, v.status, v.issue_date, v.due_date, v.total_amount, v.currency, v.metadata, businessId, invoiceId]
  );
  return result.rows[0] || null;
}

// NOTE: hard delete. The `invoices` table (db/migrations/20260419_create_v2_
// business_tables.sql) has no `deleted_at`/audit columns. (A different table,
// `invoices_v1` -- the older Pro-plan invoicing feature, unrelated to this
// V2/Business `invoices` table -- got deleted_at/deleted_by columns via
// db/migrations/20260513_add_invoice_soft_delete.sql; that migration does not
// apply here.) Adding soft-delete parity with `transactions` (see
// services/transactionAuditService.js) would require a new migration adding
// those columns to `invoices` (and updating listInvoices/getInvoice to filter
// them out) -- that schema change is out of scope for this pass and is left
// as a flagged follow-up rather than invented ad hoc against real financial
// data. Also note: `payments` rows reference invoices via ON DELETE CASCADE,
// so a hard delete here silently deletes payment history too -- another
// reason soft-delete parity matters and should be tracked.
async function deleteInvoice(businessId, invoiceId) {
  const result = await pool.query(
    'DELETE FROM invoices WHERE business_id = $1 AND id = $2 RETURNING id',
    [businessId, invoiceId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice
};
