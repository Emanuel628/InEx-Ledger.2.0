// Customer service logic (V2/Business)
const db = require('../db');

async function listCustomers(businessId) {
  const result = await db.query(
    'SELECT * FROM customers WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

async function createCustomer(businessId, data) {
  const result = await db.query(
    `INSERT INTO customers (business_id, name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [businessId, data.name, data.email || null, data.phone || null, data.address || null]
  );
  return result.rows[0];
}

async function getCustomer(businessId, customerId) {
  const result = await db.query(
    'SELECT * FROM customers WHERE business_id = $1 AND id = $2',
    [businessId, customerId]
  );
  return result.rows[0] || null;
}

async function updateCustomer(businessId, customerId, data) {
  const result = await db.query(
    `UPDATE customers SET name = $1, email = $2, phone = $3, address = $4, updated_at = now()
     WHERE business_id = $5 AND id = $6 RETURNING *`,
    [data.name, data.email || null, data.phone || null, data.address || null, businessId, customerId]
  );
  return result.rows[0] || null;
}

async function deleteCustomer(businessId, customerId) {
  const result = await db.query(
    'DELETE FROM customers WHERE business_id = $1 AND id = $2 RETURNING id',
    [businessId, customerId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listCustomers,
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer
};
