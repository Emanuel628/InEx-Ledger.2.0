const { pool } = require('../db');

const ProjectService = {
  async listProjects(businessId) {
    const result = await pool.query(
      'SELECT * FROM projects WHERE business_id = $1 ORDER BY created_at DESC',
      [businessId]
    );
    return result.rows;
  },

  async getProject(businessId, id) {
    const result = await pool.query(
      'SELECT * FROM projects WHERE business_id = $1 AND id = $2',
      [businessId, id]
    );
    return result.rows[0] || null;
  },

  async createProject(businessId, data) {
    const { name, description, status, start_date, end_date, metadata } = data;
    const result = await pool.query(
      `INSERT INTO projects (business_id, name, description, status, start_date, end_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [businessId, name, description, status || 'active', start_date, end_date, metadata]
    );
    return result.rows[0];
  },

  async updateProject(businessId, id, data) {
    const { name, description, status, start_date, end_date, metadata } = data;
    const result = await pool.query(
      `UPDATE projects SET name = $1, description = $2, status = $3, start_date = $4, end_date = $5, metadata = $6, updated_at = now()
       WHERE business_id = $7 AND id = $8 RETURNING *`,
      [name, description, status, start_date, end_date, metadata, businessId, id]
    );
    return result.rows[0] || null;
  },

  async deleteProject(businessId, id) {
    const result = await pool.query(
      'DELETE FROM projects WHERE business_id = $1 AND id = $2',
      [businessId, id]
    );
    return result.rowCount > 0;
  }
};

module.exports = ProjectService;
