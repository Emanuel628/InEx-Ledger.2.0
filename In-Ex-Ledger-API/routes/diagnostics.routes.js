const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/auth.middleware.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  getSubscriptionSnapshotForBusiness,
  hasFeatureAccess
} = require("../services/subscriptionService.js");
const { logError } = require("../utils/logger.js");

// Safe environment label — never exposes internal config or raw NODE_ENV
function resolveEnvironmentLabel() {
  const env = (process.env.NODE_ENV || "development").toLowerCase();
  if (env === "production") return "Production";
  if (env === "staging") return "Staging";
  return "Development";
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const user = req.user;

    // Resolve business context safely — fall back to null if none
    let businessId = null;
    try {
      businessId = await resolveBusinessIdForUser(user, { seedDefaults: false });
    } catch {
      // No business yet — diagnostics still returns safe partial data
    }

    let plan = "free";
    let planStatus = "unknown";
    let businessContext = "none";
    let pdfAvailable = false;
    let secureExportAvailable = false;
    let emailVerificationRequired = !user.email_verified;

    if (businessId) {
      try {
        const subscription = await getSubscriptionSnapshotForBusiness(businessId);
        plan = subscription.effectiveTier || "free";
        planStatus = subscription.effectiveStatus || "unknown";
        businessContext = "active";

        // Both PDF and secure (tax-ID-included) export require email verification
        // and a paid plan with pdf_exports entitlement.
        const hasPdfFeature = hasFeatureAccess(subscription, "pdf_exports");
        const emailOk = !!user.email_verified;
        pdfAvailable = hasPdfFeature && emailOk;
        secureExportAvailable = hasPdfFeature && emailOk;
      } catch {
        businessContext = "unavailable";
      }
    }

    // Allowlisted response — no raw objects, secrets, IDs, or env vars
    res.json({
      environment: resolveEnvironmentLabel(),
      account: {
        email_verified: !!user.email_verified,
        mfa_enabled: !!user.mfa_enabled,
        plan,
        plan_status: planStatus,
        business_context: businessContext
      },
      export: {
        pdf_available: pdfAvailable,
        secure_export_available: secureExportAvailable,
        email_verification_required: emailVerificationRequired
      }
    });
  } catch (err) {
    logError("GET /api/diagnostics error:", err.message);
    res.status(500).json({ error: "Failed to load diagnostics." });
  }
});

module.exports = router;
