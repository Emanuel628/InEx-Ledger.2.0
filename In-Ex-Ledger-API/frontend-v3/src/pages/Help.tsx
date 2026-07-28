import { useMemo, useState } from 'react'
import { BookOpen, Building2, Car, ChevronDown, CreditCard, Download, FileText, FolderTree, Landmark, Mail, Receipt, Search, Settings, ShieldCheck, Tags, type LucideIcon } from 'lucide-react'
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
    title: 'How to fill out your business profile',
    body: 'Plain-language help for every field in Settings > Business, including the confusing ones: accounting method, accrual, and material participation.',
    detail: [
      'Business name: the legal or everyday name of your business. If you operate under your own name (for example, a freelancer with no separate company name), just type your own name here.',
      'Contact name: the person Categories, invoices, and support should treat as the point of contact for this business. For a solo owner, this is usually you.',
      'Region: choose US if your business operates in the United States, or CA if it operates in Canada. This controls which tax rules, forms, and currency the app uses everywhere else (Schedule C vs. T2125, USD vs. CAD, Mileage vs. Kilometers, and so on). Pick the country where you actually run and report the business.',
      'Province (Canada only): the Canadian province or territory your business is based in. This affects GST/HST rules that apply to you.',
      'Fiscal year start: the date your business "year" begins for accounting purposes, in MM-DD format (for example, 01-01 for January 1st). Almost every small business and solo owner should just use 01-01 (a normal calendar year) unless your accountant has specifically told you to use a different fiscal year.',
      'Operating name (DBA): short for "Doing Business As." Only fill this in if you legally operate under a different public-facing name than your official business name (for example, your business is legally "Jane Smith" but customers know you as "Jane’s Bakery"). If that does not apply to you, leave it blank.',
      'Business activity code (NAICS code, US only): a 6-digit code the IRS uses on Schedule C to describe, in general terms, what kind of business you run (for example, a certain code means "graphic design services," another means "food trucks"). You do not need to get this perfectly precise — it is used for broad government statistics, not to calculate your taxes. If you do not know your code offhand, search "NAICS code" plus a word or two describing what your business does, or ask your tax preparer. If you truly cannot find an exact match, pick whichever code comes closest to what you do.',
      'Accounting method — Cash vs. Accrual, explained simply: this setting decides WHEN a sale or bill counts in your books. There is no trick to it — pick whichever matches how you already think about your money.',
      '  • Cash method: you record income the moment money actually lands in your hands or bank account, and you record an expense the moment you actually pay it. If you have not been paid yet, it is not income yet. If you have not paid a bill yet, it is not an expense yet. This is the simplest method to understand and to keep track of, and it is what the large majority of solo owners, freelancers, and very small businesses use.',
      '  • Accrual method: you record income the moment you EARN it — for example, the day you finish a job or send an invoice — even if the client has not paid you yet. You record an expense the moment you receive a bill, even if you have not paid it yet. This method gives a more "big picture" view of your business but is more work to track and is mostly used by larger businesses, or ones an accountant has specifically told to use it.',
      '  • If you are not sure which one applies to you: choose Cash. It is the standard default for a small or solo business, and you can always change it later if your accountant advises you to.',
      'Material participation (US only) — what this question is actually asking: this is not about your bookkeeping method. It is a tax-law question the IRS asks: did YOU personally do the work of running this business — regularly, continuously, and to a significant degree — during the year? It is asking whether you are a hands-on, active owner, or a hands-off, passive owner (for example, someone who only invested money and does not do any of the actual work).',
      '  • Answer Yes if: you are the owner (or one of the owners) and you personally do the day-to-day work of the business — seeing clients, making the product, managing the books, running the operations, etc. This describes almost every solo owner and freelancer using this app.',
      '  • Answer No only if: you are a passive investor in someone else’s business and do not personally work in it (for example, a silent business partner who only put in money). This is a fairly rare situation for a solo small-business owner.',
      '  • When in doubt: if you are asking yourself this question at all because you personally run your own business day to day, the answer is Yes.',
    ],
    icon: Building2,
    category: 'Setup',
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
] satisfies { title: string; body: string; detail: string | string[]; icon: LucideIcon; category: Exclude<HelpCategory, 'All'> }[]

function Help(props: PageProps) {
  const businessRegion = props.authUser?.business?.type === 'CA' ? 'CA' : 'US'
  const [searchTerm, setSearchTerm] = useState('')
  const [category, setCategory] = useState<HelpCategory>('All')
  const [openTitle, setOpenTitle] = useState<string | null>(helpItems[0].title)

  const visibleItems = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return helpItems.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const detailValues = Array.isArray(item.detail) ? item.detail : [item.detail]
      const matchesSearch = !normalizedSearch || [item.title, item.body, ...detailValues, item.category]
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
                  {isOpen ? (
                    Array.isArray(detail)
                      ? detail.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                      : <p>{detail}</p>
                  ) : null}
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
