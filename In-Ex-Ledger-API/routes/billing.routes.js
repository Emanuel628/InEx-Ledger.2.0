const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth, requireMfa } = require("../middleware/auth.middleware.js");
const { createBillingMutationLimiter } = require("../middleware/rateLimitTiers.js");
const { resolveBusinessIdForUser } = require("../api/utils/resolveBusinessIdForUser.js");
const {
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setFreePlanForBusiness
} = require("../services/subscriptionService.js");
const { pool } = require("../db.js");
const { logError, logWarn, logInfo } = require("../utils/logger.js");

const router = express.Router();

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2024-06-20";

const billingMutationLimiter = createBillingMutationLimiter();

const billingReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." }
});

function getStripeSecretKey() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return process.env.STRIPE_SECRET_KEY;
}

function getStripePriceId() {
  const priceId = process.env.STRIPE_PRICE_V1_MONTHLY;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_V1_MONTHLY is not configured");
  }
  return priceId;
}

function encodeFormBody(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

async function stripeRequest(path, payload) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION
    },
    body: encodeFormBody(payload)
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

async function findBusinessByStripeCustomerId(stripeCustomerId) {
  const result = await pool.query(
    `SELECT business_id
       FROM business_subscriptions
      WHERE stripe_customer_id = $1
      LIMIT 1`,
    [stripeCustomerId]
  );
  return result.rows[0]?.business_id || null;
}

async function ensureStripeCustomer(businessId, user) {
  const existing = await pool.query(
    `SELECT stripe_customer_id
       FROM business_subscriptions
      WHERE business_id = $1
      LIMIT 1`,
    [businessId]
  );

  const stripeCustomerId = existing.rows[0]?.stripe_customer_id;
  if (stripeCustomerId) {
    return stripeCustomerId;
  }

  const customer = await stripeRequest("/customers", {
    email: user.email,
    name: user.display_name || user.full_name || user.email,
    "metadata[business_id]": businessId,
    "metadata[user_id]": user.id
  });

  await updateStripeCustomerForBusiness(businessId, customer.id);
  return customer.id;
}

function buildAppUrl(req, path) {
  const base = process.env.APP_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    res.json({ subscription });
  } catch (err) {
    logError("GET /api/billing/subscription error:", err.message);
    res.status(500).json({ error: "Failed to load subscription." });
  }
});

router.post("/checkout-session", billingMutationLimiter, requireAuth, requireMfa, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);
    if (subscription.isPaid && !subscription.cancelAtPeriodEnd) {
      return res.status(409).json({ error: "Business is already on an active paid plan." });
    }

    const customerId = await ensureStripeCustomer(businessId, req.user);
    const session = await stripeRequest("/checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": getStripePriceId(),
      "line_items[0][quantity]": 1,
      success_url: buildAppUrl(req, "/subscription?checkout=success"),
      cancel_url: buildAppUrl(req, "/subscription?checkout=cancel"),
      "metadata[business_id]": businessId,
      "metadata[user_id]": req.user.id
    });

    res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    logError("POST /api/billing/checkout-session error:", err.message);
    res.status(500).json({ error: err.message || "Failed to start checkout." });
  }
});

router.post("/customer-portal", requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const customerId = await ensureStripeCustomer(businessId, req.user);
    const session = await stripeRequest("/billing_portal/sessions", {
      customer: customerId,
      return_url: buildAppUrl(req, "/subscription")
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    logError("POST /api/billing/customer-portal error:", err.message);
    res.status(500).json({ error: err.message || "Failed to open billing portal." });
  }
});

router.post("/cancel", requireAuth, billingMutationLimiter, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subscription = await getSubscriptionSnapshotForBusiness(businessId);

    if (!subscription.stripeSubscriptionId) {
      // No Stripe subscription — just downgrade to free immediately
      await setFreePlanForBusiness(businessId);
      const updated = await getSubscriptionSnapshotForBusiness(businessId);
      return res.status(200).json({ subscription: updated });
    }

    // Cancel at period end via Stripe
    await stripeRequest(`/subscriptions/${subscription.stripeSubscriptionId}`, {
      cancel_at_period_end: true
    });

    // Sync the updated state from Stripe
    const stripeSubResponse = await fetch(
      `${STRIPE_API_BASE}/subscriptions/${subscription.stripeSubscriptionId}`,
      {
        headers: {
          Authorization: `Bearer ${getStripeSecretKey()}`,
          "Stripe-Version": STRIPE_API_VERSION
        }
      }
    );
    const stripeSub = await stripeSubResponse.json().catch(() => null);
    if (stripeSub && !stripeSub.error) {
      await syncStripeSubscriptionForBusiness(businessId, stripeSub);
    }

    const updated = await getSubscriptionSnapshotForBusiness(businessId);
    res.status(200).json({ subscription: updated });
  } catch (err) {
    logError("POST /api/billing/cancel error:", err.message);
    res.status(500).json({ error: err.message || "Failed to cancel subscription." });
  }
});

router.get("/history", billingReadLimiter, requireAuth, async (req, res) => {
  try {
    const businessId = await resolveBusinessIdForUser(req.user);
    const subRow = await pool.query(
      "SELECT stripe_customer_id FROM business_subscriptions WHERE business_id = $1 LIMIT 1",
      [businessId]
    );

    const stripeCustomerId = subRow.rows[0]?.stripe_customer_id;
    if (!stripeCustomerId) {
      return res.status(200).json({ invoices: [] });
    }

    const response = await fetch(
      `${STRIPE_API_BASE}/invoices?customer=${stripeCustomerId}&limit=24&status=paid`,
      {
        headers: {
          Authorization: `Bearer ${getStripeSecretKey()}`,
          "Stripe-Version": STRIPE_API_VERSION
        }
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || "Failed to fetch billing history");
    }

    const invoices = (payload?.data || []).map((inv) => ({
      id: inv.id,
      number: inv.number,
      amount_paid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      period_start: inv.period_start,
      period_end: inv.period_end,
      created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf: inv.invoice_pdf
    }));

    res.status(200).json({ invoices });
  } catch (err) {
    logError("GET /api/billing/history error:", err.message);
    res.status(500).json({ error: err.message || "Failed to load billing history." });
  }
});

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300; // 5-minute replay window

function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const parts = String(signatureHeader || "")
    .split(",")
    .map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const v1 = parts.find((part) => part.startsWith("v1="))?.slice(3);

  if (!timestamp || !v1) {
    throw new Error("Missing Stripe signature");
  }

  const timestampSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error("Stripe webhook timestamp is outside the acceptable tolerance window");
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const actual = Buffer.from(v1, "utf8");
  const compare = Buffer.from(expected, "utf8");
  if (actual.length !== compare.length || !crypto.timingSafeEqual(actual, compare)) {
    throw new Error("Invalid Stripe signature");
  }
}

router.post("/webhook", async (req, res) => {
  try {
    verifyWebhookSignature(req.body, req.headers["stripe-signature"]);
    const event = JSON.parse(req.body.toString("utf8"));
    const object = event?.data?.object || {};

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const businessId =
        object?.metadata?.business_id ||
        (await findBusinessByStripeCustomerId(object.customer));
      if (businessId) {
        await syncStripeSubscriptionForBusiness(businessId, object);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const businessId =
        object?.metadata?.business_id ||
        (await findBusinessByStripeCustomerId(object.customer));
      if (businessId) {
        await setFreePlanForBusiness(businessId);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logError("Stripe webhook error:", err.message);
    res.status(400).json({ error: err.message || "Invalid webhook" });
  }
});

module.exports = router;
