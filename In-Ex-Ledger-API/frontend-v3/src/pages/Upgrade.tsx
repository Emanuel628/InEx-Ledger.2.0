import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'
import { loadBillingPricing, type BillingPricing } from '../lib/billingApi'
import { FAIR_USE_FOOTNOTE, PRO_FEATURES, formatPlanPeriod, formatPlanPrice } from '../lib/planContent'

function Upgrade(props: PageProps) {
  const [pricing, setPricing] = useState<BillingPricing | null>(null)

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

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
          <strong>{formatPlanPrice(pricing, 'monthly')}<span>{formatPlanPeriod('monthly')}</span></strong>
          <p className="price-note-inline">Or {formatPlanPrice(pricing, 'yearly')}/year.</p>
          <ul>
            {PRO_FEATURES.map((feature) => (
              <li key={feature}><CheckCircle2 size={17} /> {feature}</li>
            ))}
          </ul>
          <p className="upgrade-reassurance">Your existing records remain available either way -- upgrading only unlocks new Pro capacity and tools.</p>
          <button className="primary-button" type="button" onClick={() => props.onNavigate(props.authUser ? 'Subscription' : 'Register')}>Continue</button>
          <p className="price-note-footnote">{FAIR_USE_FOOTNOTE}</p>
        </article>
      </section>
    </PublicShell>
  )
}

export default Upgrade
