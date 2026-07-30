import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CreditCard, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { usePlan } from '../context/PlanContext'
import {
  cancelSubscription,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
  type BillingInterval,
  type BillingOverview,
  type BillingPricing,
} from '../lib/billingApi'
import { BASIC_LIMITS_NOTE, formatPlanPeriod, formatPlanPrice } from '../lib/planContent'

function Subscription(props: PageProps) {
  const { isPro, refreshPlanContext } = usePlan()
  const [interval, setBillingInterval] = useState<BillingInterval>(readPreferredBillingInterval)
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)
  const [confirmingCheckout, setConfirmingCheckout] = useState(false)

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

  // Stripe's webhook can land a beat after the success redirect, so a plain
  // "did it work?" reload right after checkout can still show Free/Trial and
  // spook the user into refreshing. Poll briefly instead of trusting the very
  // first read. This uses its own lightweight fetch (not refreshSubscription,
  // which toggles loadingData and would flicker the plan cards every pass).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutState = params.get('checkout')
    if (!checkoutState) return

    const cleanUrl = new URL(window.location.href)
    cleanUrl.searchParams.delete('checkout')
    window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`)

    if (checkoutState === 'cancel') {
      setDataError('Checkout was canceled. No changes were made to your plan.')
      return
    }
    if (checkoutState !== 'success') return

    let cancelled = false
    setConfirmingCheckout(true)
    ;(async () => {
      const maxAttempts = 6
      for (let attempt = 0; attempt < maxAttempts && !cancelled; attempt += 1) {
        try {
          const nextOverview = await loadBillingOverview()
          if (cancelled) return
          setOverview(nextOverview)
          await refreshPlanContext()
          if (nextOverview?.subscription?.isPaid || nextOverview?.subscription?.isTrialing) {
            break
          }
        } catch {
          // Keep polling -- a transient failure here shouldn't cut the wait short.
        }
        if (cancelled) return
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1500))
        }
      }
      if (!cancelled) setConfirmingCheckout(false)
    })()

    return () => {
      cancelled = true
    }
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
        </section>

        {confirmingCheckout ? (
          <section className="top-alert checkout-confirm-banner" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Confirming your payment...</strong>
              <span>This usually only takes a few seconds.</span>
            </div>
          </section>
        ) : null}

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
              <strong>$0</strong>
              <p>{BASIC_LIMITS_NOTE}</p>
            </div>
            {loadingData ? null : !isProActive ? (
              <span className="status-pill status-income">Current plan</span>
            ) : !canResume ? (
              <button className="secondary-button" type="button" disabled={working} onClick={() => void handleCancel()}>
                Keep Basic
              </button>
            ) : null}
          </article>

          <article className="pricing-card is-highlighted">
            <div>
              <h2>Pro</h2>
              <strong>{formatPlanPrice(pricing, interval)}<span>{formatPlanPeriod(interval)}</span></strong>
              <p>No monthly limits, plus automation and tax-ready exports.</p>
            </div>

            {!loadingData ? (
              <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
                <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" onClick={() => chooseBillingInterval('monthly')}>
                  Monthly
                  <strong>{formatPlanPrice(pricing, 'monthly')}</strong>
                </button>
                <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" onClick={() => chooseBillingInterval('yearly')}>
                  Yearly
                  <strong>{formatPlanPrice(pricing, 'yearly')}</strong>
                </button>
              </div>
            ) : null}

            {canResume && subscription?.billingInterval && interval !== subscription.billingInterval ? (
              <p className="subscription-interval-note">
                Switching to {interval === 'monthly' ? 'monthly' : 'yearly'} billing takes effect immediately with no prorated credit or charge.
              </p>
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

export default Subscription
