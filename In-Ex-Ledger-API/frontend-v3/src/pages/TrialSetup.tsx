import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import {
  cancelSubscription,
  formatSubscriptionMoney,
  loadBillingPricing,
  startCheckout,
  type BillingInterval,
  type BillingPricing,
} from '../lib/billingApi'

function readNextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || ''
  return next.startsWith('/') && !next.startsWith('//') ? next : '/transactions'
}

function resolveStayPage() {
  // TrialSetup only ever navigates within the authenticated app, so mapping
  // the "next" path straight to Transactions unless it's a known guided-setup
  // destination keeps this simple without importing App's full slug table.
  const next = readNextPath()
  const guided: Record<string, 'Categories' | 'Accounts' | 'Transactions'> = {
    '/categories': 'Categories',
    '/accounts': 'Accounts',
    '/transactions': 'Transactions',
  }
  return guided[next] || 'Transactions'
}

function formatPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

function TrialSetup(props: PageProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [error, setError] = useState('')
  const [openingCheckout, setOpeningCheckout] = useState(false)
  const [showBasicConfirm, setShowBasicConfirm] = useState(false)
  const [confirmingBasic, setConfirmingBasic] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  async function beginCheckout() {
    setOpeningCheckout(true)
    setError('')
    try {
      window.sessionStorage.setItem('inex-preferred-billing-interval', interval)
      await startCheckout(interval)
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to open Pro checkout.')
      setOpeningCheckout(false)
    }
  }

  async function confirmStayOnBasic() {
    setConfirmingBasic(true)
    setConfirmError('')
    try {
      // Actually declines the trial server-side (not just a client-side
      // navigation) so the account is Basic immediately and isn't sent back
      // to this screen on a later visit.
      await cancelSubscription()
      props.onNavigate(resolveStayPage())
    } catch (stayError) {
      setConfirmError(stayError instanceof Error ? stayError.message : 'Unable to switch to Basic.')
    } finally {
      setConfirmingBasic(false)
    }
  }

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Choose your plan</h2>
      <p>You can change this anytime from Settings.</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="trial-plan-grid">
        <article className="pricing-card trial-plan-card">
          <div>
            <h3>Basic</h3>
            <strong>$0</strong>
            <p>Free, with real monthly limits.</p>
          </div>
          <ul>
            <li><CheckCircle2 size={16} /><span>50 transactions and 25 receipts a month</span></li>
            <li><CheckCircle2 size={16} /><span>Manual transactions, accounts, and categories</span></li>
            <li><CheckCircle2 size={16} /><span>Mileage tracking and basic invoicing</span></li>
            <li><CheckCircle2 size={16} /><span>Your records stay available if you upgrade later</span></li>
          </ul>
          <button
            className="secondary-button"
            type="button"
            disabled={openingCheckout}
            onClick={() => setShowBasicConfirm(true)}
          >
            Stay on Basic
          </button>
        </article>

        <article className="pricing-card is-highlighted trial-plan-card">
          <div>
            <h3>Pro</h3>
            <strong>{formatPrice(pricing, interval)}<span>{interval === 'monthly' ? ' / month' : ' / year'}</span></strong>
            <p>No monthly limits, plus automation and tax-ready exports.</p>
          </div>
          <ul>
            <li><CheckCircle2 size={16} /><span>No monthly transaction or receipt limits</span></li>
            <li><CheckCircle2 size={16} /><span>Recurring transactions and tax estimates</span></li>
            <li><CheckCircle2 size={16} /><span>PDF accountant packets and full CPA-ready CSV exports</span></li>
            <li><CheckCircle2 size={16} /><span>Advanced export and edge-case tools</span></li>
          </ul>
          <label className="field trial-plan-interval">
            Billing cadence
            <select value={interval} onChange={(event) => setInterval(event.target.value as BillingInterval)}>
              <option value="monthly">Monthly - {formatPrice(pricing, 'monthly')}</option>
              <option value="yearly">Yearly - {formatPrice(pricing, 'yearly')}</option>
            </select>
          </label>
          <button
            className="primary-button"
            type="button"
            disabled={openingCheckout}
            onClick={() => void beginCheckout()}
          >
            {openingCheckout ? 'Opening checkout...' : 'Start Pro trial'}
          </button>
        </article>
      </div>

      {showBasicConfirm ? (
        <div className="transaction-modal-backdrop" role="presentation" onMouseDown={() => !confirmingBasic && setShowBasicConfirm(false)}>
          <section
            className="transaction-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stayOnBasicTitle"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <h2 id="stayOnBasicTitle">Stay on Basic?</h2>
                <p>Basic includes 50 transactions and 25 receipt uploads a month. Your existing records always remain available, and you can upgrade to Pro anytime from Settings.</p>
              </div>
              <button className="icon-button" type="button" aria-label="Close" disabled={confirmingBasic} onClick={() => setShowBasicConfirm(false)}>
                <X size={18} />
              </button>
            </div>
            {confirmError ? <p className="drawer-error" role="alert">{confirmError}</p> : null}
            <div className="drawer-actions">
              <button className="secondary-button" type="button" disabled={confirmingBasic} onClick={() => props.onNavigate('Pricing')}>
                Compare plans
              </button>
              <button className="primary-button" type="button" disabled={confirmingBasic} onClick={() => void confirmStayOnBasic()}>
                {confirmingBasic ? 'Switching...' : 'Stay on Basic'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AuthShell>
  )
}

export default TrialSetup
