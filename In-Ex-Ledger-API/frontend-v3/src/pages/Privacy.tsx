import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'

const privacySections = [
  ['Who controls your information', 'The company operating InEx Ledger is responsible for personal information handled through the website, application, billing flows, support channels, and related services.'],
  ['Information we collect', 'We collect account details, business profile details, bookkeeping records, billing metadata, security events, support messages, uploaded receipts, exports, and preferences you submit or create while using the service.'],
  ['How we use information', 'We use information to provide and secure the service, manage accounts and subscriptions, organize records, generate exports, deliver support, prevent abuse, and satisfy legal or operational obligations.'],
  ['How we disclose information', 'We do not sell personal information or use bookkeeping data for targeted advertising. We disclose information to service providers, authorized collaborators, legal advisers, authorities when required, and business-transfer counterparties under appropriate restrictions.'],
  ['Service providers', 'Depending on enabled features, providers may include hosting, payment, email, security, bank-linking, receipt OCR, and operational tooling vendors such as Railway, Stripe, Resend, Plaid, and approved processing providers.'],
  ['Retention and security', 'Records are retained as needed for product use, tax, audit, dispute, backup, security, and legal obligations. We use administrative, technical, and organizational safeguards, but no online system can be guaranteed completely secure.'],
  ['Your choices', 'Depending on your location, you may request access, correction, deletion, portability, restriction, or consent withdrawal for certain information. Privacy requests can be sent to privacy@inexledger.com.'],
]

function Privacy(props: PageProps) {
  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <LegalArticle
        eyebrow="Privacy"
        title="Privacy Policy"
        effective="May 20, 2026"
        intro="This policy explains how InEx Ledger collects, uses, protects, retains, and discloses personal information."
        sections={privacySections}
      />
    </PublicShell>
  )
}

function LegalArticle({ eyebrow, title, effective, intro, sections }: { eyebrow: string; title: string; effective: string; intro: string; sections: string[][] }) {
  return (
    <article className="legal-article">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="legal-effective">Effective date: {effective}</p>
      <p>{intro}</p>
      {sections.map(([sectionTitle, text]) => (
        <section key={sectionTitle}>
          <h2>{sectionTitle}</h2>
          <p>{text}</p>
        </section>
      ))}
    </article>
  )
}

export default Privacy
