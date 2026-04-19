// Vendor service logic (V2/Business)
const db = require('../db');

async function listVendors(businessId) {
  const result = await db.query(
    'SELECT * FROM vendors WHERE business_id = $1 ORDER BY created_at DESC',
    [businessId]
  );
  return result.rows;
}

async function createVendor(businessId, data) {
  const result = await db.query(
    `INSERT INTO vendors (business_id, name, email, phone, address)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [businessId, data.name, data.email || null, data.phone || null, data.address || null]
  );
  return result.rows[0];
}

async function getVendor(businessId, vendorId) {
  const result = await db.query(
    'SELECT * FROM vendors WHERE business_id = $1 AND id = $2',
    [businessId, vendorId]
  );
  return result.rows[0] || null;
}

async function updateVendor(businessId, vendorId, data) {
  const result = await db.query(
    `UPDATE vendors SET name = $1, email = $2, phone = $3, address = $4, updated_at = now()
     WHERE business_id = $5 AND id = $6 RETURNING *`,
    [data.name, data.email || null, data.phone || null, data.address || null, businessId, vendorId]
  );
  return result.rows[0] || null;
}

async function deleteVendor(businessId, vendorId) {
  const result = await db.query(
    'DELETE FROM vendors WHERE business_id = $1 AND id = $2 RETURNING id',
    [businessId, vendorId]
  );
  return result.rowCount > 0;
}

module.exports = {
  listVendors,
  createVendor,
  getVendor,
  updateVendor,
  deleteVendor
};
