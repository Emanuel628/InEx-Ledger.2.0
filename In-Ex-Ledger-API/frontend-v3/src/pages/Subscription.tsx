import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, CreditCard, Download, ExternalLink, X } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { usePlan } from '../context/PlanContext'
import {
  cancelSubscription,
  formatBillingDateFromUnix,
  formatBillingInvoiceAmount,
  formatSubscriptionDate,
  loadBillingOverview,
  loadBillingPricing,
  openBillingPortal,
  resumeSubscription,
  startCheckout,
  type BillingInterval,
  type BillingInvoice,
  type BillingOverview,
  type BillingPaymentMethod,
  type BillingPricing,
} from '../lib/billingApi'
import { downloadCsv } from '../lib/browserDownload'
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
  const [showCancelModal, setShowCancelModal] = useState(false)

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
  // An active, non-canceled Pro subscriber picking a different interval than
  // the one they're actually on switches directly (see handleSwitchInterval)
  // instead of going through Checkout or the generic Stripe portal.
  const canSwitchIntervalDirectly = Boolean(
    isProActive && shouldManageExistingSubscription && subscription?.billingInterval && interval !== subscription.billingInterval
  )

  async function handleCheckout() {
    setWorking(true)
    setDataError('')
    try {
      if (canResume) {
        await handleResume()
        return
      }
      if (canSwitchIntervalDirectly) {
        await handleSwitchInterval()
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

  async function handleSwitchInterval() {
    setWorking(true)
    setDataError('')
    try {
      const updated = await resumeSubscription(interval)
      setOverview((current) => current ? { ...current, subscription: updated } : current)
      await refreshPlanContext()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to switch billing interval.')
    } finally {
      setWorking(false)
    }
  }

  async function handleOpenPortal() {
    setWorking(true)
    setDataError('')
    try {
      await openBillingPortal()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to open Stripe portal.')
      setWorking(false)
    }
  }

  async function confirmCancel() {
    setShowCancelModal(false)
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

  const invoices = overview?.invoices || []
  const paymentMethod = overview?.paymentMethod

  function downloadInvoicesCsv() {
    const rows = [
      ['Invoice', 'Date', 'Status', 'Total', 'Currency'],
      ...invoices.map((invoice) => [
        invoice.number || invoice.id,
        formatBillingDateFromUnix(invoice.created),
        invoice.status || 'paid',
        String((Number(invoice.amount_paid ?? invoice.amount_due ?? 0) / 100).toFixed(2)),
        (invoice.currency || 'usd').toUpperCase(),
      ]),
    ]
    downloadCsv(rows, 'inex-ledger-subscription-invoices.csv')
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

        {!loadingData ? (
          <p className="subscription-status-line">
            {isProActive ? (
              <>
                You're on the <strong>Pro</strong> plan
                {subscription?.currentPeriodEnd ? (
                  <> · {subscription?.cancelAtPeriodEnd ? 'ends' : 'renews'} {formatSubscriptionDate(subscription.currentPeriodEnd)}</>
                ) : null}
              </>
            ) : (
              <>You're on the <strong>Basic</strong> plan.</>
            )}
          </p>
        ) : null}

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
              <button className="secondary-button" type="button" disabled={working} onClick={() => setShowCancelModal(true)}>
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

            {(canResume || canSwitchIntervalDirectly) && subscription?.billingInterval && interval !== subscription.billingInterval ? (
              <p className="subscription-interval-note">
                Switching to {interval === 'monthly' ? 'monthly' : 'yearly'} billing applies at your next renewal -- your current period isn't affected, and the new price is charged in full with no proration.
              </p>
            ) : null}

            {canResume ? (
              <button className="primary-button" type="button" disabled={working} onClick={() => void handleResume()}>
                <CreditCard size={18} />
                {working ? 'Working' : 'Keep Pro active'}
              </button>
            ) : canSwitchIntervalDirectly ? (
              <button className="primary-button" type="button" disabled={working} onClick={() => void handleSwitchInterval()}>
                <CreditCard size={18} />
                {working ? 'Switching' : `Switch to ${interval === 'monthly' ? 'monthly' : 'yearly'}`}
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

        {isProActive ? (
          <article className="billing-side-card subscription-payment-card">
            <span className={`status-pill ${paymentMethod ? 'status-income' : 'status-draft'}`}>
              {paymentMethod ? 'Connected' : 'Not connected'}
            </span>
            <strong>{formatPaymentMethod(paymentMethod)}</strong>
            <p>{paymentMethod ? 'Default payment method for Stripe subscription billing.' : 'A default payment method will appear here after Stripe checkout.'}</p>
            <button className="secondary-button" type="button" onClick={() => void handleOpenPortal()} disabled={working || loadingData || !overview?.portalAvailable}>
              <ExternalLink size={16} />
              Open Stripe portal
            </button>
          </article>
        ) : null}

        {isProActive ? (
          <section className="table-panel">
            <div className="table-panel-header">
              <div>
                <h2>Invoice history</h2>
                <p>Recent subscription invoices and receipts.</p>
              </div>
              <button className="secondary-button" type="button" disabled={!invoices.length} onClick={downloadInvoicesCsv}>
                <Download size={17} />
                Export CSV
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Payment method</th>
                    <th>Status</th>
                    <th className="align-right">Total</th>
                    <th className="action-col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length ? (
                    invoices.map((invoice) => (
                      <BillingInvoiceRow invoice={invoice} method={formatPaymentMethod(paymentMethod)} key={invoice.id} />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-table-state">
                          <strong>{loadingData ? 'Loading subscription invoices' : 'No subscription invoices yet'}</strong>
                          <span>Stripe receipts will appear after the first successful checkout.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>

      {showCancelModal ? (
        <div className="transaction-modal-backdrop" role="presentation" onMouseDown={() => setShowCancelModal(false)}>
          <section
            className="transaction-detail-modal subscription-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelSubscriptionTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="cancelSubscriptionTitle">Cancel your subscription and return to Basic?</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close cancel subscription" onClick={() => setShowCancelModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="transaction-detail-body">
              <p>
                You'll keep full Pro access through the rest of your current billing period -- after that, this workspace switches to Basic automatically.
                No refund is issued for the current period, and you can resubscribe any time.
              </p>
            </div>
            <div className="drawer-actions">
              <button className="secondary-button" type="button" onClick={() => setShowCancelModal(false)}>Never mind</button>
              <button className="secondary-button danger-button" type="button" onClick={() => void confirmCancel()}>Cancel and return to Basic</button>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  )
}

function BillingInvoiceRow({ invoice, method }: { invoice: BillingInvoice; method: string }) {
  return (
    <tr>
      <td data-label="Invoice">
        <strong>{invoice.number || invoice.id}</strong>
      </td>
      <td data-label="Date">{formatBillingDateFromUnix(invoice.created)}</td>
      <td data-label="Payment method">{method}</td>
      <td data-label="Status">
        <span className="status-pill status-income">{invoice.status || 'paid'}</span>
      </td>
      <td data-label="Total" className="align-right amount">{formatBillingInvoiceAmount(invoice)}</td>
      <td data-label="Action" className="action-col receipt-actions">
        {invoice.hosted_invoice_url ? <a className="row-action" href={invoice.hosted_invoice_url} rel="noreferrer" target="_blank">View</a> : null}
        {invoice.invoice_pdf ? <a className="row-action" href={invoice.invoice_pdf} rel="noreferrer" target="_blank">PDF</a> : null}
      </td>
    </tr>
  )
}

function formatPaymentMethod(method?: BillingPaymentMethod | null) {
  if (!method) return 'No payment method yet'
  if (method.type === 'card') {
    return `${method.brand || 'Card'} ending ${method.last4 || '----'}`
  }
  if (method.type === 'us_bank_account') {
    return `${method.bankName || 'Bank account'} ending ${method.last4 || '----'}`
  }
  return method.type || 'Payment method'
}

function readPreferredBillingInterval(): BillingInterval {
  if (typeof window === 'undefined') return 'monthly'
  const saved = window.sessionStorage.getItem('inex-preferred-billing-interval')
  return saved === 'yearly' ? 'yearly' : 'monthly'
}

export default Subscription
