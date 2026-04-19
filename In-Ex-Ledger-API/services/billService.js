// Bill service logic (V2/Business)
const db = require('../db');

async function listBills(businessId) {
  const result = await db.query(
    'SELECT * FROM bills WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

async function createBill(businessId, data) {
  const result = await db.query(
    `INSERT INTO bills (business_id, vendor_id, number, status, issue_date, due_date, total_amount, currency, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [businessId, data.vendor_id, data.number, data.status, data.issue_date, data.due_date, data.total_amount, data.currency, data.metadata || null]
  );
  return result.rows[0];
}

async function getBill(businessId, billId) {
  const result = await db.query(
    'SELECT * FROM bills WHERE business_id = $1 AND id = $2',
    [businessId, billId]
  );
  return result.rows[0] || null;
}

async function updateBill(businessId, billId, data) {
  const result = await db.query(
    `UPDATE bills SET vendor_id = $1, number = $2, status = $3, issue_date = $4, due_date = $5, total_amount = $6, currency = $7, metadata = $8, updated_at = now()
     WHERE business_id = $9 AND id = $10 RETURNING *`,
    [data.vendor_id, data.number, data.status, data.issue_date, data.due_date, data.total_amount, data.currency, data.metadata || null, businessId, billId]
  );
  return result.rows[0] || null;
}

async function deleteBill(businessId, billId) {
  const result = await db.query(
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
