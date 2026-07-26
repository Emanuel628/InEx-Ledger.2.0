import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Check, CreditCard, ExternalLink, Plus, ShieldAlert, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
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

type SubscriptionBusiness = { name: string; role: string; status: string }

function Subscription(props: PageProps) {
  const [interval, setBillingInterval] = useState<BillingInterval>(() => {
    const saved = window.sessionStorage.getItem('inex-preferred-billing-interval')
    return saved === 'yearly' ? 'yearly' : 'monthly'
  })
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [working, setWorking] = useState(false)

  const businesses: SubscriptionBusiness[] = props.authUser?.business?.name
    ? [{ name: props.authUser.business.name, role: 'Workspace owner', status: 'Active' }]
    : []

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
      const serverInterval = nextOverview.subscription?.billingInterval
      if (serverInterval === 'monthly' || serverInterval === 'yearly') {
        setBillingInterval(serverInterval)
      } else {
        window.sessionStorage.removeItem('inex-preferred-billing-interval')
      }
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
  const selectedPrice = pricing?.pricing?.[interval]
  const price = selectedPrice ? formatSubscriptionMoney(selectedPrice.base, pricing.currency) : interval === 'monthly' ? '$12/mo' : '$122.40/yr'
  const note = interval === 'monthly' ? 'Billed monthly. Cancel or change later in Stripe.' : 'Billed yearly with the annual discount.'
  const planName = subscription?.effectiveTierName || 'Basic'
  const statusLabel = getSubscriptionStatus(subscription)
  const isProActive = subscription?.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing)
  const canResume = Boolean(subscription?.cancelAtPeriodEnd || subscription?.isCanceledWithRemainingAccess)
  const shouldManageExistingSubscription = Boolean(isProActive && !canResume)
  const needsBillingPortal = ['past_due', 'unpaid'].includes(String(subscription?.effectiveStatus || subscription?.status || '').toLowerCase())

  const capacity = useMemo(() => {
    const max = Number(subscription?.maxBusinessesAllowed || 1)
    const active = Number(subscription?.activeBusinessCount || businesses.length || 0)
    const additional = Number(subscription?.additionalBusinesses || 0)
    return { max, active, additional }
  }, [businesses.length, subscription])

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
      await startCheckout(interval, capacity.additional)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to start checkout.')
      setWorking(false)
    }
  }

  async function handleResume() {
    setWorking(true)
    setDataError('')
    try {
      const updated = await resumeSubscription(interval)
      setOverview((current) => current ? { ...current, subscription: updated } : current)
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
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to cancel subscription.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <AppShell {...props} searchPlaceholder="Search plans, businesses, billing">
      <main className="transactions-page subscription-page-v3">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Subscription</p>
            <h1>Subscription</h1>
            <p>Choose the plan cadence before checkout, review business capacity, and keep destructive actions separate.</p>
          </div>
          <div className="billing-heading-actions">
            <button className="secondary-button" type="button" onClick={() => props.onNavigate('Billing')}>Billing history</button>
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
            <p>{buildPlanSummary(subscription)}</p>
          </div>
          <div className="subscription-renew-card">
            <div className="subscription-interval-toggle" role="group" aria-label="Billing interval">
              <button className={interval === 'monthly' ? 'is-selected' : ''} type="button" onClick={() => setBillingInterval('monthly')}>
                Monthly
                <strong>{formatIntervalPrice(pricing, 'monthly')}</strong>
              </button>
              <button className={interval === 'yearly' ? 'is-selected' : ''} type="button" onClick={() => setBillingInterval('yearly')}>
                Yearly
                <strong>{formatIntervalPrice(pricing, 'yearly')}</strong>
              </button>
            </div>
            <div className="subscription-price-line">
              <strong>{price}</strong>
              <span>{note}</span>
            </div>
            {canResume ? (
              <button className="primary-button" type="button" disabled={working} onClick={() => void handleResume()}>
                <CreditCard size={18} />
                {working ? 'Working' : 'Keep Pro active'}
              </button>
            ) : shouldManageExistingSubscription || needsBillingPortal ? (
              <button className="primary-button" type="button" disabled={working || loadingData || !overview?.portalAvailable} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening billing' : 'Open Stripe billing'}
              </button>
            ) : (
              <button className="primary-button" type="button" disabled={working || loadingData} onClick={() => void handleCheckout()}>
                <CreditCard size={18} />
                {working ? 'Opening checkout' : 'Continue to secure checkout'}
              </button>
            )}
          </div>
        </section>

        <section className="subscription-detail-grid">
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Building2 size={21} />
            </div>
            <span>Businesses allowed</span>
            <strong>{capacity.max}</strong>
            <p>{capacity.additional ? `${capacity.additional} additional business slot${capacity.additional === 1 ? '' : 's'} attached.` : 'One business is included with the current plan.'}</p>
          </article>
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <Check size={21} />
            </div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
            <p>{buildStatusDetail(subscription)}</p>
          </article>
          <article className="subscription-simple-card">
            <div className="billing-card-icon">
              <ExternalLink size={21} />
            </div>
            <span>Stripe portal</span>
            <strong>{overview?.portalAvailable ? 'Available' : 'Not connected'}</strong>
            <p>{overview?.portalAvailable ? 'Use Billing for payment methods and official invoices.' : 'The portal becomes available after Stripe checkout.'}</p>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-panel-header">
            <div>
              <h2>Workspace capacity</h2>
              <p>Businesses attached to this subscription.</p>
            </div>
            <button className="secondary-button" type="button">
              <Plus size={17} />
              Add business
            </button>
          </div>
          <div className="subscription-business-list">
            {businesses.length ? (
              businesses.map((business) => (
                <article className="subscription-business-row" key={business.name}>
                  <div className="merchant-logo merchant-blue">{business.name.charAt(0)}</div>
                  <div>
                    <strong>{business.name}</strong>
                    <p>{business.role}</p>
                  </div>
                  <span className="status-pill status-income">{business.status}</span>
                  <button className="secondary-button compact-button" type="button">Manage</button>
                </article>
              ))
            ) : (
              <div className="empty-table-state">
                <strong>No business attached yet</strong>
                <span>Create a business before starting checkout or adding workspace capacity.</span>
              </div>
            )}
          </div>
        </section>

        {isProActive ? (
          <section className="subscription-danger-panel">
            <div className="billing-card-icon danger-icon">
              <ShieldAlert size={20} />
            </div>
            <div>
              <strong>Cancel subscription</strong>
              <p>Cancellation keeps free-tier access available after paid access ends.</p>
            </div>
            <button className="secondary-button danger-button" type="button" disabled={working} onClick={() => void handleCancel()}>Cancel</button>
          </section>
        ) : null}
      </main>
    </AppShell>
  )
}

function formatIntervalPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

function getSubscriptionStatus(subscription?: BillingSubscription | null) {
  const status = subscription?.effectiveStatus || subscription?.status || 'free'
  if (subscription?.cancelAtPeriodEnd) return 'Canceling'
  if (subscription?.isTrialing) return 'Trial'
  if (status === 'active') return 'Active'
  if (status === 'free') return 'Free tier'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function buildPlanSummary(subscription?: BillingSubscription | null) {
  if (!subscription) return 'Start checkout when you are ready to unlock Pro workflows.'
  if (subscription.cancelAtPeriodEnd) {
    return `Pro access stays active until ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'the end of the paid period'}.`
  }
  if (subscription.effectiveTier === 'v1' && (subscription.isPaid || subscription.isTrialing)) {
    return 'Pro workflows are active for this workspace.'
  }
  return 'Free tier stays available. Start checkout when you are ready to unlock Pro workflows.'
}

function buildStatusDetail(subscription?: BillingSubscription | null) {
  if (!subscription) return 'No subscription details loaded yet.'
  if (subscription.cancelAtPeriodEnd) {
    return `Paid access ends ${formatSubscriptionDate(subscription.currentPeriodEnd) || 'at period end'}, then the account returns to Basic.`
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
