const db = require('../db');

const BillableExpenseService = {
  async listBillableExpenses(businessId) {
    return db.any('SELECT * FROM billable_expenses WHERE business_id = $1 ORDER BY expense_date DESC', [businessId]);
  },

  async getBillableExpense(businessId, id) {
    return db.oneOrNone('SELECT * FROM billable_expenses WHERE business_id = $1 AND id = $2', [businessId, id]);
  },

  async createBillableExpense(businessId, data) {
    const { project_id, description, amount, currency, status, expense_date, metadata } = data;
    return db.one(
      `INSERT INTO billable_expenses (business_id, project_id, description, amount, currency, status, expense_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [businessId, project_id, description, amount, currency, status || 'unbilled', expense_date, metadata]
    );
  },

  async updateBillableExpense(businessId, id, data) {
    const { project_id, description, amount, currency, status, expense_date, metadata } = data;
    return db.oneOrNone(
      `UPDATE billable_expenses SET project_id = $1, description = $2, amount = $3, currency = $4, status = $5, expense_date = $6, metadata = $7, updated_at = now()
       WHERE business_id = $8 AND id = $9 RETURNING *`,
      [project_id, description, amount, currency, status, expense_date, metadata, businessId, id]
    );
  },

  async deleteBillableExpense(businessId, id) {
    return db.result('DELETE FROM billable_expenses WHERE business_id = $1 AND id = $2', [businessId, id], r => r.rowCount);
  }
};

module.exports = BillableExpenseService;
