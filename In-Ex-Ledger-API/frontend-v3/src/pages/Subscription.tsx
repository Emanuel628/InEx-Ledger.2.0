import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Check, CreditCard, Sparkles, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import UsageMeter from '../components/UsageMeter'
import { usePlan } from '../context/PlanContext'
import {
  cancelSubscription,
  formatSubscriptionDate,
  formatSubscriptionMoney,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
  type BillingInterval,
  type BillingOverview,
  type BillingPricing,
  type BillingSubscription,
} from '../lib/billingApi'
import { loadBusinesses } from '../lib/businessesApi'

function Subscription(props: PageProps) {
  const { plan: planContext, isPro, refreshPlanContext } = usePlan()
  const [interval, setBillingInterval] = useState<BillingInterval>(readPreferredBillingInterval)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)
  const [workspaceCount, setWorkspaceCount] = useState(1)

  async function refreshSubscription() {
    setLoadingData(true)
    setDataError('')
    try {
      const [nextOverview, nextPricing] = await Promise.all([
        loadBillingOverview(),
        loadBillingPricing(),
      ])
      setOverview(nextOverview)
      setPricing(nextPricing)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load subscription.')
      setOverview(null)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshSubscription()
    loadBusinesses()
      .then((response) => setWorkspaceCount(response.businesses?.length || 1))
      .catch(() => setWorkspaceCount(1))
  }, [])

  const subscription = overview?.subscription
  const planName = subscription?.effectiveTierName || 'Basic'
  const statusLabel = getSubscriptionStatus(subscription)
  const renewalLabel = buildRenewalLabel(subscription)
  // Whether Pro is active is read from the shared plan/entitlement model
  // (usePlan) rather than comparing subscription.effectiveTier === 'v1'
  // directly, so this page can never drift from what the backend actually
  // enforces.
  const isProActive = Boolean(isPro && (subscription?.isPaid || subscription?.isTrialing))
  const canResume = Boolean(subscription?.cancelAtPeriodEnd || subscription?.isCanceledWithRemainingAccess || subscription?.isTrialDowngradedToFree)
  // Only route to "Open Stripe billing" when a real Stripe subscription (paid,
  // or already checked out and still within its Stripe trial window) exists.
  // A trialing user with no Stripe subscription yet counts as Pro-tier access
  // (isProActive) but has no Stripe customer, so routing them here too made
  // the primary CTA an always-disabled portal button (portalAvailable
  // requires a Stripe customer) instead of Checkout -- meaning every new
  // trial user could never actually start Stripe checkout.
  const shouldManageExistingSubscription = Boolean((subscription?.isPaid || subscription?.stripeSubscriptionId) && !canResume)
  const needsBillingPortal = ['past_due', 'unpaid'].includes(String(subscription?.effectiveStatus || subscription?.status || '').toLowerCase())
  const maxWorkspaces = Number(subscription?.maxBusinessesAllowed || 1)

  async function handleCheckout() {
    setWorking(true)
    setDataError('')
    try {
      if (canResume) {
        await handleResume()
        return
      }
      if (shouldManageExistingSubscription || needsBillingPortal) {
        await openBillingPortal()
        return
      }
      await startCheckout(interval)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start checkout.'
      if (/existing subscription|already have an active subscription|conflict/i.test(message)) {
        try {
          await openBillingPortal()
          return
        } catch (portalError) {
          setDataError(portalError instanceof Error ? portalError.message : message)
        }
      } else {
        setDataError(message)
      }
      setWorking(false)
    }
  }

  function chooseBillingInterval(nextInterval: BillingInterval) {
    setBillingInterval(nextInterval)
    window.sessionStorage.setItem('inex-preferred-billing-interval', nextInterval)
  }

  async function handleResume() {
    setWorking(true)
    setDataError('')
    try {
      const updated = await resumeSubscription(interval)
      setOverview((current) => current ? { ...current, subscription: updated } : current)
      await refreshPlanContext()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to keep Pro active.')
    } finally {
      setWorking(false)
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this subscription? Pro stays active until the paid period ends when Stripe allows it.')) {
      return
    }
    setWorking(true)
    setDataError('')
    try {
      const updated = await cancelSubscription()
      setOverview((current) => current ? { ...current, subscription: updated } : current)
      await refreshPlanContext()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to cancel subscription.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <AppShell {...props}>
      <main className="transactions-page subscription-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Manage plan</p>
            <h1>Manage plan</h1>
            <p>Review your plan, usage, and billing.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Billing')}>Billing history</button>
            <button className="secondary-button" type="button" disabled={working || !overview?.portalAvailable} onClick={() => void openBillingPortal().catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to open Stripe billing.'))}>Manage billing</button>
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Settings')}>Back to settings</button>
          </div>
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Review the current plan state and try again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss subscription warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="subscription-plan-panel">
          <div className="subscription-plan-copy">
            <span className={`status-pill ${isProActive ? 'status-income' : 'status-draft'}`}>Current plan</span>
            <h2>{loadingData ? 'Loading plan' : `${planName} access`}</h2>
            <p>{buildPlanSummary(subscription, isProActive)}</p>
            {isProActive && !canResume ? (
              <button className="auth-link subscription-cancel-link" type="button" disabled={working} onClick={() => void handleCancel()}>
                Cancel subscription
              </button>
            ) : null}
          </div>
          <div className="subscription-renew-card">
            {!isProActive ? (
              <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
                <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" data-billing-interval="monthly" onClick={() => chooseBillingInterval('monthly')}>
                  Monthly
                  <strong>{formatIntervalPrice(pricing, 'monthly')}</strong>
                </button>
                <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" data-billing-interval="yearly" onClick={() => chooseBillingInterval('yearly')}>
                  Yearly
                  <strong>{formatIntervalPrice(pricing, 'yearly')}</strong>
                </button>
              </div>
            ) : null}
            {canResume ? (
              <button className="primary-button" type="button" disabled={working} onClick={() => void handleResume()}>
                <CreditCard size={18} />
                {working ? 'Working' : 'Keep Pro active'}
              </button>
            ) : shouldManageExistingSubscription || needsBillingPortal ? (
              <button className="primary-button" type="button" disabled={working || loadingData || !overview?.portalAvailable} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening billing' : 'Manage billing'}
              </button>
            ) : (
              <button className="primary-button" type="button" disabled={working || loadingData} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening checkout' : 'Upgrade to Pro'}
              </button>
            )}
          </div>
        </section>

        <section className="subscription-detail-grid">
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Check size={21} />
            </div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
            <p>{buildStatusDetail(subscription)}</p>
          </article>
          <article className="subscription-simple-card subscription-renewal-card">
            <div className="billing-card-icon">
              <CalendarClock size={21} />
            </div>
            <span>{renewalLabel.caption}</span>
            <strong>{renewalLabel.value}</strong>
            <p>{planName} plan</p>
          </article>
        </section>

        {!isProActive ? (
          <section className="table-panel">
            <div className="table-panel-header">
              <div>
                <h2>Basic usage this month</h2>
                <p>Your existing records always remain available, even after a monthly limit is reached.</p>
              </div>
            </div>
            <div className="transaction-detail-body">
              <UsageMeter label="Transactions" metric={planContext?.usage.transactions} />
              <UsageMeter label="Receipt uploads" metric={planContext?.usage.receipts} />
            </div>
          </section>
        ) : null}

        {!isProActive ? (
          <section className="table-panel">
            <div className="table-panel-header">
              <div>
                <h2>What Pro adds</h2>
                <p>Everything in Basic, plus:</p>
              </div>
              <button className="primary-button" type="button" onClick={() => props.onNavigate('Upgrade')}>
                <Sparkles size={16} />Upgrade to Pro
              </button>
            </div>
            <div className="transaction-detail-body">
              <ul className="subscription-pro-benefits">
                <li>No monthly transaction or receipt-upload limits -- subject to reasonable technical and abuse-prevention limits</li>
                <li>Recurring transactions -- create, edit, and run them automatically</li>
                <li>Tax estimates on your analytics</li>
                <li>PDF accountant packets and full CPA/workpaper CSV exports</li>
                <li>Advanced export and edge-case tools</li>
                <li>Additional business workspaces (paid add-on)</li>
              </ul>
            </div>
          </section>
        ) : null}

        <section className="subscription-workspace-summary">
          <div>
            <strong>{workspaceCount} of {maxWorkspaces} included workspaces used</strong>
            <p>Switch, add, or remove business workspaces.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => props.onNavigate('BusinessWorkspaces')}>Manage workspaces</button>
        </section>
      </main>
    </AppShell>
  )
}

function readPreferredBillingInterval(): BillingInterval {
  if (typeof window === 'undefined') return 'monthly'
  const saved = window.sessionStorage.getItem('inex-preferred-billing-interval')
  return saved === 'yearly' ? 'yearly' : 'monthly'
}

function formatIntervalPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

function getSubscriptionStatus(subscription?: BillingSubscription | null) {
  const status = subscription?.effectiveStatus || subscription?.status || 'free'
  if (subscription?.cancelAtPeriodEnd || subscription?.isTrialDowngradedToFree) return 'Canceling'
  if (subscription?.isTrialing) return 'Trial'
  if (status === 'active') return 'Active'
  if (status === 'free') return 'Basic'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function buildPlanSummary(subscription: BillingSubscription | null | undefined, isProActive: boolean) {
  if (!subscription) return 'Basic includes 50 transactions and 25 receipt uploads a month. Upgrade to Pro to remove those limits and unlock recurring transactions, tax estimates, and full exports.'
  if (subscription.cancelAtPeriodEnd) {
    return `Pro access stays active until ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'the end of the paid period'}.`
  }
  if (subscription.isTrialDowngradedToFree) {
    return `Canceling confirmed. Pro access stays active until ${formatSubscriptionDate(subscription.trialEndsAt) || 'the trial ends'}, then the account moves to Basic.`
  }
  if (isProActive) {
    return 'Basic monthly limits are removed on Pro, subject to reasonable technical and abuse-prevention limits. Recurring transactions, tax estimates, and full exports are all active for this workspace.'
  }
  return 'Basic includes 50 transactions and 25 receipt uploads a month. Upgrade to Pro to remove those limits and unlock recurring transactions, tax estimates, and full exports.'
}

function buildRenewalLabel(subscription?: BillingSubscription | null) {
  if (!subscription) return { caption: 'Next renewal', value: 'Not started' }
  if (subscription.cancelAtPeriodEnd) {
    return { caption: 'Access ends', value: formatSubscriptionDate(subscription.currentPeriodEnd) || 'Unknown' }
  }
  if (subscription.isTrialDowngradedToFree || subscription.isTrialing) {
    return { caption: 'Trial ends', value: formatSubscriptionDate(subscription.trialEndsAt) || 'Unknown' }
  }
  if (subscription.isPaid) {
    return { caption: 'Renews', value: formatSubscriptionDate(subscription.currentPeriodEnd) || 'Unknown' }
  }
  return { caption: 'Next renewal', value: 'Not started' }
}

function buildStatusDetail(subscription?: BillingSubscription | null) {
  if (!subscription) return 'No subscription details loaded yet.'
  if (subscription.cancelAtPeriodEnd) {
    return `Your Pro access ends on ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'the current period end'}. After that, your account moves to Basic. Your existing records remain available.`
  }
  if (subscription.isTrialDowngradedToFree) {
    return `Your Pro access ends on ${formatSubscriptionDate(subscription.trialEndsAt) || 'the trial end date'}. After that, your account moves to Basic. Your existing records remain available.`
  }
  if (subscription.isTrialing) {
    return `Trial access ends ${formatSubscriptionDate(subscription.trialEndsAt) || 'at the trial end date'}.`
  }
  if (subscription.isPaid) {
    return `Renews ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'on the next billing date'}.`
  }
  return 'No paid renewal is currently attached to this workspace.'
}

export default Subscription
