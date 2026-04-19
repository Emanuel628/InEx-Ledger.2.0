const db = require('../db');

const ProjectService = {
  async listProjects(businessId) {
    return db.any('SELECT * FROM projects WHERE business_id = $1 ORDER BY created_at DESC', [businessId]);
  },

  async getProject(businessId, id) {
    return db.oneOrNone('SELECT * FROM projects WHERE business_id = $1 AND id = $2', [businessId, id]);
  },

  async createProject(businessId, data) {
    const { name, description, status, start_date, end_date, metadata } = data;
    return db.one(
      `INSERT INTO projects (business_id, name, description, status, start_date, end_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [businessId, name, description, status || 'active', start_date, end_date, metadata]
    );
  },

  async updateProject(businessId, id, data) {
    const { name, description, status, start_date, end_date, metadata } = data;
    return db.oneOrNone(
      `UPDATE projects SET name = $1, description = $2, status = $3, start_date = $4, end_date = $5, metadata = $6, updated_at = now()
       WHERE business_id = $7 AND id = $8 RETURNING *`,
      [name, description, status, start_date, end_date, metadata, businessId, id]
    );
  },

  async deleteProject(businessId, id) {
    return db.result('DELETE FROM projects WHERE business_id = $1 AND id = $2', [businessId, id], r => r.rowCount);
  }
};

module.exports = ProjectService;
