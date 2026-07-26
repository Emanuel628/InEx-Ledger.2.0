import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Eye,
  FileText,
  Link2,
  MoreHorizontal,
  Search,
  UploadCloud,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useSessionDismissed from '../hooks/useSessionDismissed'

type ReceiptLinkState = 'Linked' | 'Unlinked' | 'Needs info'

type ReceiptRecord = {
  id: number
  fileName: string
  merchant: string
  date: string
  amount: number
  linkedTransaction: string
  linkState: ReceiptLinkState
  tone: string
}

const receipts: ReceiptRecord[] = [
  {
    id: 1,
    fileName: 'Adobe_050124.pdf',
    merchant: 'Adobe',
    date: 'May 1',
    amount: 52.99,
    linkedTransaction: 'Software',
    linkState: 'Linked',
    tone: 'red',
  },
  {
    id: 2,
    fileName: 'Shell_050224.jpg',
    merchant: 'Shell',
    date: 'May 2',
    amount: 45.67,
    linkedTransaction: 'Fuel',
    linkState: 'Unlinked',
    tone: 'yellow',
  },
  {
    id: 3,
    fileName: 'Client_Lunch_050324.pdf',
    merchant: 'Client lunch',
    date: 'May 3',
    amount: 78.45,
    linkedTransaction: 'Meals',
    linkState: 'Needs info',
    tone: 'coral',
  },
  {
    id: 4,
    fileName: 'GoogleWorkspace_050724.pdf',
    merchant: 'Google Workspace',
    date: 'May 7',
    amount: 14.4,
    linkedTransaction: 'Software',
    linkState: 'Linked',
    tone: 'blue',
  },
  {
    id: 5,
    fileName: 'OfficeDepot_051024.jpg',
    merchant: 'Office Depot',
    date: 'May 10',
    amount: 23.18,
    linkedTransaction: 'Office Supplies',
    linkState: 'Unlinked',
    tone: 'green',
  },
  {
    id: 6,
    fileName: 'United_051524.pdf',
    merchant: 'United Airlines',
    date: 'May 15',
    amount: 412.36,
    linkedTransaction: 'Travel',
    linkState: 'Linked',
    tone: 'violet',
  },
]

function Receipts(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('receipts-review')

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search receipts, merchants, linked transactions"
      overlay={drawerOpen ? <ReceiptUploadDrawer onClose={() => setDrawerOpen(false)} /> : null}
    >
      <main className="transactions-page receipts-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Receipts</h1>
            <p>Upload, preview, and link receipts before export.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>
            <UploadCloud size={18} />
            Upload receipt
          </button>
        </section>

        {noticeVisible ? (
          <section className="top-alert" aria-label="Receipts need review">
            <AlertTriangle size={17} />
            <div>
              <strong>4 receipts need review</strong>
              <span>Some receipts are unlinked or missing info.</span>
            </div>
            <button type="button">Review</button>
            <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="summary-strip" aria-label="Receipt summary">
          <SummaryItem label="Uploaded" value="24" tone="net" icon={UploadCloud} />
          <SummaryItem label="Linked" value="18" tone="income" icon={Link2} />
          <SummaryItem label="Unlinked" value="4" tone="expense" icon={FileText} />
          <SummaryItem label="Needs info" value="2" tone="review" icon={AlertTriangle} />
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search receipts" />
            </label>

            <div className="filter-actions">
              <button className="secondary-button" type="button">
                <Link2 size={17} />
                Link: All
              </button>
              <button className="secondary-button" type="button">
                <Calendar size={17} />
                May 2024
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Merchant</th>
                  <th>Date</th>
                  <th className="align-right">Amount</th>
                  <th>Linked transaction</th>
                  <th>Link</th>
                  <th className="action-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td data-label="Receipt">
                      <div className="merchant-cell">
                        <span className={`merchant-icon merchant-${receipt.tone}`}>
                          <FileText size={15} />
                        </span>
                        <strong>{receipt.fileName}</strong>
                      </div>
                    </td>
                    <td data-label="Merchant">{receipt.merchant}</td>
                    <td data-label="Date">{receipt.date}</td>
                    <td data-label="Amount" className="align-right amount">
                      {formatMoney(receipt.amount)}
                    </td>
                    <td data-label="Linked transaction">{receipt.linkedTransaction}</td>
                    <td data-label="Link">
                      <LinkPill state={receipt.linkState} />
                    </td>
                    <td data-label="Actions" className="action-col receipt-actions">
                      <button className="row-action" type="button" aria-label={`Preview ${receipt.fileName}`}>
                        <Eye size={18} />
                      </button>
                      <button className="row-action" type="button" aria-label={`Actions for ${receipt.fileName}`}>
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="progressive-panels" aria-label="Additional receipt tools">
          <ProgressivePanel
            id="archived"
            title="Archived receipts"
            summary="12 hidden"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Archived receipts stay available for audit history without crowding current review work.
          </ProgressivePanel>
        </section>
      </main>
    </AppShell>
  )
}

function SummaryItem({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: LucideIcon }) {
  return (
    <article className={`summary-item tone-${tone}`}>
      <div className="summary-icon">
        <Icon size={24} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  )
}

function LinkPill({ state }: { state: ReceiptLinkState }) {
  return <span className={`status-pill receipt-link-${state.toLowerCase().replace(/\s+/g, '-')}`}>{state}</span>
}

function ProgressivePanel({
  id,
  title,
  summary,
  expandedPanel,
  onToggle,
  children,
}: {
  id: string
  title: string
  summary: string
  expandedPanel: string | null
  onToggle: (id: string | null) => void
  children: string
}) {
  const isExpanded = expandedPanel === id

  return (
    <article className="progressive-panel">
      <button type="button" onClick={() => onToggle(isExpanded ? null : id)} aria-expanded={isExpanded}>
        <span>{title}</span>
        <strong>{summary}</strong>
        <ChevronDown size={17} />
      </button>
      {isExpanded ? <p>{children}</p> : null}
    </article>
  )
}

function ReceiptUploadDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label="Upload receipt" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Upload receipt</h2>
            <p>Drop a receipt file, then link it to a transaction.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label className="receipt-dropzone">
            <UploadCloud size={26} />
            <strong>Drag and drop receipt</strong>
            <span>PDF, PNG, or JPG up to 10MB</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg" />
          </label>
          <label>
            Merchant
            <input placeholder="Merchant name" />
          </label>
          <label>
            Receipt date
            <input type="date" />
          </label>
          <label>
            Amount
            <input placeholder="$0.00" />
          </label>
          <label>
            Link transaction
            <select defaultValue="">
              <option value="" disabled>
                Select transaction
              </option>
              <option>Adobe Creative Cloud - $52.99</option>
              <option>Shell - $68.45</option>
              <option>Client lunch - $134.86</option>
            </select>
          </label>
          <details>
            <summary>Notes</summary>
            <div className="advanced-fields">
              <textarea aria-label="Receipt notes" placeholder="Internal note" />
            </div>
          </details>
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button">
            Save receipt
          </button>
        </div>
      </aside>
    </div>
  )
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export default Receipts
