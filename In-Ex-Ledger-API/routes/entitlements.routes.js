const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware.js');
const { resolveBusinessIdForUser, listBusinessesForUser } = require('../api/utils/resolveBusinessIdForUser.js');
const { getSubscriptionSnapshotForBusiness } = require('../services/subscriptionService.js');
const { getUsageSummary } = require('../services/basicPlanUsageService.js');
const { PLAN_CODES, getPlanDefinition } = require('../config/planCatalog.js');
const { pool } = require('../db.js');
const { asyncRoute } = require('../utils/apiError.js');

const router = express.Router();
router.use(requireAuth);

// JSON has no Infinity -- Pro's "no cap" limits/remaining serialize as null,
// which the frontend treats as "unmetered" rather than reading a number.
function jsonSafeMetric(metric) {
  return {
    limit: Number.isFinite(metric.limit) ? metric.limit : null,
    used: metric.used,
    remaining: Number.isFinite(metric.remaining) ? metric.remaining : null
  };
}

function resolveResetsAt(now = new Date()) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return next.toISOString();
}

router.get('/plan-context', asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const subscription = await getSubscriptionSnapshotForBusiness(businessId);
  const definition = getPlanDefinition(subscription?.effectiveTier);
  const usage = await getUsageSummary(pool, businessId, { subscription });
  const resetsAt = resolveResetsAt();

  const businesses = await listBusinessesForUser(req.user.id).catch(() => []);
  const activeBusinessCount = businesses.length || 1;

  res.json({
    plan: {
      code: definition.code,
      name: definition.name,
      status: subscription?.effectiveStatus || subscription?.status || 'free',
      isPaid: Boolean(subscription?.isPaid),
      isTrialing: Boolean(subscription?.isTrialing),
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd)
    },
    features: definition.features,
    usage: {
      transactions: { ...jsonSafeMetric(usage.transactions), resetsAt },
      receipts: { ...jsonSafeMetric(usage.receipts), resetsAt }
    },
    businessCapacity: {
      included: 1,
      additional: Number(subscription?.additionalBusinesses || 0),
      maximum: Number(subscription?.maxBusinessesAllowed || 1),
      active: activeBusinessCount
    },
    upgrade: {
      available: definition.code === PLAN_CODES.PRO || definition.code === PLAN_CODES.BUSINESS ? false : true,
      targetPlan: PLAN_CODES.PRO,
      targetName: 'Pro'
    }
  });
}));

// Deprecated: kept temporarily for backward compatibility. Derives from the
// same canonical plan catalog as /plan-context so the two never contradict
// each other -- do not add fields here that aren't backed by the catalog.
router.get('/features', asyncRoute(async (req, res) => {
  const businessId = await resolveBusinessIdForUser(req.user);
  const subscription = await getSubscriptionSnapshotForBusiness(businessId);
  const definition = getPlanDefinition(subscription?.effectiveTier);
  const f = definition.features;

  res.json({
    effective_tier: subscription?.effectiveTier || null,
    recurring_templates_enabled: f.recurring_transactions,
    export_history_enabled: f.export_history,
    receipts_enabled: f.receipts,
    edge_case_tools_enabled: f.edge_case_tools,
    tax_estimates_enabled: f.tax_estimates,
    advanced_exports_enabled: f.advanced_exports
  });
}));

module.exports = router;
