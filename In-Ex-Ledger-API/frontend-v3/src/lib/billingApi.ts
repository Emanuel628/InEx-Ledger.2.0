import { apiRequest } from './apiClient'

export type BillingInterval = 'monthly' | 'yearly'

export type BillingSubscription = {
  effectiveTier?: string | null
  effectiveTierName?: string | null
  effectiveStatus?: string | null
  status?: string | null
  isPaid?: boolean | null
  isTrialing?: boolean | null
  isTrialDowngradedToFree?: boolean | null
  cancelAtPeriodEnd?: boolean | null
  isCanceledWithRemainingAccess?: boolean | null
  maxBusinessesAllowed?: number | null
  additionalBusinesses?: number | null
  activeBusinessCount?: number | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  billingInterval?: BillingInterval | string | null
  currency?: string | null
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
}

export type BillingPrice = {
  base: number
  addon: number
  labelKey?: string
}

export type BillingPricing = {
  currency: string
  verified: boolean
  pricing: Record<BillingInterval, BillingPrice>
}

export type BillingPaymentMethod = {
  type?: string
  brand?: string
  bankName?: string
  last4?: string
  expMonth?: number | null
  expYear?: number | null
}

export type BillingInvoice = {
  id: string
  number?: string | null
  amount_paid?: number | null
  amount_due?: number | null
  currency?: string | null
  status?: string | null
  created?: number | null
  hosted_invoice_url?: string | null
  invoice_pdf?: string | null
}

export type BillingOverview = {
  subscription: BillingSubscription
  paymentMethod: BillingPaymentMethod | null
  invoices: BillingInvoice[]
  portalAvailable: boolean
}

export async function loadBillingOverview() {
  return apiRequest<BillingOverview>('/api/billing/overview')
}

export async function loadBillingPricing() {
  return apiRequest<BillingPricing>('/api/billing/pricing')
}

// Pro checkout is plan-only (one base price, monthly or yearly, no addon line
// items). Extra business slots are purchased separately, after Pro is
// active, via updateAdditionalBusinesses() or the Stripe billing portal.

export async function startCheckout(billingInterval: BillingInterval) {
  const checkoutAttemptId = crypto.randomUUID()

  const data = await apiRequest<{ url: string }>('/api/billing/checkout-session', {
    method: 'POST',
    body: JSON.stringify({
      billingInterval,
      checkoutAttemptId,
      returnPath: '/settings',
    }),
  })

  window.location.assign(data.url)
}

export async function openBillingPortal() {
  const data = await apiRequest<{ url: string }>('/api/billing/customer-portal', { method: 'POST' })
  window.location.assign(data.url)
}

// Each of these three mutations sends a fresh mutationAttemptId per call, the
// same pattern startCheckout() uses for checkoutAttemptId: it identifies one
// specific mutation *attempt*, not the desired end-state, so the backend's
// Stripe idempotency key stays unique across repeated legitimate operations
// (e.g. cancel -> resume -> cancel) while still deduping true retries of the
// same attempt (a network-level retry replays the same JSON body, including
// this same id).

export async function cancelSubscription() {
  const data = await apiRequest<{ subscription: BillingSubscription }>('/api/billing/cancel', {
    method: 'POST',
    body: JSON.stringify({ mutationAttemptId: crypto.randomUUID() }),
  })
  return data.subscription
}

export async function resumeSubscription(billingInterval?: BillingInterval) {
  const data = await apiRequest<{ subscription: BillingSubscription }>('/api/billing/resume', {
    method: 'POST',
    body: JSON.stringify({
      mutationAttemptId: crypto.randomUUID(),
      ...(billingInterval ? { billingInterval } : {}),
    }),
  })
  return data.subscription
}

export async function updateAdditionalBusinesses(additionalBusinesses: number) {
  const data = await apiRequest<{ subscription: BillingSubscription }>('/api/billing/additional-businesses', {
    method: 'PATCH',
    body: JSON.stringify({ additionalBusinesses, mutationAttemptId: crypto.randomUUID() }),
  })
  return data.subscription
}

// Sends the user to a Stripe-hosted confirmation page for the new business-slot
// total instead of silently updating the subscription in the background. Only
// valid once a real Stripe subscription exists (see updateAdditionalBusinesses
// for the pre-checkout trial case, which has nothing to confirm with Stripe yet).
export async function startAdditionalBusinessCheckout(additionalBusinesses: number) {
  const data = await apiRequest<{ url: string }>('/api/billing/additional-businesses/checkout', {
    method: 'POST',
    body: JSON.stringify({ additionalBusinesses }),
  })
  window.location.assign(data.url)
}

export function formatSubscriptionMoney(amount: number, currency = 'usd') {
  try {
    return new Intl.NumberFormat(currency.toLowerCase() === 'cad' ? 'en-CA' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount)
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`
  }
}

export function formatBillingInvoiceAmount(invoice: BillingInvoice) {
  const value = Number(invoice.amount_paid || invoice.amount_due || 0) / 100
  return formatSubscriptionMoney(value, invoice.currency || 'usd')
}

export function formatBillingDateFromUnix(value?: number | null) {
  if (!value) return ''
  return new Date(value * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatSubscriptionDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
