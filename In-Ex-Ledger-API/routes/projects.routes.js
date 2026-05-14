const express = require('express');
const router = express.Router();
const ProjectService = require('../services/projectService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('../api/utils/requireV2BusinessEnabled');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// All routes require V2 feature flag and entitlement
router.use(requireAuth, requireV2BusinessEnabled, requireV2Entitlement);

function isUuid(value) {
  return UUID_RE.test(String(value || ''));
}

function hasProjectPayload(body) {
  return typeof body?.name === 'string' && body.name.trim().length > 0;
}

// List projects
router.get('/', async (req, res) => {
  try {
    const projects = await ProjectService.listProjects(req.business.id);
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// Get project by id
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid project id.' });
  }
  try {
    const project = await ProjectService.getProject(req.business.id, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create project
router.post('/', requireCsrfProtection, async (req, res) => {
  if (!hasProjectPayload(req.body)) {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  try {
    const project = await ProjectService.createProject(req.business.id, req.body);
    res.status(201).json({ project });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', requireCsrfProtection, async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid project id.' });
  }
  if (!hasProjectPayload(req.body)) {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  try {
    const project = await ProjectService.updateProject(req.business.id, req.params.id, req.body);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', requireCsrfProtection, async (req, res) => {
  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid project id.' });
  }
  try {
    const deleted = await ProjectService.deleteProject(req.business.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
