import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'
import { formatSubscriptionMoney, loadBillingPricing, type BillingPricing } from '../lib/billingApi'
import { usePlan } from '../context/PlanContext'

function Pricing(props: PageProps) {
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const { isPro } = usePlan()

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  const proPrice = pricing?.pricing.monthly?.base
  const plans = [
    {
      name: 'Basic',
      price: '$0',
      period: '',
      description: 'Get your books started for free, with real monthly limits.',
      features: [
        '50 transactions and 25 receipt uploads per month',
        'Manual transactions, accounts, and categories',
        'Dashboard and basic analytics',
        'Mileage tracking and basic invoicing',
        'Basic CSV ledger export',
        'Your records stay available even after a monthly limit is reached',
      ],
    },
    {
      name: 'Pro',
      price: Number.isFinite(proPrice) ? formatSubscriptionMoney(Number(proPrice), pricing?.currency || 'usd') : '$12',
      period: ' / month',
      description: 'For active operators who need automation, tax prep, and full exports.',
      features: [
        'Basic monthly limits removed, subject to reasonable technical and abuse-prevention limits',
        'Recurring transactions',
        'Tax estimates',
        'PDF accountant packets and full CPA/workpaper CSV exports',
        'Advanced export and edge-case tools',
        'Additional business workspaces (paid add-on)',
      ],
      highlighted: true,
    },
  ]

  function proButtonLabel() {
    if (!props.authUser) return 'Start Pro trial'
    return isPro ? 'Manage subscription' : 'Upgrade to Pro'
  }

  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <section className="public-page-heading">
        <p className="eyebrow">Pricing</p>
        <h1>Simple bookkeeping. Clear limits. Upgrade when you need more.</h1>
        <p>Basic is free and always keeps your records available. Pro removes the monthly limits and adds automation and tax-ready exports.</p>
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
              {plan.highlighted ? proButtonLabel() : 'Start free'}
            </button>
          </article>
        ))}
      </section>
    </PublicShell>
  )
}

export default Pricing
