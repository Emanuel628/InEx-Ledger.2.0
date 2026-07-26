import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'
import { formatSubscriptionMoney, loadBillingPricing, type BillingPricing } from '../lib/billingApi'

function Upgrade(props: PageProps) {
  const [pricing, setPricing] = useState<BillingPricing | null>(null)

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  const monthlyPrice = pricing?.pricing.monthly?.base
  const price = Number.isFinite(monthlyPrice) ? formatSubscriptionMoney(Number(monthlyPrice), pricing?.currency || 'usd') : '$12'

  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <section className="public-page-heading">
        <p className="eyebrow">Upgrade</p>
        <h1>Upgrade to Pro</h1>
        <p>Unlock the core working app: receipts, mileage, invoices, exports, safeguards, and support messages.</p>
      </section>

      <section className="upgrade-panel">
        <article className="pricing-card is-highlighted">
          <h2>Pro</h2>
          <strong>{price}<span> / month</span></strong>
          <ul>
            <li><CheckCircle2 size={17} /> One business workspace</li>
            <li><CheckCircle2 size={17} /> CSV and PDF exports</li>
            <li><CheckCircle2 size={17} /> Receipt and Tax ID safeguards</li>
            <li><CheckCircle2 size={17} /> Invoices, mileage, messages, and analytics</li>
          </ul>
          <button className="primary-button" type="button" onClick={() => props.onNavigate(props.authUser ? 'Subscription' : 'Register')}>Continue</button>
        </article>
      </section>
    </PublicShell>
  )
}

export default Upgrade
