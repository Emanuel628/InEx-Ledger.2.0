import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  CreditCard,
  Landmark,
  Link,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useSessionDismissed from '../hooks/useSessionDismissed'
import {
  deleteAccount,
  loadAccounts,
  saveAccountDraft,
  type AccountDraft,
  type AccountRecord,
  type AccountStatus,
} from '../lib/accountsApi'

const accounts: AccountRecord[] = [
  {
    id: 'mock-1',
    name: 'Business Checking',
    type: 'Checking',
    transactionCount: 42,
    status: 'Active',
    tone: 'blue',
  },
  {
    id: 'mock-2',
    name: 'Operating Savings',
    type: 'Savings',
    transactionCount: 8,
    status: 'Active',
    tone: 'green',
  },
  {
    id: 'mock-3',
    name: 'Business Credit Card',
    type: 'Credit Card',
    transactionCount: 29,
    status: 'Active',
    tone: 'violet',
  },
  {
    id: 'mock-4',
    name: 'Cash on hand',
    type: 'Cash',
    transactionCount: 3,
    status: 'Needs details',
    tone: 'yellow',
  },
  {
    id: 'mock-5',
    name: 'Equipment loan',
    type: 'Loan',
    transactionCount: 6,
    status: 'Active',
    tone: 'coral',
  },
]

function Accounts(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null)
  const [accountRows, setAccountRows] = useState<AccountRecord[]>(accounts)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<AccountRecord['type'] | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'All'>('Active')
  const [dataError, setDataError] = useState('')
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('accounts-details')
  const filteredAccounts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return accountRows.filter((account) => {
      const matchesSearch = !normalizedSearch || [
        account.name,
        account.type,
        account.status,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesSearch
        && (typeFilter === 'All' || account.type === typeFilter)
        && (statusFilter === 'All' || account.status === statusFilter)
    })
  }, [accountRows, searchTerm, statusFilter, typeFilter])
  const activeCount = accountRows.filter((account) => account.status === 'Active').length
  const bankCount = accountRows.filter((account) => ['Checking', 'Savings'].includes(account.type)).length
  const creditCardCount = accountRows.filter((account) => account.type === 'Credit Card').length
  const needsDetailsCount = accountRows.filter((account) => account.status === 'Needs details').length

  async function refreshAccounts() {
    setDataError('')
    try {
      const loadedAccounts = await loadAccounts()
      setAccountRows(loadedAccounts.length ? loadedAccounts : [])
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load accounts.')
      setAccountRows(accounts)
    }
  }

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  useEffect(() => {
    void refreshAccounts()
  }, [])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search accounts, types, transaction links"
      overlay={drawerOpen ? (
        <AccountDrawer
          account={editingAccount}
          onClose={() => {
            setDrawerOpen(false)
            setEditingAccount(null)
          }}
          onSave={(draft) => {
            void saveAccountDraft(draft, editingAccount)
              .then((savedAccount) => {
                setAccountRows((rows) => (
                  editingAccount
                    ? rows.map((row) => (row.id === savedAccount.id ? savedAccount : row))
                    : [savedAccount, ...rows]
                ))
                setDrawerOpen(false)
                setEditingAccount(null)
              })
              .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to save account.'))
          }}
        />
      ) : null}
    >
        <main className="transactions-page accounts-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>Accounts</h1>
              <p>Create the accounts your transactions are assigned to. Bank sync can come later without changing the structure.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingAccount(null)
                setDrawerOpen(true)
              }}
            >
              <Plus size={18} />
              Add account
            </button>
          </section>

          {noticeVisible && needsDetailsCount > 0 ? (
            <section className="top-alert" aria-label="Account details needed">
              <ToggleLeft size={17} />
              <div>
                <strong>{needsDetailsCount} {needsDetailsCount === 1 ? 'account needs' : 'accounts need'} details</strong>
                <span>Review account details before using them in transactions.</span>
              </div>
              <button type="button" onClick={() => setSearchTerm('Needs details')}>Review</button>
              <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          {dataError ? (
            <section className="top-alert" role="alert">
              <ToggleLeft size={17} />
              <div>
                <strong>{dataError}</strong>
                <span>Showing local preview accounts until live data is available.</span>
              </div>
              <button className="top-alert-close" type="button" aria-label="Dismiss data warning" onClick={() => setDataError('')}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          <section className="summary-strip account-summary" aria-label="Account setup summary">
            <SummaryItem label="Active accounts" value={String(activeCount)} tone="net" icon={Wallet} />
            <SummaryItem label="Bank accounts" value={String(bankCount)} tone="income" icon={Landmark} />
            <SummaryItem label="Credit cards" value={String(creditCardCount)} tone="expense" icon={CreditCard} />
            <SummaryItem label="Currency" value="USD" tone="review" icon={Wallet} />
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input type="search" placeholder="Search accounts" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </label>

              <div className="filter-actions">
                <label className="secondary-button month-filter-button">
                  <Landmark size={17} />
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as AccountRecord['type'] | 'All')}>
                    <option value="All">Type: All</option>
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Cash">Cash</option>
                    <option value="Loan">Loan</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="secondary-button month-filter-button">
                  <Wallet size={17} />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AccountStatus | 'All')}>
                    <option value="All">Status: All</option>
                    <option value="Active">Active</option>
                    <option value="Needs details">Needs details</option>
                    <option value="Archived">Archived</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Transactions</th>
                    <th>Status</th>
                    <th className="action-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account) => (
                    <tr key={account.id}>
                      <td data-label="Account">
                        <div className="merchant-cell">
                          <span className={`merchant-icon merchant-${account.tone}`}>{getAccountInitial(account.name)}</span>
                          <strong>{account.name}</strong>
                        </div>
                      </td>
                      <td data-label="Type">
                        <div className="category-cell">
                          <AccountTypeIcon type={account.type} />
                          <span>{account.type}</span>
                        </div>
                      </td>
                      <td data-label="Transactions">{account.transactionCount} linked</td>
                      <td data-label="Status">
                        <StatusPill status={account.status} />
                      </td>
                      <td data-label="Actions" className="action-col">
                        <button
                          className="row-action"
                          type="button"
                          aria-label={`Actions for ${account.name}`}
                          aria-expanded={actionMenuId === account.id}
                          onClick={() => setActionMenuId((id) => (id === account.id ? null : account.id))}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {actionMenuId === account.id ? (
                          <div className="row-action-menu">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAccount(account)
                                setDrawerOpen(true)
                                setActionMenuId(null)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="is-danger"
                              type="button"
                              onClick={() => {
                                void deleteAccount(account.id)
                                  .then(() => {
                                    setAccountRows((rows) => rows.filter((row) => row.id !== account.id))
                                    setActionMenuId(null)
                                  })
                                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete account.'))
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty-table-cell">No accounts match this search.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="progressive-panels" aria-label="Additional account tools">
            <ProgressivePanel
              id="plaid"
              title="Plaid connector"
              summary="Available later"
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Keep manual accounts today, then connect banks later when Plaid is ready.
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

function AccountTypeIcon({ type }: { type: AccountRecord['type'] }) {
  const Icon = type === 'Credit Card' ? CreditCard : type === 'Cash' ? Wallet : Landmark
  return (
    <span className={`category-icon category-${type.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon size={15} />
    </span>
  )
}

function StatusPill({ status }: { status: AccountStatus }) {
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

const emptyDraft: AccountDraft = {
  name: '',
  type: '',
}

function AccountDrawer({
  account,
  onClose,
  onSave,
}: {
  account: AccountRecord | null
  onClose: () => void
  onSave: (draft: AccountDraft) => void
}) {
  const [draft, setDraft] = useState<AccountDraft>(() => account ? { name: account.name, type: account.type } : emptyDraft)
  const [error, setError] = useState('')
  const isEditing = Boolean(account)

  function updateDraft<K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function submitAccount() {
    if (!draft.name.trim() || !draft.type) {
      setError('Add an account name and type.')
      return
    }
    onSave(draft)
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer account-drawer" role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit account' : 'Add account'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{isEditing ? 'Edit account' : 'Add account'}</h2>
            <p>Start manually. Plaid can be connected later when bank sync is ready.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="account-add-options" aria-label="Account creation options">
          <button className="account-option is-selected" type="button">
            <Pencil size={19} />
            <span>
              <strong>Manual account</strong>
              <small>Enter account details yourself</small>
            </span>
          </button>
          <button className="account-option" type="button">
            <Link size={19} />
            <span>
              <strong>Connect with Plaid</strong>
              <small>Optional bank connector</small>
            </span>
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Account name
            <input placeholder="Business Checking" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
          </label>
          <label>
            Account type
            <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value as AccountDraft['type'])}>
              <option value="" disabled>
                Select account type
              </option>
              <option>Checking</option>
              <option>Savings</option>
              <option>Credit Card</option>
              <option>Cash</option>
              <option>Loan</option>
              <option>Other</option>
            </select>
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={submitAccount}>
            {isEditing ? 'Save changes' : 'Save account'}
          </button>
        </div>
      </aside>
    </div>
  )
}

function getAccountInitial(name: string) {
  return name.trim().charAt(0).toUpperCase()
}

export default Accounts
