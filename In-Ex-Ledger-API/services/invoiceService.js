// Invoice service logic (V2/Business)
const db = require('../db');

async function listInvoices(businessId) {
  const result = await db.query(
    'SELECT * FROM invoices WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

async function createInvoice(businessId, data) {
  const result = await db.query(
    `INSERT INTO invoices (business_id, customer_id, number, status, issue_date, due_date, total_amount, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [businessId, data.customer_id, data.number, data.status, data.issue_date, data.due_date, data.total_amount, data.currency, data.metadata || null]
  );
  return result.rows[0];
}

async function getInvoice(businessId, invoiceId) {
  const result = await db.query(
    'SELECT * FROM invoices WHERE business_id = $1 AND id = $2',
    [businessId, invoiceId]
  );
  return result.rows[0] || null;
}

async function updateInvoice(businessId, invoiceId, data) {
  const result = await db.query(
    `UPDATE invoices SET customer_id = $1, number = $2, status = $3, issue_date = $4, due_date = $5, total_amount = $6, currency = $7, metadata = $8, updated_at = now()
     WHERE business_id = $9 AND id = $10 RETURNING *`,
    [data.customer_id, data.number, data.status, data.issue_date, data.due_date, data.total_amount, data.currency, data.metadata || null, businessId, invoiceId]
  );
  return result.rows[0] || null;
}

async function deleteInvoice(businessId, invoiceId) {
  const result = await db.query(
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
