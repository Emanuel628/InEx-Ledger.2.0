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
    'SELECT * FROM customers WHERE business_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
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
    'SELECT * FROM customers WHERE business_id = $1 AND id = $2 AND deleted_at IS NULL',
    [businessId, customerId]
  );
  return result.rows[0] || null;
}

async function updateCustomer(businessId, customerId, data) {
  const v = validateCustomerInput(data);
  const result = await pool.query(
    `UPDATE customers SET name = $1, email = $2, phone = $3, address = $4, updated_at = now()
     WHERE business_id = $5 AND id = $6 AND deleted_at IS NULL RETURNING *`,
    [v.name, v.email, v.phone, v.address, businessId, customerId]
  );
  return result.rows[0] || null;
}

async function deleteCustomer(businessId, customerId, { userId = null, reason = 'user_deleted' } = {}) {
  const result = await pool.query(
    `UPDATE customers
        SET deleted_at = now(),
            deleted_by_id = $3,
            deleted_reason = $4,
            updated_at = now()
      WHERE business_id = $1
        AND id = $2
        AND deleted_at IS NULL
      RETURNING id`,
    [businessId, customerId, userId, reason]
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
