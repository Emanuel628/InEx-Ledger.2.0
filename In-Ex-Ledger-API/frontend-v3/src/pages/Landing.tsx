import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Globe2,
  LayoutGrid,
  Receipt,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import PublicShell from '../components/PublicShell'

function Landing(props: PageProps) {
  return (
    <PublicShell theme={props.theme} onNavigate={props.onNavigate}>
      <section className="public-hero">
        <div className="public-hero-copy">
          <p className="eyebrow">Built for independent businesses</p>
          <h1>Clean books without the accounting headache.</h1>
          <p>
            Track income, expenses, receipts, mileage, invoices, and export-ready records in one calm ledger.
          </p>
          <div className="public-hero-actions">
            <button className="primary-button" type="button" onClick={() => props.onNavigate('Register')}>
              Start free
              <ArrowRight size={18} />
            </button>
            <button className="secondary-button" type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>
              See how it works
            </button>
          </div>
          <p className="public-microcopy">No credit card required. Set up in minutes.</p>
        </div>
      </section>

      <section className="landing-trust-strip" aria-label="Trust signals">
        <span><ShieldCheck size={17} /> No bank credentials stored</span>
        <span><Download size={17} /> Export anytime</span>
        <span><Globe2 size={17} /> US and Canada support</span>
        <span><CheckCircle2 size={17} /> Built for small business owners</span>
      </section>

      <section className="public-section" id="how-it-works">
        <div className="public-section-head is-centered">
          <h2>How InEx Ledger works</h2>
          <p>Three habits that keep your records easy to review all year, not just in April.</p>
        </div>
        <div className="landing-steps">
          <Step number="1" title="Add your records" text="Enter income, expenses, accounts, categories, and receipt details as they happen." />
          <Step number="2" title="Keep proof together" text="Attach receipts and notes so every record carries its own evidence without digging through photos or email later." />
          <Step number="3" title="Export when ready" text="Download clean records for taxes, review, or your preparer in a couple of clicks." />
        </div>
      </section>

      <section className="public-section landing-section-tinted">
        <div className="public-section-head">
          <h2>Everything your records need, in one place</h2>
          <p>Money in, money out, proof attached, and exports ready without full-suite complexity.</p>
        </div>
        <div className="public-feature-grid">
          <Feature icon={TrendingUp} title="Income tracking" text="Log money in from clients and sales so you always know where you stand." />
          <Feature icon={TrendingDown} title="Expense tracking" text="Track money out by category without spreadsheet chaos or mixed-up personal charges." />
          <Feature icon={Receipt} title="Receipt vault" text="Keep proof attached to the record instead of buried in photos or email." />
          <Feature icon={LayoutGrid} title="Accounts and categories" text="Organize records the way your business actually runs, not the way software demands." />
          <Feature icon={FileSpreadsheet} title="CSV exports" text="Download clean records anytime for tax time, a review, or to hand to your preparer." />
          <Feature icon={Globe2} title="US and Canada support" text="USD and CAD businesses both get a ledger that fits how they operate." />
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-head is-centered">
          <h2>Make tax handoff less painful</h2>
          <p>InEx Ledger keeps income, expenses, receipts, and notes organized before tax season.</p>
        </div>
        <div className="handoff-grid">
          <HandoffCard title="Without InEx Ledger" tone="bad" items={['Missing receipts', 'Spreadsheet cleanup marathons', 'Mixed personal and business records', 'Last-minute scrambling']} />
          <HandoffCard title="With InEx Ledger" tone="good" items={['Organized income and expenses', 'Receipt details in one place', 'Export-ready records', 'Cleaner handoff to your preparer']} />
        </div>
      </section>

      <section className="public-section landing-section-tinted">
        <div className="public-section-head is-centered">
          <h2>Built for businesses in the U.S. and Canada</h2>
          <p>Choose the country and currency that match your business, so your ledger fits how you actually operate.</p>
        </div>
        <div className="region-grid">
          <RegionCard region="US" title="United States" text="USD support for U.S.-based small businesses and 1099 freelancers." />
          <RegionCard region="CA" title="Canada" text="CAD support for Canadian businesses, from coast to coast." />
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-head is-centered">
          <h2>Start free. Upgrade when you need more.</h2>
          <p>Begin with the basics, then upgrade when you want the full bookkeeping workflow.</p>
        </div>
        <div className="pricing-grid landing-pricing-grid">
          <PlanCard
            name="Basic"
            price="$0"
            description="For getting organized, with real monthly limits."
            action="Start free"
            onAction={() => props.onNavigate('Register')}
            features={['50 transactions and 25 receipts a month', 'Add accounts and categories', 'Mileage and basic invoicing', 'Basic CSV ledger export']}
          />
          <PlanCard
            name="Pro"
            price="$12"
            period=" / month"
            description="For cleaner records and easier handoff."
            action="Upgrade to Pro"
            highlighted
            onAction={() => props.onNavigate('Upgrade')}
            note="Billed monthly at $12."
            features={['No monthly transaction or receipt limits', 'Recurring transactions and tax estimates', 'PDF and full CPA-ready CSV exports', 'Advanced export and edge-case tools']}
          />
        </div>
        <p className="price-note">No charge today. Upgrade only when you choose.</p>
      </section>

      <section className="public-section landing-section-tinted">
        <div className="public-section-head is-centered">
          <h2>Questions, answered</h2>
        </div>
        <div className="faq-list">
          <Faq question="Who is InEx Ledger for?" answer="InEx Ledger is for solo operators, freelancers, contractors, consultants, creators, and very small service businesses that want cleaner records without dragging around a full accounting suite." open />
          <Faq question="Is this meant to replace QuickBooks?" answer="Not for every business. InEx Ledger is the better fit when you want a calmer recordkeeping tool with receipts, support files, invoice replies, warning flags, and review-ready exports." open />
          <Faq question="Does InEx Ledger file my taxes?" answer="No. It helps you keep cleaner records, catch missing details early, and hand over a stronger package when it is time to work with a CPA or tax preparer." />
          <Faq question="Can my CPA or tax preparer use the hand-off export?" answer="Yes. The export is built to be easier to review, with totals, category groupings, receipt and support coverage, blockers, warnings, excluded items, and review notes." open />
          <Faq question="Does it support Schedule C and T2125/T4A?" answer="Yes. U.S. records can be kept in a Schedule C-friendly flow, and Canadian records can be kept in a T2125/T4A-friendly flow with GST/HST support, kilometre tracking, receipts, and export handoff." />
          <Faq question="Can I attach receipts and support files?" answer="Yes. You can keep receipts, mileage or kilometre logs, allocation worksheets, home-office support, capital-asset support, tax-profile support, and review notes tied to the record they belong to." />
          <Faq question="Can I send invoices?" answer="Yes. Simple invoice sending is included in Pro, and client replies come back into your account tied to the invoice history." />
          <Faq question="Can I export my data?" answer="Yes. You can export PDF and CSV workpapers for cleanup, review, or handoff." />
        </div>
      </section>

      <section className="final-cta">
        <h2>Clean books all year. Less stress at tax time.</h2>
        <p>Start with a simple ledger today and keep your business records easier to review later.</p>
        <div className="public-hero-actions">
          <button className="primary-button" type="button" onClick={() => props.onNavigate('Register')}>Start your ledger</button>
          <button className="secondary-button" type="button" onClick={() => props.onNavigate('Login')}>Sign in</button>
        </div>
      </section>
    </PublicShell>
  )
}

function Feature({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <article className="public-feature-card">
      <span><Icon size={21} /></span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <article className="landing-step">
      <span>{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function HandoffCard({ title, tone, items }: { title: string; tone: 'good' | 'bad'; items: string[] }) {
  const Icon = tone === 'good' ? CheckCircle2 : Ban
  return (
    <article className={`handoff-card handoff-${tone}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}><Icon size={16} /> {item}</li>
        ))}
      </ul>
    </article>
  )
}

function RegionCard({ region, title, text }: { region: string; title: string; text: string }) {
  return (
    <article className="region-card">
      <span>{region}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function PlanCard({
  name,
  price,
  period = ' / month',
  description,
  features,
  action,
  onAction,
  highlighted = false,
  note,
}: {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  action: string
  onAction: () => void
  highlighted?: boolean
  note?: string
}) {
  return (
    <article className={`pricing-card ${highlighted ? 'is-highlighted' : ''}`}>
      {highlighted ? <span className="plan-badge">Most popular</span> : null}
      <div>
        <h2>{name}</h2>
        <p>{description}</p>
      </div>
      <strong>{price}<span>{period}</span></strong>
      <ul>
        {features.map((feature) => (
          <li key={feature}><CheckCircle2 size={17} /> {feature}</li>
        ))}
      </ul>
      <button className={highlighted ? 'primary-button' : 'secondary-button'} type="button" onClick={onAction}>{action}</button>
      {note ? <p className="price-note-inline">{note}</p> : null}
    </article>
  )
}

function Faq({ question, answer, open = false }: { question: string; answer: string; open?: boolean }) {
  return (
    <details className="faq-item" open={open}>
      <summary>{question}</summary>
      <p>{answer}</p>
    </details>
  )
}

export default Landing
