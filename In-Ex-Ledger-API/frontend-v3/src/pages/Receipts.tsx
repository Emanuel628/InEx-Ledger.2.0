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
  searchReceiptTransactionOptions,
  uploadReceipt,
  type ReceiptLinkState,
  type ReceiptRecord,
  type TransactionLinkOption,
} from '../lib/receiptsApi'

function Receipts(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [receiptRows, setReceiptRows] = useState<ReceiptRecord[]>([])
  const [transactionOptions, setTransactionOptions] = useState<TransactionLinkOption[]>([])
  const [linkingReceipt, setLinkingReceipt] = useState<ReceiptRecord | null>(null)
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
    document.body.classList.toggle('modal-is-open', drawerOpen || Boolean(linkingReceipt))

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen, linkingReceipt])

  useEffect(() => {
    void refreshReceipts()
  }, [])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search receipts, merchants, linked transactions"
      overlay={
        <>
          {drawerOpen ? (
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
          {linkingReceipt ? (
            <ReceiptLinkModal
              receipt={linkingReceipt}
              transactions={transactionOptions}
              onSearchTransactions={searchReceiptTransactionOptions}
              onClose={() => setLinkingReceipt(null)}
              onLink={(transactionId) => {
                void attachReceipt(linkingReceipt.id, transactionId)
                  .then(() => refreshReceipts())
                  .then(() => {
                    setLinkingReceipt(null)
                    setActionMenuId(null)
                  })
                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to link receipt.'))
              }}
            />
          ) : null}
        </>
      }
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
                            onClick={() => {
                              setLinkingReceipt(receipt)
                            }}
                          >
                            Link transaction
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

function ReceiptLinkModal({
  receipt,
  transactions,
  onSearchTransactions,
  onClose,
  onLink,
}: {
  receipt: ReceiptRecord
  transactions: TransactionLinkOption[]
  onSearchTransactions: (search: string) => Promise<TransactionLinkOption[]>
  onClose: () => void
  onLink: (transactionId: string) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [visibleTransactions, setVisibleTransactions] = useState(transactions)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    let canceled = false
    onSearchTransactions(searchTerm)
      .then((results) => {
        if (!canceled) {
          setVisibleTransactions(results)
          setSearchError('')
        }
      })
      .catch((error) => {
        if (!canceled) {
          setVisibleTransactions([])
          setSearchError(error instanceof Error ? error.message : 'Unable to search transactions.')
        }
      })
    return () => {
      canceled = true
    }
  }, [onSearchTransactions, searchTerm])

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal receipt-link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiptLinkTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="receiptLinkTitle">Link receipt</h2>
            <p>{receipt.fileName}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close receipt link" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <label className="field search-field">
          <Search size={18} />
          <input type="search" placeholder="Search transactions" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
        </label>

        <div className="receipt-link-list">
          {visibleTransactions.map((transaction) => (
            <button className="receipt-link-option" type="button" key={transaction.id} onClick={() => onLink(transaction.id)}>
              <span>{transaction.label}</span>
            </button>
          ))}
          {visibleTransactions.length === 0 ? (
            <p className="progressive-panel-note">{searchError || 'No transactions match this search.'}</p>
          ) : null}
        </div>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
        </div>
      </section>
    </div>
  )
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
