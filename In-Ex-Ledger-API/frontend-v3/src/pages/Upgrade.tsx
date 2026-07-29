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
        <p>Basic already covers transactions, receipts, mileage, invoicing, and support messages. Pro removes the Basic monthly limits and adds automation and tax-ready exports.</p>
      </section>

      <section className="upgrade-panel">
        <article className="pricing-card is-highlighted">
          <h2>Pro</h2>
          <strong>{price}<span> / month</span></strong>
          <ul>
            <li><CheckCircle2 size={17} /> No monthly transaction or receipt-upload limits, subject to reasonable technical and abuse-prevention limits</li>
            <li><CheckCircle2 size={17} /> Recurring transactions</li>
            <li><CheckCircle2 size={17} /> Tax estimates</li>
            <li><CheckCircle2 size={17} /> PDF accountant packets and full CPA/workpaper CSV exports</li>
            <li><CheckCircle2 size={17} /> Advanced export and edge-case tools</li>
          </ul>
          <p className="upgrade-reassurance">Your existing records remain available either way -- upgrading only unlocks new Pro capacity and tools.</p>
          <button className="primary-button" type="button" onClick={() => props.onNavigate(props.authUser ? 'Subscription' : 'Register')}>Continue</button>
        </article>
      </section>
    </PublicShell>
  )
}

export default Upgrade
