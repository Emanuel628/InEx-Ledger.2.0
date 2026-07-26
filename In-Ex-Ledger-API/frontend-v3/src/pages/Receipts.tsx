import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
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
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import useSessionDismissed from '../hooks/useSessionDismissed'
import {
  attachReceipt,
  deleteReceipt,
  loadReceiptPageData,
  uploadReceipt,
  type ReceiptLinkState,
  type ReceiptRecord,
  type TransactionLinkOption,
} from '../lib/receiptsApi'

function Receipts(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [receiptRows, setReceiptRows] = useState<ReceiptRecord[]>([])
  const [transactionOptions, setTransactionOptions] = useState<TransactionLinkOption[]>([])
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [linkFilter, setLinkFilter] = useState<ReceiptLinkState | 'All'>('All')
  const [dataError, setDataError] = useState('')
  const [noticeVisible, dismissNotice] = useSessionDismissed('receipts-review')
  useOutsideActionMenu(Boolean(actionMenuId), () => setActionMenuId(null))
  const filteredReceipts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return receiptRows.filter((receipt) => {
      const matchesSearch = !normalizedSearch || [
        receipt.fileName,
        receipt.date,
        receipt.linkedTransaction,
        receipt.linkState,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesSearch && (linkFilter === 'All' || receipt.linkState === linkFilter)
    })
  }, [linkFilter, receiptRows, searchTerm])
  const linkedCount = receiptRows.filter((receipt) => receipt.linkState === 'Linked').length
  const unlinkedCount = receiptRows.filter((receipt) => receipt.linkState === 'Unlinked').length

  async function refreshReceipts() {
    setDataError('')
    try {
      const pageData = await loadReceiptPageData()
      setReceiptRows(pageData.receipts)
      setTransactionOptions(pageData.transactions)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load receipts.')
      setReceiptRows([])
      setTransactionOptions([])
    }
  }

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  useEffect(() => {
    void refreshReceipts()
  }, [])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search receipts, merchants, linked transactions"
      overlay={drawerOpen ? (
        <ReceiptUploadDrawer
          transactions={transactionOptions}
          onClose={() => setDrawerOpen(false)}
          onSave={(file, transactionId) => {
            void uploadReceipt(file, transactionId)
              .then(() => refreshReceipts())
              .then(() => setDrawerOpen(false))
              .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to upload receipt.'))
          }}
        />
      ) : null}
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

        {noticeVisible && unlinkedCount > 0 ? (
          <section className="top-alert" aria-label="Receipts need review">
            <AlertTriangle size={17} />
            <div>
              <strong>{unlinkedCount} {unlinkedCount === 1 ? 'receipt is' : 'receipts are'} unlinked</strong>
              <span>Link receipt files to transactions before export.</span>
            </div>
            <button type="button" onClick={() => setLinkFilter('Unlinked')}>Review</button>
            <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={17} />
            <div>
              <strong>{dataError}</strong>
              <span>Showing local preview receipts until live data is available.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss data warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="summary-strip" aria-label="Receipt summary">
          <SummaryItem label="Uploaded" value={String(receiptRows.length)} tone="net" icon={UploadCloud} />
          <SummaryItem label="Linked" value={String(linkedCount)} tone="income" icon={Link2} />
          <SummaryItem label="Unlinked" value={String(unlinkedCount)} tone="expense" icon={FileText} />
          <SummaryItem label="Viewable" value={String(receiptRows.filter((receipt) => receipt.isViewable).length)} tone="review" icon={Eye} />
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search receipts" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>

            <div className="filter-actions">
              <label className="secondary-button month-filter-button">
                <Link2 size={17} />
                <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as ReceiptLinkState | 'All')}>
                  <option value="All">Link: All</option>
                  <option value="Linked">Linked</option>
                  <option value="Unlinked">Unlinked</option>
                </select>
              </label>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Linked transaction</th>
                  <th>Link</th>
                  <th className="action-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td data-label="Receipt">
                      <div className="merchant-cell">
                        <span className={`merchant-icon merchant-${receipt.tone}`}>
                          <FileText size={15} />
                        </span>
                        <strong>{receipt.fileName}</strong>
                      </div>
                    </td>
                    <td data-label="Date">{receipt.date}</td>
                    <td data-label="Linked transaction">{receipt.linkedTransaction}</td>
                    <td data-label="Link">
                      <LinkPill state={receipt.linkState} />
                    </td>
                    <td data-label="Actions" className="action-col receipt-actions">
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`Preview ${receipt.fileName}`}
                        disabled={!receipt.isViewable}
                        onClick={() => window.open(receipt.url, '_blank', 'noopener,noreferrer')}
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`Actions for ${receipt.fileName}`}
                        aria-expanded={actionMenuId === receipt.id}
                        onClick={() => setActionMenuId((id) => (id === receipt.id ? null : receipt.id))}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {actionMenuId === receipt.id ? (
                        <div className="row-action-menu">
                          <button
                            type="button"
                            disabled={transactionOptions.length === 0}
                            onClick={() => {
                              const nextTransactionId = transactionOptions[0]?.id || null
                              void attachReceipt(receipt.id, nextTransactionId)
                                .then(() => refreshReceipts())
                                .then(() => setActionMenuId(null))
                                .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to link receipt.'))
                            }}
                          >
                            Link to latest
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void attachReceipt(receipt.id, null)
                                .then(() => refreshReceipts())
                                .then(() => setActionMenuId(null))
                                .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to unlink receipt.'))
                            }}
                          >
                            Unlink
                          </button>
                          <button
                            className="is-danger"
                            type="button"
                            onClick={() => {
                              void deleteReceipt(receipt.id)
                                .then(() => {
                                  setReceiptRows((rows) => rows.filter((row) => row.id !== receipt.id))
                                  setActionMenuId(null)
                                })
                                .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete receipt.'))
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filteredReceipts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-table-cell">No receipts match these filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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

function ReceiptUploadDrawer({
  transactions,
  onClose,
  onSave,
}: {
  transactions: TransactionLinkOption[]
  onClose: () => void
  onSave: (file: File, transactionId: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [error, setError] = useState('')

  function chooseFile(nextFile: File | undefined) {
    if (!nextFile) {
      return
    }
    setFile(nextFile)
    setError('')
  }

  function submitReceipt() {
    if (!file) {
      setError('Choose a receipt file.')
      return
    }
    onSave(file, transactionId)
  }

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
          <label
            className="receipt-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              chooseFile(event.dataTransfer.files[0])
            }}
          >
            <UploadCloud size={26} />
            <strong>Drag and drop receipt</strong>
            <span>{file ? file.name : 'PDF, PNG, JPG, WEBP, HEIC, or HEIF up to 10MB'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif" onChange={(event) => chooseFile(event.target.files?.[0])} />
          </label>
          <label>
            Link transaction
            <select value={transactionId} onChange={(event) => setTransactionId(event.target.value)}>
              <option value="">No transaction yet</option>
              {transactions.map((transaction) => (
                <option value={transaction.id} key={transaction.id}>{transaction.label}</option>
              ))}
            </select>
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={submitReceipt}>
            Save receipt
          </button>
        </div>
      </aside>
    </div>
  )
}

export default Receipts
