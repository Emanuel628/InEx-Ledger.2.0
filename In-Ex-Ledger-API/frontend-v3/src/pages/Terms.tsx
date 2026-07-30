import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'

const termsSections = [
  ['Contracting party and notices', 'These terms are between you and the company operating InEx Ledger. Account, billing, operational, and legal notices may be sent electronically through the service or to your account email.'],
  ['Eligibility and account responsibility', 'You must provide accurate registration, billing, and business information, keep credentials secure, and remain responsible for activity through your account and invited collaborators.'],
  ['Service scope', 'InEx Ledger is bookkeeping and recordkeeping software. It is not a law firm, accounting firm, tax preparer, payroll processor, fiduciary, or regulated professional adviser.'],
  ['Your data', 'You retain ownership of the records and files you submit. You remain responsible for accuracy, legality, supporting documentation, exports, filings, and professional review before relying on the information.'],
  ['Subscriptions and billing', 'Paid features may require an active subscription. Unless checkout states otherwise, subscriptions renew automatically until canceled. Failed payment may lead to retries, downgrade, suspension, or termination of paid features.'],
  ['Availability and changes', 'Features, plans, integrations, limits, and workflows may change. We do not guarantee uninterrupted availability or compatibility with every device, browser, tax workflow, or third-party system.'],
  ['Third-party services', 'The service may rely on providers such as hosting, payment, email, security, bank-linking, OCR, and file-generation vendors. Third-party services have their own terms and may affect availability.'],
  ['Disclaimers and limits', 'To the maximum extent permitted by law, the service is provided as-is, and InEx Ledger limits liability for indirect, incidental, special, consequential, exemplary, or punitive damages.'],
]

function Terms(props: PageProps) {
  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <article className="legal-article">
        <p className="eyebrow">Terms</p>
        <h1>Terms of Service</h1>
        <p className="legal-effective">Effective date: May 20, 2026</p>
        <p>
          These Terms of Service govern access to and use of the InEx Ledger website, application,
          subscription features, exports, and related services.
        </p>
        {termsSections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </article>
    </PublicShell>
  )
}

export default Terms
