import { useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coffee,
  Filter,
  Fuel,
  Info,
  MoreHorizontal,
  Package,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { getPaginationPages } from '../lib/pagination'
import BankCsvHelpGuide from '../components/BankCsvHelp'
import LoadingDots from '../components/LoadingDots'
import RecurringTemplatesWorkflow from '../components/transactions/RecurringTemplatesWorkflow'
import ReviewQueuePanel from '../components/transactions/ReviewQueuePanel'
import useBodyModalLock from '../hooks/useBodyModalLock'
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import useSessionDismissed from '../hooks/useSessionDismissed'
import useTransactionsPageData from '../hooks/useTransactionsPageData'
import {
  deleteTransaction,
  deleteRecurringTemplate,
  importTransactionsCsv,
  runRecurringTemplate,
  saveRecurringTemplateDraft,
  saveTransactionDraft,
  undoDeletedTransaction,
  updateRecurringTemplateStatus,
  updateTransactionReceiptStatus,
  type AccountOption,
  type CategoryOption,
  type Transaction,
  type CsvImportResult,
  type CsvSkippedRow,
  type RecurringTemplate,
  type TransactionDraft,
  type TransactionStatus,
} from '../lib/transactionsApi'
import { formatMoney } from '../lib/money'
import { uploadReceipt } from '../lib/receiptsApi'
import type { AccountingLock } from '../lib/settingsApi'
import { hasReviewFor, normalizeReviewLabels, reviewLabelsFor, reviewText } from '../lib/transactionReview'

function Transactions(props: PageProps) {
  const businessRegion = props.authUser?.business?.type === 'CA' ? 'CA' : 'US'
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [recoveryRow, setRecoveryRow] = useState<{ row: CsvSkippedRow; accountName: string } | null>(null)
  const [recoveredSkipRowKeys, setRecoveredSkipRowKeys] = useState<Set<number>>(new Set())
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [receiptTransaction, setReceiptTransaction] = useState<Transaction | null>(null)
  const [receiptStatusTransaction, setReceiptStatusTransaction] = useState<Transaction | null>(null)
  const [recurringEditorTemplate, setRecurringEditorTemplate] = useState<RecurringTemplate | null | 'new'>(null)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [noticeVisible, dismissNotice] = useSessionDismissed('transactions-review')
  useOutsideActionMenu(Boolean(actionMenuId), () => setActionMenuId(null))
  const {
    transactionRows,
    setTransactionRows,
    transactionTotal,
    transactionSummary,
    accountOptions,
    categoryOptions,
    taxProfile,
    taxSetAside,
    accountingLock,
    reviewQueue,
    recurringTemplates,
    setRecurringTemplates,
    loadingData,
    dataError,
    setDataError,
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    accountFilter,
    setAccountFilter,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    pageSize,
    currentPage,
    setCurrentPage,
    undoCount,
    setUndoCount,
    undoMessage,
    setUndoMessage,
    refreshPageData,
    updatePageSize,
    updateFilter,
  } = useTransactionsPageData()

  const filteredRows = transactionRows
  const totalRows = transactionTotal || transactionSummary.transactionCount
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const visibleRows = filteredRows
  const paginationPages = getPaginationPages(safeCurrentPage, totalPages)
  const categories = categoryOptions
  const accounts = accountOptions
  const incomeTotal = transactionSummary.incomeTotal
  const expenseTotal = transactionSummary.expenseTotal
  const netTotal = incomeTotal - expenseTotal
  const estimatedTax = taxSetAside === null ? null : formatMoney(taxSetAside)
  const reviewCount = reviewQueue.summary?.total ?? transactionRows.filter((row) => row.status !== 'Cleared' || row.receipt === 'Missing').length
  useBodyModalLock(
    drawerOpen
    || Boolean(selectedTransaction)
    || Boolean(receiptTransaction)
    || Boolean(receiptStatusTransaction)
    || Boolean(recurringEditorTemplate)
    || filtersOpen
    || csvImportOpen,
  )

  async function restoreDeletedTransaction() {
    setDataError('')
    try {
      const result = await undoDeletedTransaction()
      if (result.transaction) {
        setTransactionRows((rows) => [result.transaction as Transaction, ...rows])
      } else {
        await refreshPageData()
      }
      setUndoCount(result.remainingUndoCount)
      setUndoMessage(result.remainingUndoCount > 0 ? `${result.remainingUndoCount} undo ${result.remainingUndoCount === 1 ? 'is' : 'are'} still available.` : 'Transaction restored.')
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to restore transaction.')
    }
  }

  return (
    <AppShell
      {...props}
      overlay={
        <>
          {csvImportOpen ? (
            <CsvImportModal
              accounts={accountOptions}
              region={businessRegion}
              onClose={() => setCsvImportOpen(false)}
              onImport={(input) => importTransactionsCsv(input)}
              onImported={async (result) => {
                await refreshPageData()
                return result
              }}
              recoveredRowKeys={recoveredSkipRowKeys}
              onRecoverRow={(row, accountId) => {
                const accountName = accountOptions.find((account) => account.id === accountId)?.name || ''
                setRecoveryRow({ row, accountName })
                setEditingTransaction(null)
                setDrawerOpen(true)
              }}
            />
          ) : null}
          {drawerOpen ? (
            <TransactionDrawer
              onClose={() => {
                setDrawerOpen(false)
                setEditingTransaction(null)
                setRecoveryRow(null)
              }}
              onSave={(draft) => {
                void saveTransactionDraft(draft, editingTransaction, accountOptions, categoryOptions)
                  .then((savedTransaction) => {
                    setTransactionRows((rows) => (
                      editingTransaction
                        ? rows.map((row) => (row.id === savedTransaction.id ? savedTransaction : row))
                        : [savedTransaction, ...rows]
                    ))
                    if (recoveryRow) {
                      setRecoveredSkipRowKeys((keys) => new Set(keys).add(recoveryRow.row.row))
                    }
                    setEditingTransaction(null)
                    setRecoveryRow(null)
                    setDrawerOpen(false)
                  })
                  .catch((error) => {
                    setDataError(error instanceof Error ? error.message : 'Unable to save transaction.')
                  })
              }}
              onSaveAndAttachReceipt={(draft) => (
                saveTransactionDraft(draft, editingTransaction, accountOptions, categoryOptions)
                  .then((savedTransaction) => {
                    setTransactionRows((rows) => (
                      editingTransaction
                        ? rows.map((row) => (row.id === savedTransaction.id ? savedTransaction : row))
                        : [savedTransaction, ...rows]
                    ))
                    if (recoveryRow) {
                      setRecoveredSkipRowKeys((keys) => new Set(keys).add(recoveryRow.row.row))
                    }
                    setEditingTransaction(null)
                    setRecoveryRow(null)
                    setDrawerOpen(false)
                    setReceiptTransaction(savedTransaction)
                  })
                  .catch((error) => {
                    setDataError(error instanceof Error ? error.message : 'Unable to save transaction.')
                    throw error
                  })
              )}
              transaction={editingTransaction}
              initialDraft={recoveryRow ? skippedRowToDraftSeed(recoveryRow.row, recoveryRow.accountName) : undefined}
              accounts={accountOptions}
              categories={categoryOptions}
              onAttachReceipt={(transaction) => setReceiptTransaction(transaction)}
              onManageCategories={() => {
                setDrawerOpen(false)
                setEditingTransaction(null)
                setRecoveryRow(null)
                props.onNavigate('Categories')
              }}
            />
          ) : null}
          {selectedTransaction ? (
            <TransactionDetailsModal
              transaction={selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
              onUpdate={(updated) => {
                if (isTransactionLocked(updated, accountingLock)) {
                  setDataError(`This transaction is locked through ${formatIsoDate(accountingLock?.lockedThroughDate || '')}.`)
                  return
                }
                void saveTransactionDraft(transactionToDraft(updated), updated, accountOptions, categoryOptions)
                  .then((savedTransaction) => {
                    setTransactionRows((rows) => rows.map((row) => (row.id === savedTransaction.id ? savedTransaction : row)))
                    setSelectedTransaction(savedTransaction)
                  })
                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update transaction.'))
              }}
              onAttachReceipt={() => {
                if (isTransactionLocked(selectedTransaction, accountingLock)) {
                  setDataError(`This transaction is locked through ${formatIsoDate(accountingLock?.lockedThroughDate || '')}.`)
                  return
                }
                setReceiptTransaction(selectedTransaction)
              }}
              onManageReceiptStatus={() => {
                if (isTransactionLocked(selectedTransaction, accountingLock)) {
                  setDataError(`This transaction is locked through ${formatIsoDate(accountingLock?.lockedThroughDate || '')}.`)
                  return
                }
                setReceiptStatusTransaction(selectedTransaction)
              }}
              onEdit={() => {
                if (isTransactionLocked(selectedTransaction, accountingLock)) {
                  setDataError(`This transaction is locked through ${formatIsoDate(accountingLock?.lockedThroughDate || '')}.`)
                  return
                }
                setEditingTransaction(selectedTransaction)
                setSelectedTransaction(null)
                setDrawerOpen(true)
              }}
              onManageCategories={() => {
                setSelectedTransaction(null)
                props.onNavigate('Categories')
              }}
              onDelete={() => {
                if (isTransactionLocked(selectedTransaction, accountingLock)) {
                  setDataError(`This transaction is locked through ${formatIsoDate(accountingLock?.lockedThroughDate || '')}.`)
                  return
                }
                void deleteTransaction(selectedTransaction.id)
                  .then(() => {
                    setTransactionRows((rows) => rows.filter((row) => row.id !== selectedTransaction.id))
                    setUndoCount((count) => Math.max(1, count + 1))
                    setUndoMessage('Transaction deleted.')
                    setSelectedTransaction(null)
                  })
                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete transaction.'))
              }}
              isLocked={isTransactionLocked(selectedTransaction, accountingLock)}
              lockedThroughDate={accountingLock?.lockedThroughDate || null}
            />
          ) : null}
          {receiptTransaction ? (
            <ReceiptUploadModal
              transaction={receiptTransaction}
              onClose={() => setReceiptTransaction(null)}
              onUploaded={async () => {
                await refreshPageData()
                setReceiptTransaction(null)
                setSelectedTransaction(null)
              }}
            />
          ) : null}
          {receiptStatusTransaction ? (
            <ReceiptStatusModal
              transaction={receiptStatusTransaction}
              onClose={() => setReceiptStatusTransaction(null)}
              onUpdated={(updated) => {
                setTransactionRows((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
                setReceiptStatusTransaction(null)
                setSelectedTransaction((current) => (current && current.id === updated.id ? updated : current))
              }}
            />
          ) : null}
          {filtersOpen ? (
            <TransactionFiltersModal
              categories={categories}
              accounts={accounts}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              accountFilter={accountFilter}
              startDateFilter={startDateFilter}
              endDateFilter={endDateFilter}
              onCategoryChange={(value) => updateFilter(setCategoryFilter, value)}
              onStatusChange={(value) => updateFilter(setStatusFilter, value)}
              onAccountChange={(value) => updateFilter(setAccountFilter, value)}
              onStartDateChange={(value) => updateFilter(setStartDateFilter, value)}
              onEndDateChange={(value) => updateFilter(setEndDateFilter, value)}
              onClear={() => {
                setCurrentPage(1)
                setSearchTerm('')
                setCategoryFilter('All')
                setStatusFilter('All')
                setAccountFilter('All')
                setStartDateFilter('')
                setEndDateFilter('')
              }}
              onClose={() => setFiltersOpen(false)}
            />
          ) : null}
        </>
      }
    >
        <main className="transactions-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">Ledger</p>
              <h1>Transactions</h1>
              <p>Review the money coming in and going out. Everything else stays tucked away until you need it.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingTransaction(null)
                setDrawerOpen(true)
              }}
            >
              <Plus size={18} />
              Add transaction
            </button>
          </section>

          {noticeVisible && reviewCount > 0 ? (
            <section className="top-alert" aria-label="Transactions need attention">
              <AlertTriangle size={17} />
              <div>
                <strong>{reviewCount} transactions need attention</strong>
                <span>Missing receipts and business-use details before export.</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFiltersOpen(true)
                  setStatusFilter('Needs attention')
                }}
              >
                Review
              </button>
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
                <span>{loadingData ? 'Loading current records.' : 'The table will stay empty until live data is available.'}</span>
              </div>
              <button className="top-alert-close" type="button" aria-label="Dismiss data warning" onClick={() => setDataError('')}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          <section className="summary-with-tax-info" aria-label="Transaction summary">
            <div className="summary-strip">
              <SummaryItem label="Estimated tax" value={estimatedTax ?? '—'} tone="tax" icon={CircleDollarSign} />
              <SummaryItem label="Net" value={formatMoney(netTotal)} tone="net" icon={CircleDollarSign} />
              <SummaryItem label="Income" value={formatMoney(incomeTotal)} tone="income" icon={TrendingUp} />
              <SummaryItem label="Expenses" value={formatMoney(expenseTotal)} tone="expense" icon={TrendingDown} />
            </div>
            <div className="tax-info-hover">
              <button className="tax-info-trigger" type="button" aria-label="Estimated tax details">
                <Info size={16} />
              </button>
              <div className="tax-info-popover tax-profile-note-popover" role="tooltip">
                <strong>{taxProfile?.label || 'Tax set-aside'}</strong>
                <span>Backend-calculated self-employment tax estimate for the current tax year -- the same figure shown on Analytics. Draft estimate for review before export.</span>
              </div>
            </div>
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Search transactions"
                  value={searchTerm}
                  onChange={(event) => updateFilter(setSearchTerm, event.target.value)}
                />
              </label>

              <div className="filter-actions">
                {undoCount > 0 ? (
                  <button className="secondary-button undo-delete-button" type="button" onClick={() => void restoreDeletedTransaction()}>
                    Undo delete
                  </button>
                ) : null}
                <button className="secondary-button" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
                  <Filter size={17} />
                  More filters
                </button>
                <button className="secondary-button" type="button" onClick={() => setCsvImportOpen(true)}>
                  <Upload size={17} />
                  Import CSV
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Receipt</th>
                    <th>Status</th>
                    <th className="align-right">Amount</th>
                    <th className="action-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((transaction) => {
                    const rowLocked = isTransactionLocked(transaction, accountingLock)
                    return (
                    <tr className={rowLocked ? 'is-locked-period' : ''} key={transaction.id}>
                      <td data-label="Date">{transaction.date}</td>
                      <td data-label="Description">
                        <div className="merchant-cell">
                          <span className={`merchant-icon merchant-${transaction.merchantTone}`}>
                            {getMerchantInitial(transaction.description)}
                          </span>
                          <strong>{transaction.description}</strong>
                        </div>
                      </td>
                      <td data-label="Category">
                        <div className="category-cell">
                          <CategoryIcon category={transaction.category} />
                          <span>{transaction.category}</span>
                        </div>
                      </td>
                      <td data-label="Account">{transaction.account}</td>
                      <td data-label="Receipt">{transaction.receipt}</td>
                      <td data-label="Status">
                        <StatusPill status={transaction.status} />
                      </td>
                      <td data-label="Amount" className={`align-right amount ${transaction.amount >= 0 ? 'is-positive' : 'is-negative'}`}>
                        {formatMoney(transaction.amount)}
                      </td>
                      <td data-label="Actions" className="action-col">
                        <button
                          className="row-action"
                          type="button"
                          aria-label={`Actions for ${transaction.description}`}
                          aria-expanded={actionMenuId === transaction.id}
                          onClick={() => setActionMenuId((id) => (id === transaction.id ? null : transaction.id))}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {actionMenuId === transaction.id ? (
                          <div className="row-action-menu">
                            {rowLocked ? <p className="row-action-menu-note">Locked through {formatIsoDate(accountingLock?.lockedThroughDate || '')}</p> : null}
                            <button
                              type="button"
                              disabled={rowLocked}
                              onClick={() => {
                                setEditingTransaction(transaction)
                                setDrawerOpen(true)
                                setActionMenuId(null)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTransaction(transaction)
                                setActionMenuId(null)
                              }}
                            >
                              View details
                            </button>
                            <button
                              type="button"
                              disabled={rowLocked}
                              onClick={() => {
                                void saveTransactionDraft(
                                  transactionToDraft(transaction),
                                  { ...transaction, cleared: true, status: 'Cleared' },
                                  accountOptions,
                                  categoryOptions,
                                )
                                  .then((updated) => {
                                    setTransactionRows((rows) => rows.map((row) => (row.id === updated.id ? updated : row)))
                                    setActionMenuId(null)
                                  })
                                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update transaction.'))
                              }}
                            >
                              Mark cleared
                            </button>
                            <button
                              type="button"
                              disabled={rowLocked}
                              onClick={() => {
                                setReceiptTransaction(transaction)
                                setActionMenuId(null)
                              }}
                            >
                              Attach receipt
                            </button>
                            <button
                              className="is-danger"
                              type="button"
                              disabled={rowLocked}
                              onClick={() => {
                                void deleteTransaction(transaction.id)
                                  .then(() => {
                                    setTransactionRows((rows) => rows.filter((row) => row.id !== transaction.id))
                                    setUndoCount((count) => Math.max(1, count + 1))
                                    setUndoMessage('Transaction deleted.')
                                    setActionMenuId(null)
                                  })
                                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete transaction.'))
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    )
                  })}
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">No transactions match these filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <span>
                Showing {totalRows ? pageStart + 1 : 0} to {Math.min(pageStart + visibleRows.length, totalRows)} of {totalRows} transactions
                {undoMessage ? ` - ${undoMessage}` : ''}
              </span>
              <div className="pagination" aria-label="Pagination">
                <button type="button" aria-label="Previous page" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
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
                <button type="button" aria-label="Next page" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <label className="secondary-button per-page-button">
                <select value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value))}>
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>
                <ChevronDown size={16} />
              </label>
            </div>
          </section>

          <section className="progressive-panels" aria-label="Additional transaction tools">
            <ProgressivePanel
              id="review"
              title="Review queue"
              summary={`${reviewCount} ${reviewCount === 1 ? 'item' : 'items'}`}
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              <ReviewQueuePanel
                reviewQueue={reviewQueue}
                onOpenTransaction={(transactionId) => {
                  const transaction = transactionRows.find((row) => row.id === transactionId)
                  if (transaction) setSelectedTransaction(transaction)
                }}
                onAttachReceipt={(transactionId) => {
                  const transaction = transactionRows.find((row) => row.id === transactionId)
                  if (transaction) setReceiptTransaction(transaction)
                }}
                onManageCategories={() => props.onNavigate('Categories')}
              />
            </ProgressivePanel>
            <ProgressivePanel
              id="recurring"
              title="Recurring templates"
              summary={`${recurringTemplates.filter((template) => template.active).length} active`}
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              <RecurringTemplatesWorkflow
                templates={recurringTemplates}
                accounts={accountOptions}
                categories={categoryOptions}
                editingTemplate={recurringEditorTemplate}
                onAdd={() => setRecurringEditorTemplate('new')}
                onEdit={(template) => setRecurringEditorTemplate(template)}
                onCloseEditor={() => setRecurringEditorTemplate(null)}
                onSave={(draft, template) => saveRecurringTemplateDraft(draft, template)}
                onSaved={(saved) => {
                  setRecurringTemplates((templates) => (
                    recurringEditorTemplate === 'new'
                      ? [saved, ...templates]
                      : templates.map((template) => (template.id === saved.id ? saved : template))
                  ))
                  setRecurringEditorTemplate(null)
                }}
                onRun={(template) => {
                  void runRecurringTemplate(template.id)
                    .then(async () => {
                      await refreshPageData()
                    })
                    .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to post recurring transaction.'))
                }}
                onToggle={(template) => {
                  void updateRecurringTemplateStatus(template.id, !template.active)
                    .then((updated) => setRecurringTemplates((templates) => templates.map((item) => (item.id === updated.id ? updated : item))))
                    .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update recurring template.'))
                }}
                onDelete={(template) => {
                  void deleteRecurringTemplate(template.id)
                    .then(() => setRecurringTemplates((templates) => templates.filter((item) => item.id !== template.id)))
                    .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete recurring template.'))
                }}
              />
            </ProgressivePanel>
          </section>
        </main>
    </AppShell>
  )
}

function CsvImportModal({
  accounts,
  region,
  onClose,
  onImport,
  onImported,
  recoveredRowKeys,
  onRecoverRow,
}: {
  accounts: AccountOption[]
  region: 'US' | 'CA'
  onClose: () => void
  onImport: (input: { file: File; accountId: string; startDate?: string; endDate?: string }) => Promise<CsvImportResult>
  onImported: (result: CsvImportResult) => Promise<CsvImportResult>
  recoveredRowKeys: Set<number>
  onRecoverRow: (row: CsvSkippedRow, accountId: string) => void
}) {
  const [accountId, setAccountId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [showBankHelp, setShowBankHelp] = useState(false)
  const [skippedSectionOpen, setSkippedSectionOpen] = useState(false)

  async function startImport() {
    setError('')
    if (!accountId) {
      setError('Please select a destination account.')
      return
    }
    if (!file) {
      setError('Please select a CSV file.')
      return
    }
    if (startDate && endDate && startDate > endDate) {
      setError('Start date must be on or before end date.')
      return
    }

    setImporting(true)
    try {
      const nextResult = await onImport({ file, accountId, startDate, endDate })
      setResult(await onImported(nextResult))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal csv-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csvImportTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="csvImportTitle">Import CSV</h2>
            <p>Choose where the imported rows belong before adding them to the ledger.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close CSV import" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="csv-import-result">
            <div className="csv-import-success">
              <div className="csv-stat"><span className="csv-stat-num">{result.imported || 0}</span> imported</div>
              {result.skipped_rows?.length ? (
                <button
                  type="button"
                  className="csv-stat csv-stat-toggle"
                  aria-expanded={skippedSectionOpen}
                  onClick={() => setSkippedSectionOpen((value) => !value)}
                >
                  <span className="csv-stat-num">{result.skipped || 0}</span> skipped
                  <ChevronDown size={14} className={skippedSectionOpen ? 'is-rotated' : ''} />
                </button>
              ) : (
                <div className="csv-stat"><span className="csv-stat-num">{result.skipped || 0}</span> skipped</div>
              )}
              {Number(result.out_of_range || 0) > 0 ? (
                <div className="csv-stat"><span className="csv-stat-num">{result.out_of_range}</span> outside date range</div>
              ) : null}
            </div>
            {result.truncated ? <p className="csv-import-note">Only the first {result.truncated_at} rows were processed.</p> : null}
            {skippedSectionOpen && result.skipped_rows?.length ? (
              <div className="csv-skipped-table-wrap">
                <table className="csv-skipped-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="align-right">Amount</th>
                      <th>Why it was skipped</th>
                      <th className="action-col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skipped_rows.map((row) => {
                      const recovered = recoveredRowKeys.has(row.row)
                      return (
                        <tr key={row.row}>
                          <td data-label="Date">{row.date || '—'}</td>
                          <td data-label="Description">{row.description || row.merchant_name || '—'}</td>
                          <td data-label="Amount" className="align-right amount">{row.amount != null ? formatMoney(Number(row.amount)) : '—'}</td>
                          <td data-label="Why it was skipped">{row.reason}</td>
                          <td data-label="Action" className="action-col">
                            {recovered ? (
                              <span className="csv-skipped-recovered">Added</span>
                            ) : (
                              <button
                                className="row-action"
                                type="button"
                                onClick={() => onRecoverRow(row, accountId)}
                              >
                                Edit &amp; add
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
            {!result.skipped_rows?.length && result.errors?.length ? (
              <ul className="csv-error-list">
                {result.errors.slice(0, 10).map((item, index) => <li key={`${item.reason || 'error'}-${index}`}>{item.reason || 'Row skipped.'}</li>)}
              </ul>
            ) : null}
            <p className="csv-import-note">Imported transactions are flagged Needs Review. Check categories before reporting.</p>
          </div>
        ) : (
          <form className="drawer-form csv-import-form" onSubmit={(event) => event.preventDefault()}>
            <button
              className="csv-import-help-toggle"
              type="button"
              aria-expanded={showBankHelp}
              onClick={() => setShowBankHelp((value) => !value)}
            >
              {showBankHelp ? 'Hide bank CSV help' : 'Need help finding your bank CSV?'}
            </button>
            {showBankHelp ? <BankCsvHelpGuide region={region} /> : null}
            <label>
              Destination account
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">Select account</option>
                {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
              </select>
            </label>
            <div className="form-grid-2">
              <label>
                Start date
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </label>
              <label>
                End date
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <label className="csv-file-drop">
              <Upload size={22} />
              <strong>{file ? file.name : 'Choose CSV file'}</strong>
              <span>CSV files from your bank or card account</span>
              <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
            {error ? <p className="drawer-error" role="alert">{error}</p> : null}
          </form>
        )}

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {result ? null : (
            <button className="primary-button" type="button" disabled={importing} onClick={() => void startImport()}>
              {importing ? <>Importing<LoadingDots /></> : 'Import'}
            </button>
          )}
        </div>
      </section>
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

function ReceiptUploadModal({
  transaction,
  onClose,
  onUploaded,
}: {
  transaction: Transaction
  onClose: () => void
  onUploaded: () => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  async function submitUpload() {
    setError('')
    if (!file) {
      setError('Choose a receipt file first.')
      return
    }

    setUploading(true)
    try {
      await uploadReceipt(file, transaction.id)
      await onUploaded()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to attach receipt.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal receipt-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiptUploadTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="receiptUploadTitle">Attach receipt</h2>
            <p>{transaction.description} - {formatMoney(transaction.amount)}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close receipt upload" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label className="csv-file-drop">
            <Upload size={22} />
            <strong>{file ? file.name : 'Choose receipt file'}</strong>
            <span>PNG, JPG, or PDF receipt support</span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={uploading} onClick={() => void submitUpload()}>
            {uploading ? <>Uploading<LoadingDots /></> : 'Attach receipt'}
          </button>
        </div>
      </section>
    </div>
  )
}

function CategoryIcon({ category }: { category: string }) {
  const Icon = category === 'Fuel' ? Fuel : category === 'Meals' ? Coffee : category === 'Software' ? Package : ShoppingBag
  return (
    <span className={`category-icon category-${category.toLowerCase()}`}>
      <Icon size={15} />
    </span>
  )
}

function StatusPill({ status }: { status: TransactionStatus }) {
  return <span className={`status-pill status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
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
  children: ReactNode
}) {
  const isExpanded = expandedPanel === id

  return (
    <article className="progressive-panel">
      <button type="button" onClick={() => onToggle(isExpanded ? null : id)} aria-expanded={isExpanded}>
        <span>{title}</span>
        <strong>{summary}</strong>
        <ChevronDown size={17} />
      </button>
      {isExpanded ? <div className="progressive-panel-body">{children}</div> : null}
    </article>
  )
}

const emptyDraft: TransactionDraft = {
  kind: 'Income',
  amount: '',
  description: '',
  date: '',
  category: '',
  account: '',
  note: '',
}

function TransactionDrawer({
  onClose,
  onSave,
  onSaveAndAttachReceipt,
  transaction,
  initialDraft,
  accounts,
  categories,
  onAttachReceipt,
  onManageCategories,
}: {
  onClose: () => void
  onSave: (draft: TransactionDraft) => void
  onSaveAndAttachReceipt: (draft: TransactionDraft) => Promise<void>
  transaction: Transaction | null
  initialDraft?: Partial<TransactionDraft>
  accounts: AccountOption[]
  categories: CategoryOption[]
  onAttachReceipt: (transaction: Transaction) => void
  onManageCategories: () => void
}) {
  const [draft, setDraft] = useState<TransactionDraft>(() => (
    transaction ? transactionToDraft(transaction) : { ...emptyDraft, ...initialDraft }
  ))
  const [error, setError] = useState('')
  const isIncome = draft.kind === 'Income'
  const isEditing = Boolean(transaction)
  const reviewLabels = transaction ? reviewLabelsFor(transaction) : []
  const needsAmountReview = hasReviewFor(reviewLabels, [/amount/i, /total/i])
  const needsDescriptionReview = hasReviewFor(reviewLabels, [/description/i, /merchant/i, /payer/i, /vendor/i, /memo/i])
  const needsDateReview = hasReviewFor(reviewLabels, [/date/i])
  const needsCategoryReview = hasReviewFor(reviewLabels, [/category/i, /tax/i, /mapping/i, /deduct/i])
  const needsAccountReview = hasReviewFor(reviewLabels, [/account/i, /bank/i, /card/i])
  const needsReceiptReview = hasReviewFor(reviewLabels, [/receipt/i, /support/i, /document/i, /proof/i])
  const needsNotesReview = hasReviewFor(reviewLabels, [/note/i, /business purpose/i, /allocation/i, /review/i])

  function updateDraft<K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function validateDraft() {
    const numericAmount = Number(draft.amount.replace(/[$,]/g, ''))
    if (!draft.description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Add a description and a valid amount.')
      return false
    }
    return true
  }

  function saveTransaction() {
    if (!validateDraft()) return
    onSave(draft)
  }

  async function saveAndAttachReceipt() {
    if (!validateDraft()) return
    try {
      await onSaveAndAttachReceipt(draft)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save transaction.')
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit transaction' : 'Add transaction'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{isEditing ? 'Edit transaction' : 'Add transaction'}</h2>
            <p>Only the essentials first. Advanced details stay collapsed.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={`transaction-type-toggle ${isIncome ? 'is-income' : 'is-expense'}`} role="group" aria-label="Transaction type">
          <button className={isIncome ? 'is-selected' : ''} type="button" onClick={() => updateDraft('kind', 'Income')}>Income</button>
          <button className={!isIncome ? 'is-selected' : ''} type="button" onClick={() => updateDraft('kind', 'Expense')}>Expense</button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          {reviewLabels.length ? (
            <div className="transaction-edit-review" role="note">
              <strong>Needs review</strong>
              <ul>
                {reviewLabels.slice(0, 5).map((label) => <li key={label}>{label}</li>)}
              </ul>
            </div>
          ) : null}
          <label className={needsAmountReview ? 'field-needs-review' : undefined}>
            Amount
            <input
              inputMode="decimal"
              placeholder="$0.00"
              value={draft.amount}
              onChange={(event) => updateDraft('amount', event.target.value)}
            />
          </label>
          <label className={needsDescriptionReview ? 'field-needs-review' : undefined}>
            Description
            <input
              placeholder="Merchant or payer"
              value={draft.description}
              onChange={(event) => updateDraft('description', event.target.value)}
            />
          </label>
          <label className={needsDateReview ? 'field-needs-review' : undefined}>
            Date
            <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
          </label>
          <label className={needsCategoryReview ? 'field-needs-review' : undefined}>
            <span className="field-title-row">
              Category
              <button className="inline-link-button" type="button" onClick={onManageCategories}>Manage categories</button>
            </span>
            <select
              value={draft.category}
              onChange={(event) => {
                if (event.target.value === '__manage_categories__') {
                  onManageCategories()
                  return
                }
                updateDraft('category', event.target.value)
              }}
            >
              <option value="">Select category</option>
              {categories
                .filter((category) => category.kind === (isIncome ? 'income' : 'expense'))
                .map((category) => <option value={category.name} key={category.id}>{category.displayLabel}</option>)}
              <option value="__manage_categories__">Manage categories...</option>
            </select>
          </label>
          <label className={needsAccountReview ? 'field-needs-review' : undefined}>
            Account
            <select value={draft.account} onChange={(event) => updateDraft('account', event.target.value)}>
              <option value="">Select account</option>
              {accounts.map((account) => <option value={account.name} key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <details className={needsReceiptReview || needsNotesReview ? 'field-needs-review' : undefined}>
            <summary>Receipt, tax treatment, and notes</summary>
            <div className="advanced-fields">
              <button
                className="secondary-button"
                type="button"
                onClick={() => (transaction ? onAttachReceipt(transaction) : void saveAndAttachReceipt())}
              >
                <ReceiptText size={17} />
                Attach receipt
              </button>
              <textarea
                placeholder="Internal note"
                value={draft.note}
                onChange={(event) => updateDraft('note', event.target.value)}
              />
            </div>
          </details>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={saveTransaction}>
            {isEditing ? 'Save changes' : 'Save transaction'}
          </button>
        </div>
      </aside>
    </div>
  )
}

function TransactionDetailsModal({
  transaction,
  isLocked,
  lockedThroughDate,
  onClose,
  onUpdate,
  onAttachReceipt,
  onManageReceiptStatus,
  onEdit,
  onManageCategories,
  onDelete,
}: {
  transaction: Transaction
  isLocked: boolean
  lockedThroughDate: string | null
  onClose: () => void
  onUpdate: (transaction: Transaction) => void
  onAttachReceipt: () => void
  onManageReceiptStatus: () => void
  onEdit: () => void
  onManageCategories: () => void
  onDelete: () => void
}) {
  const reviewItem = transaction.reviewIssues[0]
  const reviewLabels = normalizeReviewLabels(reviewItem?.issueLabels?.length
    ? reviewItem.issueLabels.map(reviewText).filter(Boolean)
    : reviewItem?.issueEntries?.map((entry) => reviewText(entry.label) || reviewText(entry.issueCode) || 'Review needed') || [], transaction.description)
  const reviewSummary = reviewText(reviewItem?.supportSummary)
    || reviewText(reviewItem?.reviewNotes)
    || reviewText(reviewItem?.categoryReason)

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transactionDetailTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="transactionDetailTitle">{transaction.description}</h2>
            <p>{transaction.date} - {transaction.account}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close transaction details" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="transaction-detail-body">
          {isLocked ? (
            <div className="transaction-lock-note" role="note">
              Locked through {formatIsoDate(lockedThroughDate || '')}. Edits, receipt changes, cleared status, and deletion are disabled for this period.
            </div>
          ) : null}
          <div className={`transaction-detail-amount ${transaction.amount >= 0 ? 'is-positive' : 'is-negative'}`}>
            {formatMoney(transaction.amount)}
          </div>
          <dl className="transaction-detail-list">
            <div><dt>Category</dt><dd>{transaction.category}</dd></div>
            <div><dt>Receipt</dt><dd>{transaction.receipt}</dd></div>
            <div><dt>Receipt evidence</dt><dd>{receiptStatusLabel(transaction.receiptStatus)}</dd></div>
            <div><dt>Status</dt><dd><StatusPill status={transaction.status} /></dd></div>
          </dl>
          {transaction.receiptStatus === 'missing' && transaction.receiptMissingReason ? (
            <p className="transaction-detail-note">Reason: {transaction.receiptMissingReason}</p>
          ) : null}
          {transaction.receiptStatus === 'not_required' && transaction.businessPurpose ? (
            <p className="transaction-detail-note">Business purpose: {transaction.businessPurpose}</p>
          ) : null}
          {reviewItem ? (
            <section className="transaction-review-detail">
              <h3>Needs review</h3>
              <ul>
                {reviewLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
              {reviewSummary ? (
                <p>{reviewSummary}</p>
              ) : null}
              <div className="transaction-detail-actions">
                <button className="secondary-button" type="button" disabled={isLocked} onClick={onEdit}>Edit details</button>
                {reviewLabels.some((label) => /receipt/i.test(label)) ? (
                  <button className="secondary-button" type="button" disabled={isLocked} onClick={onAttachReceipt}>Attach receipt</button>
                ) : null}
                {reviewLabels.some((label) => /category|tax mapping/i.test(label)) ? (
                  <button className="secondary-button" type="button" onClick={onManageCategories}>Open categories</button>
                ) : null}
              </div>
            </section>
          ) : null}
          <div className="transaction-detail-actions">
            <button className="secondary-button" type="button" disabled={isLocked} onClick={onEdit}>
              Edit
            </button>
            <button className="secondary-button" type="button" disabled={isLocked} onClick={() => onUpdate({ ...transaction, cleared: true, status: 'Cleared' })}>
              <CheckCircle2 size={17} />
              Mark cleared
            </button>
            <button className="secondary-button" type="button" disabled={isLocked} onClick={onAttachReceipt}>
              <ReceiptText size={17} />
              Attach receipt
            </button>
            <button className="secondary-button" type="button" disabled={isLocked} onClick={onManageReceiptStatus}>
              No receipt / not required
            </button>
            <button className="secondary-button danger-button" type="button" disabled={isLocked} onClick={onDelete}>Delete</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function receiptStatusLabel(status: Transaction['receiptStatus']): string {
  switch (status) {
    case 'attached':
      return 'Attached'
    case 'missing':
      return 'Confirmed missing'
    case 'not_required':
      return 'Not required'
    default:
      return 'Pending decision'
  }
}

function ReceiptStatusModal({
  transaction,
  onClose,
  onUpdated,
}: {
  transaction: Transaction
  onClose: () => void
  onUpdated: (transaction: Transaction) => void
}) {
  const [choice, setChoice] = useState<'missing' | 'not_required' | 'pending'>(
    transaction.receiptStatus === 'missing' || transaction.receiptStatus === 'not_required'
      ? transaction.receiptStatus
      : 'missing',
  )
  const [reason, setReason] = useState(transaction.receiptMissingReason)
  const [purpose, setPurpose] = useState(transaction.businessPurpose)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setError('')
    if (choice === 'missing' && !reason.trim()) {
      setError('Add a short reason the receipt is missing.')
      return
    }
    if (choice === 'not_required' && !purpose.trim()) {
      setError('Add a short business-purpose note.')
      return
    }

    setSaving(true)
    try {
      const updated = await updateTransactionReceiptStatus(transaction.id, {
        receiptStatus: choice,
        receiptMissingReason: choice === 'missing' ? reason.trim() : '',
        businessPurpose: choice === 'not_required' ? purpose.trim() : '',
      })
      onUpdated(updated)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update receipt status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal receipt-status-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="receiptStatusTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="receiptStatusTitle">Receipt evidence status</h2>
            <p>{transaction.description} - {formatMoney(transaction.amount)}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close receipt status" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>This transaction's receipt is</span>
            <select value={choice} onChange={(event) => setChoice(event.target.value as typeof choice)}>
              <option value="missing">No receipt available</option>
              <option value="not_required">Not required for this transaction</option>
              <option value="pending">Decide later (reset to pending)</option>
            </select>
          </label>
          {choice === 'missing' ? (
            <label>
              <span>Why is the receipt missing?</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Cash purchase, receipt not printed"
              />
            </label>
          ) : null}
          {choice === 'not_required' ? (
            <label>
              <span>Business purpose (attestation)</span>
              <textarea
                rows={3}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="e.g. Bank-assessed fee, no receipt is issued for this charge"
              />
            </label>
          ) : null}
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void submit()}>
            {saving ? <>Saving<LoadingDots /></> : 'Save receipt status'}
          </button>
        </div>
      </section>
    </div>
  )
}

function TransactionFiltersModal({
  categories,
  accounts,
  categoryFilter,
  statusFilter,
  accountFilter,
  startDateFilter,
  endDateFilter,
  onCategoryChange,
  onStatusChange,
  onAccountChange,
  onStartDateChange,
  onEndDateChange,
  onClear,
  onClose,
}: {
  categories: CategoryOption[]
  accounts: AccountOption[]
  categoryFilter: string
  statusFilter: string
  accountFilter: string
  startDateFilter: string
  endDateFilter: string
  onCategoryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onAccountChange: (value: string) => void
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal transaction-filters-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transactionFiltersTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h2 id="transactionFiltersTitle">More filters</h2>
            <p>Filter this transaction list without adding noise to the page.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close filters" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form transaction-filter-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Category
            <select value={categoryFilter} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="All">All categories</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.displayLabel}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)}>
              <option value="All">All statuses</option>
              <option value="Needs attention">Needs attention</option>
              <option value="Cleared">Cleared</option>
              <option value="Needs review">Needs review</option>
              <option value="Missing receipt">Missing receipt</option>
              <option value="Draft">Draft</option>
            </select>
          </label>
          <label>
            Account
            <select value={accountFilter} onChange={(event) => onAccountChange(event.target.value)}>
              <option value="All">All accounts</option>
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <div className="form-grid-2">
            <label>
              Start date
              <input type="date" value={startDateFilter} onChange={(event) => onStartDateChange(event.target.value)} />
            </label>
            <label>
              End date
              <input type="date" value={endDateFilter} onChange={(event) => onEndDateChange(event.target.value)} />
            </label>
          </div>
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClear}>
            Clear filters
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            Apply filters
          </button>
        </div>
      </section>
    </div>
  )
}

function isTransactionLocked(transaction: Transaction, lock: AccountingLock | null) {
  const txDate = normalizeDateOnly(transaction.dateIso)
  const lockedThrough = normalizeDateOnly(lock?.lockedThroughDate)
  return Boolean(txDate && lockedThrough && txDate <= lockedThrough)
}

function normalizeDateOnly(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).slice(0, 10) : ''
}

function formatIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getMerchantInitial(description: string) {
  return description.trim().charAt(0).toUpperCase()
}

function transactionToDraft(transaction: Transaction): TransactionDraft {
  return {
    kind: transaction.amount >= 0 ? 'Income' : 'Expense',
    amount: String(Math.abs(transaction.amount)),
    description: transaction.description,
    date: transaction.dateIso,
    category: transaction.category,
    account: transaction.account,
    note: transaction.note,
  }
}

function skippedRowToDraftSeed(row: CsvSkippedRow, accountName: string): Partial<TransactionDraft> {
  return {
    kind: row.type === 'income' ? 'Income' : 'Expense',
    amount: row.amount != null ? String(Math.abs(Number(row.amount))) : '',
    description: row.description || row.merchant_name || '',
    date: row.date || '',
    account: accountName,
  }
}

export default Transactions
