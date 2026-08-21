// Customer service logic (V2/Business)
const { pool } = require('../db');
const {
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  requireNonEmptyString,
  optionalEmail,
  optionalString,
  optionalJsonObject
} = require('./v2BusinessValidationService');

async function listCustomers(businessId) {
  const result = await pool.query(
    'SELECT * FROM customers WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

function validateCustomerInput(data) {
  const name = requireNonEmptyString(data?.name, 'name', MAX_NAME_LENGTH);
  const email = optionalEmail(data?.email);
  const phone = optionalString(data?.phone, 'phone', MAX_PHONE_LENGTH);
  const address = optionalJsonObject(data?.address, 'address');
  return { name, email, phone, address };
}

async function createCustomer(businessId, data) {
  const v = validateCustomerInput(data);
  const result = await pool.query(
    `INSERT INTO customers (business_id, name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [businessId, v.name, v.email, v.phone, v.address]
  );
  return result.rows[0];
}

async function getCustomer(businessId, customerId) {
  const result = await pool.query(
    'SELECT * FROM customers WHERE business_id = $1 AND id = $2',
    [businessId, customerId]
  );
  return result.rows[0] || null;
}

async function updateCustomer(businessId, customerId, data) {
  const v = validateCustomerInput(data);
  const result = await pool.query(
    `UPDATE customers SET name = $1, email = $2, phone = $3, address = $4, updated_at = now()
     WHERE business_id = $5 AND id = $6 RETURNING *`,
    [v.name, v.email, v.phone, v.address, businessId, customerId]
  );
  return result.rows[0] || null;
}

// NOTE: hard delete. The `customers` table (db/migrations/20260419_create_
// v2_business_tables.sql) has no `deleted_at`/audit columns, unlike
// `transactions` (see services/transactionAuditService.js, which soft-deletes
// via deleted_at/is_void/deleted_by_id/deleted_reason). Adding soft-delete
// parity here would require a new migration adding those columns to
// `customers` (and updating listCustomers/getCustomer to filter them out) --
// that schema change is out of scope for this pass and is left as a flagged
// follow-up rather than invented ad hoc against real financial data.
async function deleteCustomer(businessId, customerId) {
  const result = await pool.query(
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
