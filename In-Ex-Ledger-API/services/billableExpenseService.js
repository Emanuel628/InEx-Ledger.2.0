const { pool } = require('../db');

const BillableExpenseService = {
  async listBillableExpenses(businessId) {
    const result = await pool.query(
      'SELECT * FROM billable_expenses WHERE business_id = $1 ORDER BY expense_date DESC',
      [businessId]
    );
    return result.rows;
  },

  async getBillableExpense(businessId, id) {
    const result = await pool.query(
      'SELECT * FROM billable_expenses WHERE business_id = $1 AND id = $2',
      [businessId, id]
    );
    return result.rows[0] || null;
  },

  async createBillableExpense(businessId, data) {
    const { project_id, description, amount, currency, status, expense_date, metadata } = data;
    const result = await pool.query(
      `INSERT INTO billable_expenses (business_id, project_id, description, amount, currency, status, expense_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [businessId, project_id, description, amount, currency, status || 'unbilled', expense_date, metadata]
    );
    return result.rows[0];
  },

  async updateBillableExpense(businessId, id, data) {
    const { project_id, description, amount, currency, status, expense_date, metadata } = data;
    const result = await pool.query(
      `UPDATE billable_expenses SET project_id = $1, description = $2, amount = $3, currency = $4, status = $5, expense_date = $6, metadata = $7, updated_at = now()
       WHERE business_id = $8 AND id = $9 RETURNING *`,
      [project_id, description, amount, currency, status, expense_date, metadata, businessId, id]
    );
    return result.rows[0] || null;
  },

  async deleteBillableExpense(businessId, id) {
    const result = await pool.query(
      'DELETE FROM billable_expenses WHERE business_id = $1 AND id = $2',
      [businessId, id]
    );
    return result.rowCount > 0;
  }
};

module.exports = BillableExpenseService;
