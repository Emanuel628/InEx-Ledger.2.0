const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware.js");
const {
  resolveBusinessIdForUser,
  listBusinessesForUser,
  setActiveBusinessForUser,
  createBusinessForUser
} = require("../api/utils/resolveBusinessIdForUser.js");

const router = express.Router();
router.use(requireAuth);

function normalizeBusinessPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  const region = String(payload.region || "US").trim().toUpperCase();
  const language = String(payload.language || "en").trim().toLowerCase();

  if (!name) {
    return { valid: false, error: "Business name is required." };
  }
  if (!["US", "CA"].includes(region)) {
    return { valid: false, error: "Region must be US or CA." };
  }
  if (!["en", "es", "fr"].includes(language)) {
    return { valid: false, error: "Language must be en, es, or fr." };
  }

  return { valid: true, normalized: { name, region, language } };
}

router.get("/", async (req, res) => {
  try {
    const activeBusinessId = await resolveBusinessIdForUser(req.user);
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === activeBusinessId) || null;

    res.json({
      active_business_id: activeBusinessId,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("GET /businesses error:", err.message);
    res.status(500).json({ error: "Failed to load businesses." });
  }
});

router.post("/", async (req, res) => {
  const validation = normalizeBusinessPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const businessId = await createBusinessForUser(req.user, validation.normalized);
    req.user.business_id = businessId;
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === businessId) || null;

    res.status(201).json({
      active_business_id: businessId,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("POST /businesses error:", err.message);
    res.status(500).json({ error: "Failed to create business." });
  }
});

router.post("/:id/activate", async (req, res) => {
  try {
    const updated = await setActiveBusinessForUser(req.user.id, req.params.id);
    if (!updated) {
      return res.status(404).json({ error: "Business not found." });
    }

    req.user.business_id = req.params.id;
    const businesses = await listBusinessesForUser(req.user.id);
    const activeBusiness = businesses.find((business) => business.id === req.params.id) || null;

    res.json({
      active_business_id: req.params.id,
      active_business: activeBusiness,
      businesses
    });
  } catch (err) {
    console.error("POST /businesses/:id/activate error:", err.message);
    res.status(500).json({ error: "Failed to switch business." });
  }
});

module.exports = router;
