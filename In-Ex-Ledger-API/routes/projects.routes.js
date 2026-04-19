const express = require('express');
const router = express.Router();
const ProjectService = require('../services/projectService');
const { requireV2BusinessEnabled, requireV2Entitlement } = require('./middleware/requireV2BusinessEnabled');

// All routes require V2 feature flag and entitlement
router.use(requireV2BusinessEnabled, requireV2Entitlement);

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
  try {
    const project = await ProjectService.getProject(req.business.id, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// Create project
router.post('/', async (req, res) => {
  try {
    const project = await ProjectService.createProject(req.business.id, req.body);
    res.status(201).json({ project });
  } catch (err) {
    res.status(400).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', async (req, res) => {
  try {
    const project = await ProjectService.updateProject(req.business.id, req.params.id, req.body);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (err) {
    res.status(400).json({ error: 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await ProjectService.deleteProject(req.business.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Project not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
