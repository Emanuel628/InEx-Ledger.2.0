import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { formatSubscriptionMoney, loadBillingPricing, startCheckout, type BillingInterval, type BillingPricing } from '../lib/billingApi'

function readNextPath() {
  const next = new URLSearchParams(window.location.search).get('next') || ''
  return next.startsWith('/') && !next.startsWith('//') ? next : '/transactions'
}

function TrialSetup(props: PageProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const [error, setError] = useState('')
  const [openingCheckout, setOpeningCheckout] = useState(false)

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

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Set up Pro</h2>
      <p>Pick a billing cadence to start your Pro trial. We'll collect a payment method now and start billing once the trial ends.</p>
      <ul className="trial-value-list">
        <li><CheckCircle2 size={17} /><span>No monthly caps on transactions, receipts, or CSV imports</span></li>
        <li><CheckCircle2 size={17} /><span>Mileage tracking that turns trips into real deductions</span></li>
        <li><CheckCircle2 size={17} /><span>Professional invoices so clients pay you faster</span></li>
        <li><CheckCircle2 size={17} /><span>Tax-ready PDF accountant packets and full CPA/workpaper CSV exports</span></li>
      </ul>
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Business
          <input value={props.authUser?.business?.name || 'No business attached yet'} readOnly />
        </label>
        <label>
          Billing cadence
          <select value={interval} onChange={(event) => setInterval(event.target.value as BillingInterval)}>
            <option value="monthly">Monthly - {formatPrice(pricing, 'monthly')}</option>
            <option value="yearly">Yearly - {formatPrice(pricing, 'yearly')}</option>
          </select>
        </label>
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <button
          className="primary-button"
          type="button"
          disabled={openingCheckout}
          onClick={() => void beginCheckout()}
        >
          {openingCheckout ? 'Opening checkout...' : 'Start Pro trial'}
        </button>
        <button className="secondary-button" type="button" disabled={openingCheckout} onClick={() => props.onNavigate(resolveStayPage())}>
          Stay on Basic
        </button>
      </form>
    </AuthShell>
  )
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

export default TrialSetup
