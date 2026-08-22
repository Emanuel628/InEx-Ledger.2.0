const express = require('express');
const router = express.Router();
const ProjectService = require('../services/projectService');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { requireCsrfProtection } = require('../middleware/csrf.middleware.js');
const { createDataApiLimiter } = require('../middleware/rate-limit.middleware.js');
const { normalizeV2Metadata } = require('../api/utils/v2MetadataValidator');
const { isUuid } = require('../api/utils/v2HttpValidators');
const { ApiError, asyncRoute } = require('../utils/apiError.js');

// V2 feature and entitlement checks run once at the parent routes/index.js mount.
router.use(requireAuth);
router.use(createDataApiLimiter({ keyPrefix: 'rl:v2:projects' }));
router.use((req, res, next) => (
  ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
    ? requireCsrfProtection(req, res, next)
    : next()
));

function hasProjectPayload(body) {
  return typeof body?.name === 'string' && body.name.trim().length > 0;
}

function validateMetadata(body) {
  const normalized = normalizeV2Metadata(body?.metadata);
  if (!normalized.ok) {
    return normalized;
  }
  body.metadata = normalized.value;
  return normalized;
}

// List projects
router.get('/', asyncRoute(async (req, res) => {
  const projects = await ProjectService.listProjects(req.business.id);
  res.json({ projects });
}));

// Get project by id
router.get('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid project id.');
  }
  const project = await ProjectService.getProject(req.business.id, req.params.id);
  if (!project) throw new ApiError(404, 'Project not found');
  res.json({ project });
}));

// Create project
router.post('/', asyncRoute(async (req, res) => {
  if (!hasProjectPayload(req.body)) {
    throw new ApiError(400, 'Project name is required.');
  }
  const metadataCheck = validateMetadata(req.body);
  if (!metadataCheck.ok) {
    throw new ApiError(400, metadataCheck.error);
  }
  const project = await ProjectService.createProject(req.business.id, req.body);
  res.status(201).json({ project });
}));

// Update project
router.put('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid project id.');
  }
  if (!hasProjectPayload(req.body)) {
    throw new ApiError(400, 'Project name is required.');
  }
  const metadataCheck = validateMetadata(req.body);
  if (!metadataCheck.ok) {
    throw new ApiError(400, metadataCheck.error);
  }
  const project = await ProjectService.updateProject(req.business.id, req.params.id, req.body);
  if (!project) throw new ApiError(404, 'Project not found');
  res.json({ project });
}));

// Delete project
router.delete('/:id', asyncRoute(async (req, res) => {
  if (!isUuid(req.params.id)) {
    throw new ApiError(400, 'Invalid project id.');
  }
  const deleted = await ProjectService.deleteProject(req.business.id, req.params.id);
  if (!deleted) throw new ApiError(404, 'Project not found');
  res.json({ success: true });
}));

module.exports = router;
