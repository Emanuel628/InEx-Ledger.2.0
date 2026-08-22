"use strict";

const crypto = require("crypto");
const {
  getSubscriptionSnapshotForBusiness,
  updateStripeCustomerForBusiness,
  syncStripeSubscriptionForBusiness,
  setFreePlanForBusiness,
} = require("./subscriptionService.js");
const { stripeGet } = require("./stripeClient.js");
const { logInfo, logWarn } = require("../utils/logger.js");

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
  const v1Signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || v1Signatures.length === 0) {
    throw new Error("Missing Stripe signature");
  }

  const timestampSeconds = parseInt(timestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    Math.abs(nowSeconds - timestampSeconds) > STRIPE_WEBHOOK_TOLERANCE_SECONDS
  ) {
    throw new Error(
      "Stripe webhook timestamp is outside the acceptable tolerance window",
    );
  }

  const payload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const compare = Buffer.from(expected, "utf8");
  const isValid = v1Signatures.some((v1) => {
    const actual = Buffer.from(v1, "utf8");
    return (
      actual.length === compare.length &&
      crypto.timingSafeEqual(actual, compare)
    );
  });
  if (!isValid) {
    throw new Error("Invalid Stripe signature");
  }
}

async function resolveBusinessIdForStripeObject(
  object,
  findBusinessByStripeCustomerId,
) {
  return (
    object?.metadata?.business_id ||
    (object?.customer
      ? await findBusinessByStripeCustomerId(object.customer)
      : null)
  );
}

async function syncSubscriptionEvent(event, object, deps) {
  const businessId = await resolveBusinessIdForStripeObject(
    object,
    deps.findBusinessByStripeCustomerId,
  );
  if (!businessId) {
    return;
  }

  const previousSubscription = await getSubscriptionSnapshotForBusiness(
    businessId,
  ).catch(() => null);
  await syncStripeSubscriptionForBusiness(businessId, object);
  const updatedSubscription = await getSubscriptionSnapshotForBusiness(
    businessId,
  ).catch(() => null);

  if (updatedSubscription?.isTrialing && !previousSubscription?.isTrialing) {
    await deps.sendBillingEmail({
      businessId,
      kind: "trial_started",
      details: [
        { label: "Plan", value: "Pro trial" },
        { label: "Trial ends", value: deps.formatDateLabel(updatedSubscription?.trialEndsAt) },
        {
          label: "Additional businesses",
          value: String(Number(updatedSubscription?.additionalBusinesses) || 0),
        },
      ],
      actionUrl: deps.buildAppUrl("/subscription"),
    });
  }

  if (
    updatedSubscription?.cancelAtPeriodEnd &&
    !updatedSubscription?.isTrialing &&
    !previousSubscription?.cancelAtPeriodEnd
  ) {
    await deps.sendBillingEmail({
      businessId,
      kind: "canceling",
      details: [
        { label: "Plan", value: "Pro" },
        { label: "Access through", value: deps.formatDateLabel(updatedSubscription?.currentPeriodEnd) },
        {
          label: "Additional businesses",
          value: String(Number(updatedSubscription?.additionalBusinesses) || 0),
        },
      ],
      actionUrl: deps.buildAppUrl("/subscription"),
    });
  }

  logInfo("Stripe subscription synced", { eventType: event.type, businessId });
}

async function handleSubscriptionDeleted(object, deps) {
  const businessId = await resolveBusinessIdForStripeObject(
    object,
    deps.findBusinessByStripeCustomerId,
  );
  if (!businessId) {
    return;
  }

  const periodEndSeconds = object?.current_period_end;
  const periodEndMs = periodEndSeconds ? periodEndSeconds * 1000 : 0;
  if (periodEndMs > Date.now()) {
    await syncStripeSubscriptionForBusiness(businessId, object);
    logInfo(
      "Stripe subscription deleted mid-period - synced canceled state, access preserved until period end for business:",
      businessId,
    );
  } else {
    await setFreePlanForBusiness(businessId);
    logInfo("Stripe subscription deleted - set free plan for business:", businessId);
  }
}

async function handleCheckoutCompleted(object, deps) {
  const subscriptionId = object?.subscription;
  const businessId = await resolveBusinessIdForStripeObject(
    object,
    deps.findBusinessByStripeCustomerId,
  );
  if (!subscriptionId || !businessId) {
    return;
  }

  if (object?.customer) {
    await updateStripeCustomerForBusiness(businessId, object.customer);
  }
  const sub = await stripeGet(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  ).catch(() => null);
  if (!sub || sub.error) {
    return;
  }

  await syncStripeSubscriptionForBusiness(businessId, sub);
  await deps.sendBillingEmail({
    businessId,
    kind: "activated",
    details: [
      { label: "Plan", value: "Pro" },
      { label: "Billing", value: deps.formatBillingIntervalLabel(sub?.metadata?.billing_interval) },
      { label: "Additional businesses", value: String(Number(sub?.metadata?.additional_businesses) || 0) },
      {
        label: "Access through",
        value: deps.formatDateLabel(
          sub?.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        ),
      },
    ],
    actionUrl: deps.buildAppUrl("/subscription"),
  });
  logInfo("Stripe checkout.session.completed synced for business:", businessId);
}

async function syncInvoiceSubscription(subscriptionId, businessId) {
  if (!subscriptionId || !businessId) {
    return null;
  }
  const sub = await stripeGet(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  ).catch(() => null);
  if (!sub || sub.error) {
    return null;
  }
  await syncStripeSubscriptionForBusiness(businessId, sub);
  return sub;
}

async function handleInvoicePaymentSucceeded(object, deps) {
  const businessId = object?.customer
    ? await deps.findBusinessByStripeCustomerId(object.customer)
    : null;
  const sub = await syncInvoiceSubscription(object?.subscription, businessId);
  if (!sub) {
    return;
  }

  await deps.sendBillingEmail({
    businessId,
    kind: "charged",
    details: [
      { label: "Amount", value: deps.formatBillingCurrencyAmount(object?.amount_paid, object?.currency) },
      { label: "Plan", value: "Pro" },
      { label: "Billing", value: deps.formatBillingIntervalLabel(sub?.metadata?.billing_interval) },
      {
        label: "Paid on",
        value: deps.formatDateLabel(
          object?.status_transitions?.paid_at
            ? new Date(object.status_transitions.paid_at * 1000)
            : object?.created
              ? new Date(object.created * 1000)
              : null,
        ),
      },
    ],
    actionUrl: object?.hosted_invoice_url || deps.buildAppUrl("/subscription"),
    invoiceUrl: object?.hosted_invoice_url || object?.invoice_pdf || "",
  });
  logInfo("Stripe invoice.payment_succeeded synced for business:", businessId);
}

async function handleZeroDollarInvoicePaid(object, deps) {
  const amountPaid = Number(object?.amount_paid ?? object?.total ?? 0);
  if (amountPaid !== 0) {
    return;
  }
  const businessId = object?.customer
    ? await deps.findBusinessByStripeCustomerId(object.customer)
    : null;
  const sub = await syncInvoiceSubscription(object?.subscription, businessId);
  if (sub) {
    logInfo("Stripe invoice.paid ($0 invoice) synced for business:", businessId);
  }
}

async function handleInvoicePaymentFailed(object, deps) {
  const customerId = object?.customer;
  const businessId = customerId
    ? await deps.findBusinessByStripeCustomerId(customerId)
    : null;
  if (businessId) {
    await deps.sendBillingEmail({
      businessId,
      kind: "payment_failed",
      details: [
        { label: "Amount due", value: deps.formatBillingCurrencyAmount(object?.amount_due, object?.currency) },
        { label: "Invoice", value: String(object?.number || object?.id || "-") },
        {
          label: "Attempted on",
          value: deps.formatDateLabel(object?.created ? new Date(object.created * 1000) : null),
        },
      ],
      actionUrl: deps.buildAppUrl("/subscription"),
      invoiceUrl: object?.hosted_invoice_url || object?.invoice_pdf || "",
    });
  }
  logWarn(
    "Stripe invoice.payment_failed - business:",
    businessId || "unknown",
    "invoice:",
    object?.id,
  );
}

async function handleStripeWebhookEvent(event, deps) {
  const object = event?.data?.object || {};

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    await syncSubscriptionEvent(event, object, deps);
  } else if (event.type === "customer.subscription.deleted") {
    await handleSubscriptionDeleted(object, deps);
  } else if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(object, deps);
  } else if (event.type === "invoice.payment_succeeded") {
    await handleInvoicePaymentSucceeded(object, deps);
  } else if (event.type === "invoice.paid") {
    await handleZeroDollarInvoicePaid(object, deps);
  } else if (event.type === "invoice.payment_failed") {
    await handleInvoicePaymentFailed(object, deps);
  }
}

module.exports = {
  handleStripeWebhookEvent,
  verifyWebhookSignature,
};
