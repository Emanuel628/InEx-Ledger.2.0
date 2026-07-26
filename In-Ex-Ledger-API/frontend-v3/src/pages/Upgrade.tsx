import { CheckCircle2 } from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'

function Upgrade(props: PageProps) {
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
          <strong>$12<span> / month</span></strong>
          <ul>
            <li><CheckCircle2 size={17} /> One business workspace</li>
            <li><CheckCircle2 size={17} /> CSV and PDF exports</li>
            <li><CheckCircle2 size={17} /> Receipt and Tax ID safeguards</li>
            <li><CheckCircle2 size={17} /> Invoices, mileage, messages, and analytics</li>
          </ul>
          <button className="primary-button" type="button" onClick={() => props.onNavigate('TrialSetup')}>Continue</button>
        </article>
      </section>
    </PublicShell>
  )
}

export default Upgrade
