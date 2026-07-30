// Single source of truth for Basic/Pro plan copy. Landing, Pricing, Upgrade,
// TrialSetup, and Subscription all render their plan bullets, pricing labels,
// and payment-method disclosure from here instead of each keeping their own
// (drifting) copy of the same list.
import { formatSubscriptionMoney, type BillingInterval, type BillingPricing } from './billingApi'

export const BASIC_PLAN_NAME = 'Basic'
export const PRO_PLAN_NAME = 'Pro'

export const BASIC_LIMITS_NOTE =
  '50 transactions and 25 receipt uploads a month. Your existing records stay available even after a monthly limit is reached.'

export const BASIC_FEATURES = [
  'Transactions, receipts, and CSV bank imports',
  'Accounts and categories',
  'Mileage or kilometre trip logging',
  'Invoice creation and sending',
  'Basic analytics and CSV export',
]

export const PRO_FEATURES = [
  'No monthly transaction or receipt-upload limits',
  'Recurring transactions',
  'Tax estimates',
  'A PDF summary and full CSV export for your accountant',
  'Multi-currency and tax-allocation tools',
  'Additional business workspaces (paid add-on)',
]

// The plan-limit removal on Pro is still subject to standard fair-use and
// technical limits -- that qualification belongs in Terms, not stacked onto
// the customer-facing bullet.
export const FAIR_USE_FOOTNOTE = 'Standard security and fair-use protections apply.'

export const PAYMENT_METHOD_DISCLOSURE = 'Start with Basic for free. Pro requires a payment method to begin.'
export const TRIAL_CARD_NOTE = 'Card required. No charge until the trial ends.'

export function formatPlanPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

export function formatPlanPeriod(interval: BillingInterval) {
  return interval === 'monthly' ? ' / month' : ' / year'
}
