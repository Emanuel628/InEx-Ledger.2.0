import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'

function Legal(props: PageProps) {
  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <section className="public-page-heading">
        <p className="eyebrow">Legal</p>
        <h1>Legal and policies</h1>
        <p>These documents explain the service rules and privacy practices for InEx Ledger.</p>
      </section>

      <section className="legal-link-grid">
        <article className="public-feature-card">
          <h2>Terms of Service</h2>
          <p>Your responsibilities, subscription rules, service limits, disclaimers, and dispute terms.</p>
          <button className="secondary-button" type="button" onClick={() => props.onNavigate('Terms')}>Read terms</button>
        </article>
        <article className="public-feature-card">
          <h2>Privacy Policy</h2>
          <p>How account, billing, support, security, and bookkeeping information is collected and handled.</p>
          <button className="secondary-button" type="button" onClick={() => props.onNavigate('Privacy')}>Read privacy policy</button>
        </article>
      </section>
    </PublicShell>
  )
}

export default Legal
