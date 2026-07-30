import { useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { usePlan } from '../context/PlanContext'
import {
  cancelSubscription,
  formatSubscriptionMoney,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
  type BillingInterval,
  type BillingOverview,
  type BillingPricing,
} from '../lib/billingApi'

function Subscription(props: PageProps) {
  const { isPro, refreshPlanContext } = usePlan()
  const [interval, setBillingInterval] = useState<BillingInterval>(readPreferredBillingInterval)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)

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
  }, [])

  const subscription = overview?.subscription
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
            <p>Pick the plan that fits this workspace.</p>
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

        <section className="pricing-grid">
          <article className="pricing-card">
            <div>
              <h2>Basic</h2>
              <strong>Free</strong>
              <p>50 transactions and 25 receipt uploads a month.</p>
            </div>
            {!loadingData && !isProActive ? <span className="status-pill status-income">Current plan</span> : null}
          </article>

          <article className="pricing-card is-highlighted">
            <div>
              <h2>Pro</h2>
              <strong>{formatIntervalPrice(pricing, interval)}<span>{interval === 'monthly' ? ' / month' : ' / year'}</span></strong>
              <p>No monthly limits, plus automation and tax-ready exports.</p>
            </div>

            {!loadingData && isProActive ? (
              <span className="status-pill status-income">Current plan</span>
            ) : !loadingData ? (
              <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
                <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" onClick={() => chooseBillingInterval('monthly')}>
                  Monthly
                  <strong>{formatIntervalPrice(pricing, 'monthly')}</strong>
                </button>
                <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" onClick={() => chooseBillingInterval('yearly')}>
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
            ) : !isProActive ? (
              <button className="primary-button" type="button" disabled={working || loadingData} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening checkout' : 'Upgrade to Pro'}
              </button>
            ) : null}

            {isProActive && !canResume ? (
              <button className="auth-link subscription-cancel-link" type="button" disabled={working} onClick={() => void handleCancel()}>
                Cancel subscription
              </button>
            ) : null}
          </article>
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

export default Subscription
