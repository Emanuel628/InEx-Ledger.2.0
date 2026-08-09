import { useEffect, useState } from 'react'
import { CheckCircle2, X } from 'lucide-react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import {
  cancelSubscription,
  formatSubscriptionDate,
  loadBillingOverview,
  loadBillingPricing,
  startCheckout,
  type BillingInterval,
  type BillingPricing,
} from '../lib/billingApi'
import { normalizeInternalPath } from '../lib/navigation'
import {
  BASIC_FEATURES,
  BASIC_LIMITS_NOTE,
  PRO_FEATURES,
  TRIAL_CARD_NOTE,
  formatPlanPeriod,
  formatPlanPrice,
} from '../lib/planContent'

function readNextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || ''
  return normalizeInternalPath(next)
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

function TrialSetup(props: PageProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [openingCheckout, setOpeningCheckout] = useState(false)
  const [showBasicConfirm, setShowBasicConfirm] = useState(false)
  const [confirmingBasic, setConfirmingBasic] = useState(false)
  const [confirmError, setConfirmError] = useState('')

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
    // Checkout carries over this account's existing trial end date rather than
    // starting a fresh 30 days, so show it here -- otherwise someone who
    // reaches this screen days into their trial would reasonably expect
    // "Start Pro trial" to mean a brand-new trial window.
    loadBillingOverview()
      .then((overview) => setTrialEndsAt(overview.subscription?.trialEndsAt || null))
      .catch(() => setTrialEndsAt(null))
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

  async function confirmContinueWithBasic() {
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
      <p>You can change plans anytime under Manage Plan.</p>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}

      <div className="trial-plan-grid">
        <article className="pricing-card trial-plan-card">
          <div>
            <h3>Basic</h3>
            <strong>$0</strong>
            <p>{BASIC_LIMITS_NOTE}</p>
          </div>
          <ul>
            {BASIC_FEATURES.map((feature) => (
              <li key={feature}><CheckCircle2 size={16} /><span>{feature}</span></li>
            ))}
          </ul>
          <button
            className="secondary-button"
            type="button"
            disabled={openingCheckout}
            onClick={() => setShowBasicConfirm(true)}
          >
            Continue with Basic
          </button>
        </article>

        <article className="pricing-card is-highlighted trial-plan-card">
          <div>
            <h3>Pro</h3>
            <strong>{formatPlanPrice(pricing, interval)}<span>{formatPlanPeriod(interval)}</span></strong>
            <p>No monthly limits, plus automation and tax-ready exports.</p>
          </div>
          <ul>
            {PRO_FEATURES.map((feature) => (
              <li key={feature}><CheckCircle2 size={16} /><span>{feature}</span></li>
            ))}
          </ul>
          <label className="field trial-plan-interval">
            Billing cadence
            <select value={interval} onChange={(event) => setInterval(event.target.value as BillingInterval)}>
              <option value="monthly">Monthly - {formatPlanPrice(pricing, 'monthly')}</option>
              <option value="yearly">Yearly - {formatPlanPrice(pricing, 'yearly')}</option>
            </select>
          </label>
          {trialEndsAt ? (
            <p className="trial-plan-note">Trial ends {formatSubscriptionDate(trialEndsAt)} -- entering a card now does not restart the clock.</p>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={openingCheckout}
            onClick={() => void beginCheckout()}
          >
            {openingCheckout ? 'Opening checkout...' : 'Start Pro trial'}
          </button>
          <p className="trial-plan-note">{TRIAL_CARD_NOTE}</p>
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
                <h2 id="stayOnBasicTitle">Use Basic?</h2>
                <p>Basic includes 50 transactions and 25 receipt uploads a month. Your existing records always remain available, and you can upgrade to Pro anytime under Manage Plan.</p>
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
              <button className="primary-button" type="button" disabled={confirmingBasic} onClick={() => void confirmContinueWithBasic()}>
                {confirmingBasic ? 'Switching...' : 'Continue with Basic'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AuthShell>
  )
}

export default TrialSetup
