import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coffee,
  Filter,
  Fuel,
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
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import useSessionDismissed from '../hooks/useSessionDismissed'
import {
  deleteTransaction,
  importTransactionsCsv,
  loadTransactionPageData,
  saveTransactionDraft,
  type AccountOption,
  type CategoryOption,
  type Transaction,
  type TransactionDraft,
  type TransactionStatus,
} from '../lib/transactionsApi'

function Transactions(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [transactionRows, setTransactionRows] = useState<Transaction[]>([])
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([])
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [monthFilter, setMonthFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [accountFilter, setAccountFilter] = useState('All')
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const csvInputRef = useRef<HTMLInputElement | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('transactions-review')
  useOutsideActionMenu(Boolean(actionMenuId), () => setActionMenuId(null))

  async function refreshPageData() {
    setLoadingData(true)
    setDataError('')
    try {
      const pageData = await loadTransactionPageData()
      setTransactionRows(pageData.transactions)
      setAccountOptions(pageData.accounts)
      setCategoryOptions(pageData.categories)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load transactions.')
      setTransactionRows([])
      setAccountOptions([])
      setCategoryOptions([])
    } finally {
      setLoadingData(false)
    }
  }

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return transactionRows.filter((transaction) => {
      const matchesMonth = monthFilter === 'All' || transaction.dateIso.startsWith(monthFilter)
      const matchesCategory = categoryFilter === 'All' || transaction.category === categoryFilter
      const matchesStatus = statusFilter === 'All'
        || transaction.status === statusFilter
        || (statusFilter === 'Needs attention' && (transaction.status !== 'Cleared' || transaction.receipt === 'Missing'))
      const matchesAccount = accountFilter === 'All' || transaction.account === accountFilter
      const matchesSearch = !normalizedSearch || [
        transaction.description,
        transaction.category,
        transaction.account,
        transaction.receipt,
        transaction.status,
        String(transaction.amount),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesMonth && matchesCategory && matchesStatus && matchesAccount && matchesSearch
    })
  }, [accountFilter, categoryFilter, monthFilter, searchTerm, statusFilter, transactionRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const visibleRows = filteredRows.slice(pageStart, pageStart + pageSize)
  const categories = uniqueValues(transactionRows.map((transaction) => transaction.category))
  const accounts = uniqueValues(transactionRows.map((transaction) => transaction.account))
  const incomeTotal = transactionRows.filter((row) => row.amount > 0).reduce((total, row) => total + row.amount, 0)
  const expenseTotal = Math.abs(transactionRows.filter((row) => row.amount < 0).reduce((total, row) => total + row.amount, 0))
  const netTotal = incomeTotal - expenseTotal
  const reviewCount = transactionRows.filter((row) => row.status !== 'Cleared' || row.receipt === 'Missing').length

  useEffect(() => {
    setCurrentPage(1)
  }, [accountFilter, categoryFilter, monthFilter, pageSize, searchTerm, statusFilter])

  useEffect(() => {
    void refreshPageData()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen || Boolean(selectedTransaction) || filtersOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen, filtersOpen, selectedTransaction])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search transactions, merchants, categories"
      overlay={
        <>
          {drawerOpen ? (
            <TransactionDrawer
              onClose={() => {
                setDrawerOpen(false)
                setEditingTransaction(null)
              }}
              onSave={(draft) => {
                void saveTransactionDraft(draft, editingTransaction, accountOptions, categoryOptions)
                  .then((savedTransaction) => {
                    setTransactionRows((rows) => (
                      editingTransaction
                        ? rows.map((row) => (row.id === savedTransaction.id ? savedTransaction : row))
                        : [savedTransaction, ...rows]
                    ))
                    if (!editingTransaction && monthFilter !== 'All' && !savedTransaction.dateIso.startsWith(monthFilter)) {
                      setMonthFilter('All')
                    }
                    setEditingTransaction(null)
                    setDrawerOpen(false)
                  })
                  .catch((error) => {
                    setDataError(error instanceof Error ? error.message : 'Unable to save transaction.')
                  })
              }}
              transaction={editingTransaction}
              accounts={accountOptions}
              categories={categoryOptions}
            />
          ) : null}
          {selectedTransaction ? (
            <TransactionDetailsModal
              transaction={selectedTransaction}
              onClose={() => setSelectedTransaction(null)}
              onUpdate={(updated) => {
                void saveTransactionDraft(transactionToDraft(updated), updated, accountOptions, categoryOptions)
                  .then((savedTransaction) => {
                    setTransactionRows((rows) => rows.map((row) => (row.id === savedTransaction.id ? savedTransaction : row)))
                    setSelectedTransaction(savedTransaction)
                  })
                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update transaction.'))
              }}
              onAttachReceipt={() => setDataError('Receipt attachment belongs on the Receipts page until file upload is wired into this drawer.')}
              onDelete={() => {
                void deleteTransaction(selectedTransaction.id)
                  .then(() => {
                    setTransactionRows((rows) => rows.filter((row) => row.id !== selectedTransaction.id))
                    setSelectedTransaction(null)
                  })
                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete transaction.'))
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
              onCategoryChange={setCategoryFilter}
              onStatusChange={setStatusFilter}
              onAccountChange={setAccountFilter}
              onClear={() => {
                setSearchTerm('')
                setMonthFilter('All')
                setCategoryFilter('All')
                setStatusFilter('All')
                setAccountFilter('All')
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

          {noticeVisible ? (
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
                  setMonthFilter('All')
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

          <section className="summary-strip" aria-label="Transaction summary">
            <SummaryItem label="Income" value={formatMoney(incomeTotal)} tone="income" icon={TrendingUp} />
            <SummaryItem label="Expenses" value={formatMoney(expenseTotal)} tone="expense" icon={TrendingDown} />
            <SummaryItem label="Net" value={formatMoney(netTotal)} tone="net" icon={CircleDollarSign} />
            <SummaryItem label="Needs review" value={String(reviewCount)} tone="review" icon={AlertTriangle} />
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input
                  type="search"
                  placeholder="Search transactions"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </label>

              <div className="filter-actions">
                <label className="secondary-button month-filter-button">
                  <Calendar size={17} />
                  <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                    <option value="All">All months</option>
                  </select>
                </label>
                <button className="secondary-button" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}>
                  <Filter size={17} />
                  More filters
                </button>
                <button className="secondary-button" type="button" onClick={() => csvInputRef.current?.click()}>
                  <Upload size={17} />
                  Import CSV
                </button>
                <input
                  ref={csvInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void importTransactionsCsv(file)
                        .then(() => {
                          setMonthFilter('All')
                          return refreshPageData()
                        })
                        .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to import CSV.'))
                    }
                    event.target.value = ''
                  }}
                />
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
                  {visibleRows.map((transaction) => (
                    <tr key={transaction.id}>
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
                            <button
                              type="button"
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
                              onClick={() => {
                                setDataError('Receipt attachment belongs on the Receipts page until file upload is wired into this drawer.')
                                setActionMenuId(null)
                              }}
                            >
                              Attach receipt
                            </button>
                            <button
                              className="is-danger"
                              type="button"
                              onClick={() => {
                                void deleteTransaction(transaction.id)
                                  .then(() => {
                                    setTransactionRows((rows) => rows.filter((row) => row.id !== transaction.id))
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
                  ))}
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
                Showing {filteredRows.length ? pageStart + 1 : 0} to {Math.min(pageStart + pageSize, filteredRows.length)} of {filteredRows.length} transactions
              </span>
              <div className="pagination" aria-label="Pagination">
                <button type="button" aria-label="Previous page" disabled={safeCurrentPage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).slice(0, 5).map((page) => (
                  <button
                    className={page === safeCurrentPage ? 'is-active' : ''}
                    type="button"
                    key={page}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}
                {totalPages > 5 ? <span>...</span> : null}
                <button type="button" aria-label="Next page" disabled={safeCurrentPage === totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}>
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

          <section className="progressive-panels" aria-label="Additional transaction tools">
            <ProgressivePanel
              id="review"
              title="Review queue"
              summary={`${reviewCount} ${reviewCount === 1 ? 'item' : 'items'}`}
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Missing receipts, mixed-use expenses, and uncategorized imported rows will appear here.
            </ProgressivePanel>
            <ProgressivePanel
              id="tax"
              title="Tax set-aside helper"
              summary={netTotal > 0 ? `${formatMoney(netTotal * 0.25)} estimated` : '$0 estimated'}
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Tax estimates stay available, but they do not compete with daily transaction work.
            </ProgressivePanel>
            <ProgressivePanel
              id="recurring"
              title="Recurring templates"
              summary="Not connected yet"
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Recurring transaction templates live here until the user chooses to manage them.
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
  transaction,
  accounts,
  categories,
}: {
  onClose: () => void
  onSave: (draft: TransactionDraft) => void
  transaction: Transaction | null
  accounts: AccountOption[]
  categories: CategoryOption[]
}) {
  const [draft, setDraft] = useState<TransactionDraft>(() => transaction ? transactionToDraft(transaction) : emptyDraft)
  const [error, setError] = useState('')
  const isIncome = draft.kind === 'Income'
  const isEditing = Boolean(transaction)

  function updateDraft<K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function saveTransaction() {
    const numericAmount = Number(draft.amount.replace(/[$,]/g, ''))
    if (!draft.description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Add a description and a valid amount.')
      return
    }

    onSave(draft)
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
          <label>
            Amount
            <input
              inputMode="decimal"
              placeholder="$0.00"
              value={draft.amount}
              onChange={(event) => updateDraft('amount', event.target.value)}
            />
          </label>
          <label>
            Description
            <input
              placeholder="Merchant or payer"
              value={draft.description}
              onChange={(event) => updateDraft('description', event.target.value)}
            />
          </label>
          <label>
            Date
            <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
          </label>
          <label>
            Category
            <select value={draft.category} onChange={(event) => updateDraft('category', event.target.value)}>
              <option value="">Select category</option>
              {categories
                .filter((category) => category.kind === (isIncome ? 'income' : 'expense'))
                .map((category) => <option value={category.name} key={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label>
            Account
            <select value={draft.account} onChange={(event) => updateDraft('account', event.target.value)}>
              <option value="">Select account</option>
              {accounts.map((account) => <option value={account.name} key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <details>
            <summary>Receipt, tax treatment, and notes</summary>
            <div className="advanced-fields">
              <button className="secondary-button" type="button" disabled>
                <Upload size={17} />
                Receipt upload is handled on Receipts
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
  onClose,
  onUpdate,
  onAttachReceipt,
  onDelete,
}: {
  transaction: Transaction
  onClose: () => void
  onUpdate: (transaction: Transaction) => void
  onAttachReceipt: () => void
  onDelete: () => void
}) {
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
          <div className={`transaction-detail-amount ${transaction.amount >= 0 ? 'is-positive' : 'is-negative'}`}>
            {formatMoney(transaction.amount)}
          </div>
          <dl className="transaction-detail-list">
            <div><dt>Category</dt><dd>{transaction.category}</dd></div>
            <div><dt>Receipt</dt><dd>{transaction.receipt}</dd></div>
            <div><dt>Status</dt><dd><StatusPill status={transaction.status} /></dd></div>
          </dl>
          <div className="transaction-detail-actions">
            <button className="secondary-button" type="button" onClick={() => onUpdate({ ...transaction, status: 'Cleared' })}>
              <CheckCircle2 size={17} />
              Mark cleared
            </button>
            <button className="secondary-button" type="button" onClick={onAttachReceipt}>
              <ReceiptText size={17} />
              Attach receipt
            </button>
            <button className="secondary-button danger-button" type="button" onClick={onDelete}>Delete</button>
          </div>
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
  onCategoryChange,
  onStatusChange,
  onAccountChange,
  onClear,
  onClose,
}: {
  categories: string[]
  accounts: string[]
  categoryFilter: string
  statusFilter: string
  accountFilter: string
  onCategoryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onAccountChange: (value: string) => void
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
              {categories.map((category) => <option value={category} key={category}>{category}</option>)}
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
              {accounts.map((account) => <option value={account} key={account}>{account}</option>)}
            </select>
          </label>
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

function formatMoney(value: number) {
  const formatted = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })

  return value < 0 ? `-${formatted}` : formatted
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

function uniqueValues(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

export default Transactions
