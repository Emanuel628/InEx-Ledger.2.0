import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, Download, LifeBuoy, Mail, Receipt, Search, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

type HelpCategory = 'All' | 'Account' | 'Billing' | 'Records' | 'Exports'

const helpItems = [
  {
    title: 'Getting started',
    body: 'Set up a business, add the first account, confirm categories, and record one real transaction.',
    detail: 'Start with Transactions if you already have records ready. Start with Categories if you want to clean up tax lines first.',
    icon: BookOpen,
    category: 'Account',
  },
  {
    title: 'Billing and subscription',
    body: 'Review plan status, choose monthly or yearly checkout, open Stripe, and confirm renewal state.',
    detail: 'Use Subscription for plan cadence and workspace capacity. Use Billing for Stripe portal, payment methods, and subscription invoices.',
    icon: LifeBuoy,
    category: 'Billing',
  },
  {
    title: 'Message support',
    body: 'Send a support request and keep replies attached to the account record.',
    detail: 'Use Messages for support requests, general messages, invoice replies, sent mail, and archived threads.',
    icon: Mail,
    category: 'Account',
  },
  {
    title: 'Receipts',
    body: 'Upload receipt files and link them to transactions when proof is required.',
    detail: 'A receipt can stay unlinked until the matching transaction exists. Link it before export review.',
    icon: Receipt,
    category: 'Records',
  },
  {
    title: 'Export safeguards',
    body: 'Generate CSV or PDF packages only after the required export checks are complete.',
    detail: 'Protected PDF exports require explicit Tax ID handling and certification. CSV exports remain available for spreadsheet review.',
    icon: ShieldCheck,
    category: 'Exports',
  },
  {
    title: 'Data export',
    body: 'Download account data from Settings when you need a full account package.',
    detail: 'Use Settings > Data for account-level JSON or CSV export. Use Exports for tax/workpaper packages.',
    icon: Download,
    category: 'Exports',
  },
] satisfies { title: string; body: string; detail: string; icon: LucideIcon; category: Exclude<HelpCategory, 'All'> }[]

function Help(props: PageProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [category, setCategory] = useState<HelpCategory>('All')
  const [openTitle, setOpenTitle] = useState<string | null>(helpItems[0].title)

  const visibleItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return helpItems.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesSearch = !normalizedSearch || [item.title, item.body, item.detail, item.category]
        .some((value) => value.toLowerCase().includes(normalizedSearch))
      return matchesCategory && matchesSearch
    })
  }, [category, searchTerm])

  return (
    <AppShell {...props} searchPlaceholder="Search help, billing, support">
      <main className="transactions-page help-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Support</p>
            <h1>Help</h1>
            <p>Find the next action quickly. Support and knowledge base tools stay simple.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => props.onNavigate('Messages')}>
            <Mail size={18} />
            Request support
          </button>
        </section>

        <section className="table-toolbar">
          <div className="field">
            <Search size={18} />
            <input type="search" placeholder="Search help topics" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </div>
          <div className="filter-actions">
            {(['All', 'Account', 'Billing', 'Records', 'Exports'] as HelpCategory[]).map((option) => (
              <button className={`secondary-button ${category === option ? 'is-active-filter' : ''}`} type="button" key={option} onClick={() => setCategory(option)}>
                {option}
              </button>
            ))}
          </div>
        </section>

        <section className="billing-action-grid">
          {visibleItems.map(({ title, body, detail, icon: Icon }) => {
            const isOpen = openTitle === title
            return (
              <article className="billing-action-card" key={title}>
                <div className="billing-card-icon">
                  <Icon size={20} />
                </div>
                <div>
                  <strong>{title}</strong>
                  <p>{body}</p>
                  {isOpen ? <p>{detail}</p> : null}
                </div>
                <button className="secondary-button" type="button" onClick={() => setOpenTitle(isOpen ? null : title)}>
                  {isOpen ? 'Close' : 'Open'}
                  <ChevronDown size={16} />
                </button>
              </article>
            )
          })}
          {!visibleItems.length ? (
            <div className="empty-table-state">
              <strong>No help topics found</strong>
              <span>Try a different search or request support.</span>
            </div>
          ) : null}
        </section>
      </main>
    </AppShell>
  )
}

export default Help
