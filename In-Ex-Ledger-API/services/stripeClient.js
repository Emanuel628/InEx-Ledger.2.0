'use strict';

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = process.env.STRIPE_API_VERSION || "2026-02-25.clover";

function getStripeSecretKey() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return process.env.STRIPE_SECRET_KEY;
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

async function stripeRequest(path, payload, options = {}) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": STRIPE_API_VERSION,
      ...(options.idempotencyKey ? { "Idempotency-Key": String(options.idempotencyKey) } : {})
    },
    body: encodeFormBody(payload)
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

async function stripeGet(path) {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getStripeSecretKey()}`,
      "Stripe-Version": STRIPE_API_VERSION
    }
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error?.message || `Stripe request failed (${response.status})`);
  }

  return json;
}

module.exports = { getStripeSecretKey, encodeFormBody, stripeRequest, stripeGet, STRIPE_API_BASE, STRIPE_API_VERSION };
