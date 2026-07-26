import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  FileText,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void'

type InvoiceRecord = {
  id: number
  title: string
  client: string
  due: string
  status: InvoiceStatus
  amount: number
  tone: string
}

const invoices: InvoiceRecord[] = [
  {
    id: 1,
    title: 'May consulting retainer',
    client: 'Acme Corporation',
    due: 'May 26, 2026',
    status: 'Draft',
    amount: 2520,
    tone: 'blue',
  },
  {
    id: 2,
    title: 'Website support package',
    client: 'Brightfield Studios',
    due: 'May 24, 2026',
    status: 'Sent',
    amount: 1840,
    tone: 'violet',
  },
  {
    id: 3,
    title: 'Q2 implementation work',
    client: 'Northwind Labs',
    due: 'May 22, 2026',
    status: 'Overdue',
    amount: 3200,
    tone: 'red',
  },
  {
    id: 4,
    title: 'Monthly bookkeeping cleanup',
    client: 'Vertex Solutions',
    due: 'May 19, 2026',
    status: 'Paid',
    amount: 950,
    tone: 'green',
  },
  {
    id: 5,
    title: 'Retail analytics setup',
    client: 'Greenway Retail',
    due: 'May 16, 2026',
    status: 'Sent',
    amount: 1150,
    tone: 'coral',
  },
  {
    id: 6,
    title: 'Landing page audit',
    client: 'Bluewater Industries',
    due: 'May 12, 2026',
    status: 'Draft',
    amount: 650,
    tone: 'yellow',
  },
]

function Invoices(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search invoices, clients, invoice titles"
      overlay={drawerOpen ? <InvoiceDrawer onClose={() => setDrawerOpen(false)} /> : null}
    >
      <main className="transactions-page invoices-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Receivables</p>
            <h1>Invoices</h1>
            <p>Send invoices, track payment, and keep client follow-up clear.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>
            <Plus size={18} />
            New invoice
          </button>
        </section>

        <section className="summary-strip" aria-label="Invoice summary">
          <SummaryItem label="Needs action" value="3" tone="review" icon={AlertTriangle} />
          <SummaryItem label="Outstanding" value="$8,420" tone="net" icon={FileText} />
          <SummaryItem label="Paid this month" value="$12,100" tone="income" icon={CheckCircle2} />
          <SummaryItem label="Drafts" value="4" tone="expense" icon={Mail} />
        </section>

        <section className="table-panel invoices-list-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search invoices" />
            </label>

            <div className="filter-actions">
              <button className="secondary-button" type="button">
                <FileText size={17} />
                Status: All
              </button>
              <button className="secondary-button" type="button">
                <Calendar size={17} />
                This month
              </button>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="align-right">Amount</th>
                  <th className="action-col">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Invoice">
                      <div className="merchant-cell">
                        <span className={`merchant-icon merchant-${invoice.tone}`}>
                          <FileText size={15} />
                        </span>
                        <strong>{invoice.title}</strong>
                      </div>
                    </td>
                    <td data-label="Client">{invoice.client}</td>
                    <td data-label="Due">{invoice.due}</td>
                    <td data-label="Status">
                      <StatusPill status={invoice.status} />
                    </td>
                    <td data-label="Amount" className="align-right amount">
                      {formatMoney(invoice.amount)}
                    </td>
                    <td data-label="Action" className="action-col receipt-actions">
                      <button className="secondary-button invoice-view-button" type="button">
                        View
                      </button>
                      <button className="row-action" type="button" aria-label={`Actions for ${invoice.title}`}>
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>Showing 1 to 6 of 28 invoices</span>
            <div className="pagination" aria-label="Invoice pages">
              <button className="is-active" type="button">1</button>
              <button type="button">2</button>
              <button type="button">3</button>
            </div>
            <button className="secondary-button per-page-button" type="button">10 per page</button>
          </div>
        </section>

        <section className="progressive-panels" aria-label="Invoice tools">
          <ProgressivePanel
            id="tools"
            title="Email and payment tools"
            summary="Send, mark paid, deleted invoices"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Send invoice emails, mark sent invoices paid, void invoices that should no longer be collectible, and review
            deleted drafts without putting those workflows on the first screen.
          </ProgressivePanel>
        </section>
      </main>
    </AppShell>
  )
}

function InvoiceDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer invoice-drawer" role="dialog" aria-modal="true" aria-label="New invoice" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>New invoice</h2>
            <p>Create the title shown in the invoice list, then add client and line item details.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Invoice title
            <input placeholder="May consulting retainer" />
          </label>
          <label>
            Client name
            <input placeholder="Smith Renovations" />
          </label>
          <label>
            Client email
            <input placeholder="client@example.com" />
          </label>
          <div className="export-field-grid">
            <label>
              Issue date
              <input type="date" />
            </label>
            <label>
              Due date
              <input type="date" />
            </label>
          </div>
          <div className="export-field-grid">
            <label>
              Currency
              <select defaultValue="USD">
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
            <label>
              Tax rate
              <input type="number" min="0" max="100" step="0.001" placeholder="0%" />
            </label>
          </div>

          <section className="invoice-line-editor" aria-label="Invoice line items">
            <div className="invoice-line-header">
              <strong>Line items</strong>
              <button type="button">
                <Plus size={15} />
                Add item
              </button>
            </div>
            <div className="invoice-line-row">
              <input aria-label="Line item description" placeholder="Consulting services" />
              <input aria-label="Quantity" type="number" placeholder="1" />
              <input aria-label="Unit price" type="number" placeholder="1000.00" />
            </div>
          </section>

          <section className="invoice-total-preview" aria-label="Invoice total">
            <div><span>Subtotal</span><strong>$1,000.00</strong></div>
            <div><span>Tax</span><strong>$0.00</strong></div>
            <div><span>Total</span><strong>$1,000.00</strong></div>
          </section>

          <label>
            Notes
            <textarea placeholder="Payment terms, bank details, thank you message..." />
          </label>
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Save draft
          </button>
          <button className="primary-button" type="button">
            <Send size={18} />
            Save & send
          </button>
        </div>
      </aside>
    </div>
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

function StatusPill({ status }: { status: InvoiceStatus }) {
  const className =
    status === 'Paid'
      ? ''
      : status === 'Overdue'
        ? 'status-needs-details'
        : status === 'Sent'
          ? 'type-income'
          : status === 'Void'
            ? 'status-draft'
            : 'status-needs-review'

  return <span className={`status-pill ${className}`}>{status}</span>
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

function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export default Invoices
