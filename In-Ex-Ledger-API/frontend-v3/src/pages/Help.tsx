import { useMemo, useState } from 'react'
import { BookOpen, Car, ChevronDown, CreditCard, Download, FileText, FolderTree, Landmark, Mail, Receipt, Search, Settings, ShieldCheck, Tags, type LucideIcon } from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import BankCsvHelpGuide from '../components/BankCsvHelp'

type HelpCategory = 'All' | 'Setup' | 'Records' | 'Tax' | 'Billing' | 'Support'

const helpItems = [
  {
    title: 'Start with accounts',
    body: 'Create each bank, credit card, cash, or manual account before importing or adding transactions.',
    detail: 'Accounts are user-managed right now. Plaid is not live in this version, so add the account shell yourself and choose the correct currency from the business region.',
    icon: Landmark,
    category: 'Setup',
  },
  {
    title: 'Transactions dashboard',
    body: 'Use Transactions as the main dashboard for income, expenses, estimated tax, review work, receipts, imports, and recurring templates.',
    detail: 'Add or edit transactions from the drawer, attach receipts, use More filters for date/category/account/status filtering, import CSV files, and use Undo after deleting a transaction.',
    icon: BookOpen,
    category: 'Records',
  },
  {
    title: 'CSV imports and auto-mapping',
    body: 'Import bank CSV files from Transactions after choosing account, date range, and duplicate handling.',
    detail: 'The importer reads common bank columns, combines split description fields, checks duplicates, applies mapping rules/history/merchant rules, and leaves uncertain rows as Imported Income or Imported Expense for review.',
    icon: FileText,
    category: 'Records',
  },
  {
    title: 'Categories and tax lines',
    body: 'Categories control how transactions flow into US Schedule C or Canada T2125/GST-HST reporting.',
    detail: 'Keep active categories mapped to the correct tax line. Archived or inactive categories should not be used for new transactions. If a category has zero activity it is marked inactive until used.',
    icon: Tags,
    category: 'Tax',
  },
  {
    title: 'Receipts',
    body: 'Upload receipt files and link them to the matching transaction when proof is required.',
    detail: 'A receipt can stay unlinked until the matching transaction exists. Use the link picker to choose a transaction; do not assume the latest transaction is always correct.',
    icon: Receipt,
    category: 'Records',
  },
  {
    title: 'Mileage or kilometers',
    body: 'Track business vehicle trips and vehicle expenses from the Mileage page.',
    detail: 'US businesses see Mileage. Canadian businesses see Kilometers. Vehicle entries feed tax-ready records and respect accounting period locks.',
    icon: Car,
    category: 'Tax',
  },
  {
    title: 'Export safeguards',
    body: 'Generate CSV or PDF packages from Exports after review checks are complete.',
    detail: 'PDF packages require explicit sensitive-data handling and certification. CSV exports are available for spreadsheet/accountant review and export history tracks generated packages.',
    icon: ShieldCheck,
    category: 'Tax',
  },
  {
    title: 'Invoices',
    body: 'Create invoices, send them, mark them paid, void them, or delete them from the invoice action menu.',
    detail: 'Invoice titles come from the New Invoice sheet. Invoice actions are in the row menu instead of separate table buttons.',
    icon: FolderTree,
    category: 'Records',
  },
  {
    title: 'Messages and support',
    body: 'Use Messages for support requests, general emails, invoice replies, sent mail, and archived threads.',
    detail: 'Compose supports multiple recipients and CC. Request Support keeps the support category selector and does not include CC.',
    icon: Mail,
    category: 'Support',
  },
  {
    title: 'Billing and subscription',
    body: 'Use Subscription for plan status, monthly or yearly checkout, workspace capacity, added businesses, cancellation, and Stripe billing.',
    detail: 'Use Billing for payment methods, invoices, and Stripe portal access. Canceled or expired paid access should fall back to free-tier access instead of blocking the app.',
    icon: CreditCard,
    category: 'Billing',
  },
  {
    title: 'Settings and security',
    body: 'Manage business profile, preferences, language, theme, MFA, sessions, data export, and account danger-zone actions from Settings.',
    detail: 'Email changes use a six-digit email verification flow. Accounting period locks live in Business Profile and protect locked transaction, receipt, and mileage edits.',
    icon: Settings,
    category: 'Setup',
  },
  {
    title: 'Data export',
    body: 'Download account data from Settings when you need a full account package.',
    detail: 'Use Settings > Data for account-level JSON or CSV export. Use Exports for tax/workpaper packages.',
    icon: Download,
    category: 'Tax',
  },
] satisfies { title: string; body: string; detail: string; icon: LucideIcon; category: Exclude<HelpCategory, 'All'> }[]

function Help(props: PageProps) {
  const businessRegion = props.authUser?.business?.type === 'CA' ? 'CA' : 'US'
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
    <AppShell {...props} searchPlaceholder="Search help, records, billing">
      <main className="transactions-page help-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Support</p>
            <h1>Help</h1>
            <p>Current guidance for the v3 app, organized around the pages you use every day.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => props.onNavigate('Messages')}>
            <Mail size={18} />
            Request support
          </button>
        </section>

        <section className="export-card export-form-panel">
          <div className="export-card-header">
            <div>
              <p className="eyebrow">Records</p>
              <h2>Import your CSV from your bank</h2>
            </div>
            <FileText size={20} />
          </div>
          <BankCsvHelpGuide region={businessRegion} />
        </section>

        <section className="table-toolbar">
          <div className="field">
            <Search size={18} />
            <input type="search" placeholder="Search help topics" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </div>
          <div className="filter-actions">
            {(['All', 'Setup', 'Records', 'Tax', 'Billing', 'Support'] as HelpCategory[]).map((option) => (
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
