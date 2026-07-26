import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'
import { formatSubscriptionMoney, loadBillingPricing, type BillingPricing } from '../lib/billingApi'

function Pricing(props: PageProps) {
  const [pricing, setPricing] = useState<BillingPricing | null>(null)

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  const proPrice = pricing?.pricing.monthly?.base
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: '',
      description: 'For keeping basic records without losing access.',
      features: ['Manual transactions', 'One business workspace', 'Basic receipts', 'Core exports'],
    },
    {
      name: 'Pro',
      price: Number.isFinite(proPrice) ? formatSubscriptionMoney(Number(proPrice), pricing?.currency || 'usd') : '$12',
      period: ' / month',
      description: 'For active operators who need clean books and export safeguards.',
      features: ['Transactions, receipts, mileage, invoices', 'PDF and CSV exports', 'Tax ID safeguards', 'Support messages'],
      highlighted: true,
    },
  ]

  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <section className="public-page-heading">
        <p className="eyebrow">Pricing</p>
        <h1>Start simple. Upgrade when the records matter.</h1>
        <p>Business-tier pages are intentionally parked. Pro is the focus right now.</p>
      </section>

      <section className="pricing-grid">
        {plans.map((plan) => (
          <article className={`pricing-card ${plan.highlighted ? 'is-highlighted' : ''}`} key={plan.name}>
            <div>
              <h2>{plan.name}</h2>
              <strong>{plan.price}<span>{plan.period}</span></strong>
              <p>{plan.description}</p>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}><CheckCircle2 size={17} /> {feature}</li>
              ))}
            </ul>
            <button
              className={plan.highlighted ? 'primary-button' : 'secondary-button'}
              type="button"
              onClick={() => props.onNavigate(plan.highlighted && props.authUser ? 'Subscription' : plan.highlighted ? 'Upgrade' : 'Register')}
            >
              {plan.highlighted ? 'Upgrade to Pro' : 'Start free'}
            </button>
          </article>
        ))}
      </section>
    </PublicShell>
  )
}

export default Pricing
