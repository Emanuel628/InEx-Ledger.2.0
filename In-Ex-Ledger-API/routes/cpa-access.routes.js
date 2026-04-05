const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const { createDataApiLimiter } = require("../middleware/rate-limit.middleware.js");
const {
  listOwnedCpaGrants,
  listAssignedCpaGrants,
  listAccessibleBusinessScopeForUser,
  createCpaGrant,
  revokeOwnedCpaGrant,
  acceptAssignedCpaGrant
} = require("../services/cpaAccessService.js");

const router = express.Router();
router.use(requireAuth);
router.use(createDataApiLimiter({ max: 60 }));

router.get("/grants/owned", async (req, res) => {
  try {
    const grants = await listOwnedCpaGrants(req.user.id);
    res.json({ grants });
  } catch (error) {
    console.error("GET /api/cpa-access/grants/owned error:", error.message);
    res.status(500).json({ error: "Failed to load CPA access grants." });
  }
});

router.get("/grants/assigned", async (req, res) => {
  try {
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    console.error("GET /api/cpa-access/grants/assigned error:", error.message);
    res.status(500).json({ error: "Failed to load assigned CPA access." });
  }
});

router.get("/portfolio", async (req, res) => {
  try {
    const portfolios = await listAccessibleBusinessScopeForUser(req.user);
    res.json({ portfolios });
  } catch (error) {
    console.error("GET /api/cpa-access/portfolio error:", error.message);
    res.status(500).json({ error: "Failed to load CPA portfolio access." });
  }
});

router.post("/grants", async (req, res) => {
  try {
    const grantId = await createCpaGrant(req.user, req.body);
    const grants = await listOwnedCpaGrants(req.user.id);
    res.status(201).json({ id: grantId, grants });
  } catch (error) {
    const message = error?.message || "Failed to create CPA access grant.";
    const status = /required|cannot invite|not found|already exists/i.test(message) ? 400 : 500;
    console.error("POST /api/cpa-access/grants error:", message);
    res.status(status).json({ error: message });
  }
});

router.post("/grants/:id/accept", async (req, res) => {
  try {
    const accepted = await acceptAssignedCpaGrant(req.user, req.params.id);
    if (!accepted) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    const grants = await listAssignedCpaGrants(req.user);
    res.json({ grants });
  } catch (error) {
    console.error("POST /api/cpa-access/grants/:id/accept error:", error.message);
    res.status(500).json({ error: "Failed to accept CPA access." });
  }
});

router.delete("/grants/:id", async (req, res) => {
  try {
    const revoked = await revokeOwnedCpaGrant(req.user.id, req.params.id);
    if (!revoked) {
      return res.status(404).json({ error: "CPA access grant not found." });
    }
    res.status(204).end();
  } catch (error) {
    console.error("DELETE /api/cpa-access/grants/:id error:", error.message);
    res.status(500).json({ error: "Failed to revoke CPA access." });
  }
});

module.exports = router;
