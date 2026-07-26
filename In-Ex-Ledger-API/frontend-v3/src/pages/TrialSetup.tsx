import { useEffect, useState } from 'react'
import type { PageProps } from '../App'
import AuthShell from '../components/AuthShell'
import { formatSubscriptionMoney, loadBillingPricing, type BillingInterval, type BillingPricing } from '../lib/billingApi'

function TrialSetup(props: PageProps) {
  const [interval, setInterval] = useState<BillingInterval>('monthly')
  const [pricing, setPricing] = useState<BillingPricing | null>(null)

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  return (
    <AuthShell theme={props.theme} onNavigate={props.onNavigate}>
      <h2>Set up Pro</h2>
      <p>Pick a billing cadence, then continue to Subscription to start Stripe checkout.</p>
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
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            window.sessionStorage.setItem('inex-preferred-billing-interval', interval)
            props.onNavigate('Subscription')
          }}
        >
          Continue to Subscription
        </button>
        <button className="secondary-button" type="button" onClick={() => props.onNavigate('Transactions')}>Stay on free tier</button>
      </form>
    </AuthShell>
  )
}

function formatPrice(pricing: BillingPricing | null, interval: BillingInterval) {
  const price = pricing?.pricing?.[interval]?.base
  if (!Number.isFinite(price)) return interval === 'monthly' ? '$12' : '$122.40'
  return formatSubscriptionMoney(Number(price), pricing?.currency || 'usd')
}

export default TrialSetup
