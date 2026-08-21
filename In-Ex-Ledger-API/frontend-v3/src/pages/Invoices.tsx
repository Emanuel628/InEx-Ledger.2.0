import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useBodyModalLock from '../hooks/useBodyModalLock'
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import { formatMoney, getActiveCurrency } from '../lib/money'
import {
  blankInvoiceDraft,
  deleteInvoice,
  draftFromInvoice,
  loadInvoices,
  saveInvoiceDraft,
  sendInvoice,
  updateInvoiceStatus,
  type InvoiceDraft,
  type InvoiceRecord,
  type InvoiceStatus,
} from '../lib/invoicesApi'

function Invoices(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<InvoiceRecord | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | InvoiceStatus>('All')
  const [monthFilter, setMonthFilter] = useState('All')
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  useOutsideActionMenu(Boolean(actionMenuId || filtersOpen), () => {
    setActionMenuId(null)
    setFiltersOpen(false)
  })
  useBodyModalLock(drawerOpen)

  async function refreshInvoices() {
    setLoadingData(true)
    setDataError('')
    try {
      setInvoices(await loadInvoices())
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load invoices.')
      setInvoices([])
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshInvoices()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [monthFilter, pageSize, searchTerm, statusFilter])

  const filteredInvoices = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === 'All' || invoice.status === statusFilter
      const matchesMonth = monthFilter === 'All' || invoice.issueDate.startsWith(monthFilter)
      const matchesSearch = !normalizedSearch || [
        invoice.title,
        invoice.invoiceNumber,
        invoice.client,
        invoice.clientEmail,
        invoice.status,
        String(invoice.amount),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesStatus && matchesMonth && matchesSearch
    })
  }, [invoices, monthFilter, searchTerm, statusFilter])

  const summary = useMemo(() => {
    const needsAction = invoices.filter((invoice) => invoice.status === 'Draft' || invoice.status === 'Overdue').length
    const outstanding = invoices
      .filter((invoice) => invoice.status === 'Sent' || invoice.status === 'Overdue')
      .reduce((sum, invoice) => sum + invoice.amount, 0)
    const paid = invoices
      .filter((invoice) => invoice.status === 'Paid' && invoice.issueDate.startsWith(new Date().toISOString().slice(0, 7)))
      .reduce((sum, invoice) => sum + invoice.amount, 0)
    const drafts = invoices.filter((invoice) => invoice.status === 'Draft').length

    return { needsAction, outstanding, paid, drafts }
  }, [invoices])

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const visibleInvoices = filteredInvoices.slice(pageStart, pageStart + pageSize)
  const paginationPages = getPaginationPages(safeCurrentPage, totalPages)
  const monthOptions = uniqueValues(invoices.map((invoice) => invoice.issueDate.slice(0, 7)).filter(Boolean))
    .sort((first, second) => second.localeCompare(first))

  function openDrawer(invoice: InvoiceRecord | null = null) {
    setEditingInvoice(invoice)
    setDrawerOpen(true)
    setActionMenuId(null)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingInvoice(null)
  }

  function handleSave(draft: InvoiceDraft, sendAfterSave: boolean, attachments: File[]) {
    return saveInvoiceDraft(draft, editingInvoice, sendAfterSave, attachments)
      .then(() => {
        closeDrawer()
        return refreshInvoices()
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to save invoice.'))
  }

  function handleStatus(invoice: InvoiceRecord, status: 'draft' | 'sent' | 'paid' | 'void') {
    updateInvoiceStatus(invoice.id, status)
      .then(refreshInvoices)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update invoice.'))
      .finally(() => setActionMenuId(null))
  }

  function handleSend(invoice: InvoiceRecord) {
    sendInvoice(invoice.id, invoice.clientEmail)
      .then(refreshInvoices)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to send invoice.'))
      .finally(() => setActionMenuId(null))
  }

  function handleDelete(invoice: InvoiceRecord) {
    if (!window.confirm(`Delete ${invoice.title}?`)) {
      return
    }
    deleteInvoice(invoice.id)
      .then(refreshInvoices)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete invoice.'))
      .finally(() => setActionMenuId(null))
  }

  return (
    <AppShell
      {...props}
      overlay={drawerOpen ? <InvoiceDrawer invoice={editingInvoice} currency={getActiveCurrency()} onClose={closeDrawer} onSave={handleSave} /> : null}
    >
      <main className="transactions-page invoices-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Receivables</p>
            <h1>Invoices</h1>
            <p>Send invoices, track payment, and keep client follow-up clear.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => openDrawer()}>
            <Plus size={18} />
            New invoice
          </button>
        </section>

        <section className="summary-strip" aria-label="Invoice summary">
          <SummaryItem label="Needs action" value={String(summary.needsAction)} tone="review" icon={AlertTriangle} />
          <SummaryItem label="Outstanding" value={formatMoney(summary.outstanding)} tone="net" icon={FileText} />
          <SummaryItem label="Paid this month" value={formatMoney(summary.paid)} tone="income" icon={CheckCircle2} />
          <SummaryItem label="Drafts" value={String(summary.drafts)} tone="expense" icon={Mail} />
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Review the invoice details and try again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss invoice warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="table-panel invoices-list-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search invoices" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>

            <div className="filter-actions">
              <div className="filter-popover-wrap">
                <button className="icon-button filter-icon-button" type="button" aria-label="Invoice filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
                  <SlidersHorizontal size={18} />
                </button>
                {filtersOpen ? (
                  <div className="filter-popover" role="dialog" aria-label="Invoice filters">
                    <label>
                      Status
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | InvoiceStatus)}>
                        <option value="All">All statuses</option>
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Paid">Paid</option>
                        <option value="Overdue">Overdue</option>
                        <option value="Void">Void</option>
                      </select>
                    </label>
                    <label>
                      Date range
                      <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                        <option value="All">All dates</option>
                        {monthOptions.map((month) => (
                          <option key={month} value={month}>{formatMonth(month)}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
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
                {visibleInvoices.length ? visibleInvoices.map((invoice) => (
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
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td data-label="Action" className="action-col receipt-actions">
                      <div className="row-menu-wrap">
                        <button
                          className="row-action"
                          type="button"
                          aria-expanded={actionMenuId === invoice.id}
                          aria-label={`Actions for ${invoice.title}`}
                          onClick={() => setActionMenuId(actionMenuId === invoice.id ? null : invoice.id)}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {actionMenuId === invoice.id ? (
                          <div className="row-action-menu invoice-action-menu" role="menu">
                            <button type="button" onClick={() => openDrawer(invoice)}>View / edit</button>
                            <button type="button" onClick={() => handleSend(invoice)}>Send invoice</button>
                            <button type="button" onClick={() => handleStatus(invoice, 'paid')}>Mark paid</button>
                            <button type="button" onClick={() => handleStatus(invoice, 'void')}>Void invoice</button>
                            <button className="is-danger" type="button" onClick={() => handleDelete(invoice)}>Delete invoice</button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-table-state">{loadingData ? 'Loading invoices...' : 'No invoices found.'}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>
              Showing {filteredInvoices.length ? pageStart + 1 : 0} to {Math.min(pageStart + visibleInvoices.length, filteredInvoices.length)} of {filteredInvoices.length} invoices
            </span>
            <div className="pagination" aria-label="Invoice pages">
              <button type="button" aria-label="Previous page" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}>
                <ChevronLeft size={16} />
              </button>
              {paginationPages.map((page, index) => (
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`}>...</span>
                ) : (
                  <button
                    className={page === safeCurrentPage ? 'is-active' : ''}
                    type="button"
                    key={page}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                )
              ))}
              <button type="button" aria-label="Next page" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <label className="secondary-button per-page-button">
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
              <ChevronDown size={16} />
            </label>
          </div>
        </section>
      </main>
    </AppShell>
  )
}

const MAX_INVOICE_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_INVOICE_ATTACHMENTS = 5

function InvoiceDrawer({
  invoice,
  currency,
  onClose,
  onSave,
}: {
  invoice: InvoiceRecord | null
  currency: string
  onClose: () => void
  onSave: (draft: InvoiceDraft, sendAfterSave: boolean, attachments: File[]) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<InvoiceDraft>(() => invoice ? draftFromInvoice(invoice) : blankInvoiceDraft(currency))
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const subtotal = Number(draft.quantity || 0) * Number(draft.unitPrice || 0)
  const tax = subtotal * (Number(draft.taxRatePercent || 0) / 100)
  const total = subtotal + tax

  useEffect(() => {
    setDraft(invoice ? draftFromInvoice(invoice) : blankInvoiceDraft(currency))
    setError('')
    setAttachments([])
    setAttachmentError('')
  }, [currency, invoice])

  function updateDraft(field: keyof InvoiceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (attachments.length + files.length > MAX_INVOICE_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_INVOICE_ATTACHMENTS} files.`)
      return
    }
    if (files.some((file) => file.size > MAX_INVOICE_ATTACHMENT_BYTES)) {
      setAttachmentError('Each attachment must be 10 MB or smaller.')
      return
    }
    setAttachmentError('')
    setAttachments((current) => [...current, ...files])
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  function save(sendAfterSave: boolean) {
    setError('')
    onSave(draft, sendAfterSave, attachments)
      .catch((saveError) => setError(saveError instanceof Error ? saveError.message : 'Unable to save invoice.'))
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer invoice-drawer" role="dialog" aria-modal="true" aria-label={invoice ? 'Edit invoice' : 'New invoice'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{invoice ? 'Edit invoice' : 'New invoice'}</h2>
            <p>Create the title shown in the invoice list, then add client and line item details.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => {
          event.preventDefault()
          save(false)
        }}>
          <label>
            Invoice title
            <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="May consulting retainer" />
          </label>
          <label>
            Client name
            <input value={draft.clientName} onChange={(event) => updateDraft('clientName', event.target.value)} placeholder="Smith Renovations" />
          </label>
          <label>
            Client email
            <input
              type="email"
              name="invoice-client-email"
              autoComplete="email"
              value={draft.clientEmail}
              onChange={(event) => updateDraft('clientEmail', event.target.value)}
              placeholder="client@example.com"
            />
          </label>
          <label>
            CC emails
            <input
              type="text"
              name="invoice-cc-emails"
              autoComplete="off"
              value={draft.ccEmails}
              onChange={(event) => updateDraft('ccEmails', event.target.value)}
              placeholder="name@example.com, second@example.com"
            />
          </label>
          <div className="export-field-grid">
            <label>
              Issue date
              <input type="date" value={draft.issueDate} onChange={(event) => updateDraft('issueDate', event.target.value)} />
            </label>
            <label>
              Due date
              <input type="date" value={draft.dueDate} onChange={(event) => updateDraft('dueDate', event.target.value)} />
            </label>
          </div>
          <div className="export-field-grid">
            <label>
              Currency
              <select value={draft.currency} onChange={(event) => updateDraft('currency', event.target.value)}>
                <option value="USD">USD</option>
                <option value="CAD">CAD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AUD">AUD</option>
              </select>
            </label>
            <label>
              Tax rate
              <input type="number" min="0" max="100" step="0.001" value={draft.taxRatePercent} onChange={(event) => updateDraft('taxRatePercent', event.target.value)} placeholder="0" />
            </label>
          </div>

          <section className="invoice-line-editor" aria-label="Invoice line item">
            <div className="invoice-line-header">
              <strong>Line item</strong>
            </div>
            <div className="invoice-line-row">
              <input aria-label="Line item description" value={draft.lineItemDescription} onChange={(event) => updateDraft('lineItemDescription', event.target.value)} placeholder="Consulting services" />
              <input aria-label="Quantity" type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(event) => updateDraft('quantity', event.target.value)} placeholder="1" />
              <input aria-label="Unit price" type="number" min="0" step="0.01" value={draft.unitPrice} onChange={(event) => updateDraft('unitPrice', event.target.value)} placeholder="1000.00" />
            </div>
          </section>

          <section className="invoice-total-preview" aria-label="Invoice total">
            <div><span>Subtotal</span><strong>{formatMoney(subtotal, draft.currency)}</strong></div>
            <div><span>Tax</span><strong>{formatMoney(tax, draft.currency)}</strong></div>
            <div><span>Total</span><strong>{formatMoney(total, draft.currency)}</strong></div>
          </section>

          <label>
            Notes
            <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Payment terms, bank details, thank you message..." />
          </label>

          {attachments.length ? (
            <div className="message-reply-attachment-list">
              {attachments.map((file, index) => (
                <div className="message-reply-attachment" key={`${file.name}-${index}`}>
                  <Paperclip size={15} />
                  <span>{file.name}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachment(index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {attachmentError ? <p className="drawer-error" role="alert">{attachmentError}</p> : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="visually-hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.csv,.doc,.docx,.xls,.xlsx"
            onChange={handleAttachmentChange}
          />

          {error ? <p className="drawer-error" role="alert">{error}</p> : null}

          <div className="drawer-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={attachments.length >= MAX_INVOICE_ATTACHMENTS}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={17} />
              {attachments.length ? 'Add another attachment' : 'Attach'}
            </button>
            <button className="secondary-button" type="submit">
              Save draft
            </button>
            <button className="primary-button" type="button" onClick={() => save(true)}>
              <Send size={18} />
              Save & send
            </button>
          </div>
        </form>
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values))
}

function formatMonth(value: string) {
  const parsed = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function getPaginationPages(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  return sortedPages.flatMap((page, index) => {
    const previousPage = sortedPages[index - 1]
    if (previousPage && page - previousPage > 1) {
      return ['ellipsis' as const, page]
    }
    return [page]
  })
}

export default Invoices
