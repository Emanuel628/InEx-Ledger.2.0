import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'
import { loadBillingPricing, type BillingPricing } from '../lib/billingApi'
import { usePlan } from '../context/PlanContext'
import {
  BASIC_FEATURES,
  BASIC_LIMITS_NOTE,
  FAIR_USE_FOOTNOTE,
  PRO_FEATURES,
  formatPlanPeriod,
  formatPlanPrice,
} from '../lib/planContent'

function Pricing(props: PageProps) {
  const [pricing, setPricing] = useState<BillingPricing | null>(null)
  const { isPro } = usePlan()

  useEffect(() => {
    loadBillingPricing()
      .then(setPricing)
      .catch(() => setPricing(null))
  }, [])

  const plans = [
    {
      name: 'Basic',
      price: '$0',
      period: '',
      description: 'Get your books started for free, with real monthly limits.',
      features: [BASIC_LIMITS_NOTE, ...BASIC_FEATURES],
    },
    {
      name: 'Pro',
      price: formatPlanPrice(pricing, 'monthly'),
      period: formatPlanPeriod('monthly'),
      description: 'For active operators who need automation, tax prep, and full exports.',
      note: `Or ${formatPlanPrice(pricing, 'yearly')}/year.`,
      features: PRO_FEATURES,
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
            {plan.note ? <p className="price-note-inline">{plan.note}</p> : null}
          </article>
        ))}
      </section>
      <p className="price-note-footnote">{FAIR_USE_FOOTNOTE}</p>
    </PublicShell>
  )
}

export default Pricing
