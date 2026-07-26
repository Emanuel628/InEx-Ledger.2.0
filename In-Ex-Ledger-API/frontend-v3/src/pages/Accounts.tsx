import { useEffect, useState } from 'react'
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

type AccountStatus = 'Active' | 'Needs details' | 'Archived'

type AccountRecord = {
  id: number
  name: string
  type: 'Checking' | 'Savings' | 'Credit Card' | 'Cash' | 'Loan'
  institution: string
  lastFour: string
  transactionCount: number
  status: AccountStatus
  tone: string
}

const accounts: AccountRecord[] = [
  {
    id: 1,
    name: 'Business Checking',
    type: 'Checking',
    institution: 'Chase',
    lastFour: '1234',
    transactionCount: 42,
    status: 'Active',
    tone: 'blue',
  },
  {
    id: 2,
    name: 'Operating Savings',
    type: 'Savings',
    institution: 'Bank of America',
    lastFour: '5678',
    transactionCount: 8,
    status: 'Active',
    tone: 'green',
  },
  {
    id: 3,
    name: 'Business Credit Card',
    type: 'Credit Card',
    institution: 'American Express',
    lastFour: '1001',
    transactionCount: 29,
    status: 'Active',
    tone: 'violet',
  },
  {
    id: 4,
    name: 'Cash on hand',
    type: 'Cash',
    institution: 'Manual',
    lastFour: 'none',
    transactionCount: 3,
    status: 'Needs details',
    tone: 'yellow',
  },
  {
    id: 5,
    name: 'Equipment loan',
    type: 'Loan',
    institution: 'Wells Fargo',
    lastFour: '9876',
    transactionCount: 6,
    status: 'Active',
    tone: 'coral',
  },
]

function Accounts(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('accounts-details')

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search accounts, institutions, transaction links"
      overlay={drawerOpen ? <AccountDrawer onClose={() => setDrawerOpen(false)} /> : null}
    >
        <main className="transactions-page accounts-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>Accounts</h1>
              <p>Create the accounts your transactions are assigned to. Bank sync can come later without changing the structure.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>
              <Plus size={18} />
              Add account
            </button>
          </section>

          {noticeVisible ? (
            <section className="top-alert" aria-label="Account details needed">
              <ToggleLeft size={17} />
              <div>
                <strong>1 account needs details</strong>
                <span>Add missing institution or last-four details before exports.</span>
              </div>
              <button type="button">Review</button>
              <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          <section className="summary-strip account-summary" aria-label="Account setup summary">
            <SummaryItem label="Active accounts" value="4" tone="net" icon={Wallet} />
            <SummaryItem label="Bank accounts" value="2" tone="income" icon={Landmark} />
            <SummaryItem label="Credit cards" value="1" tone="expense" icon={CreditCard} />
            <SummaryItem label="Currency" value="USD" tone="review" icon={Wallet} />
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input type="search" placeholder="Search accounts" />
              </label>

              <div className="filter-actions">
                <button className="secondary-button" type="button">
                  <Landmark size={17} />
                  Type: All
                </button>
                <button className="secondary-button" type="button">
                  <Wallet size={17} />
                  Status: Active
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Type</th>
                    <th>Institution</th>
                    <th>Last 4</th>
                    <th>Transactions</th>
                    <th>Status</th>
                    <th className="action-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
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
                      <td data-label="Institution">{account.institution}</td>
                      <td data-label="Last 4">{account.lastFour}</td>
                      <td data-label="Transactions">{account.transactionCount} linked</td>
                      <td data-label="Status">
                        <StatusPill status={account.status} />
                      </td>
                      <td data-label="Actions" className="action-col">
                        <button className="row-action" type="button" aria-label={`Actions for ${account.name}`}>
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
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
            <ProgressivePanel
              id="archived"
              title="Archived accounts"
              summary="2 hidden"
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Old accounts stay out of daily transaction work but remain available for history and exports.
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

function AccountDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer account-drawer" role="dialog" aria-modal="true" aria-label="Add account" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Add account</h2>
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
            <input placeholder="Business Checking" />
          </label>
          <label>
            Account type
            <select defaultValue="">
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
          <label>
            Institution
            <input placeholder="Bank, card provider, or Manual" />
          </label>
          <label>
            Last 4 digits
            <input inputMode="numeric" maxLength={4} placeholder="1234" />
          </label>
          <details>
            <summary>Notes</summary>
            <div className="advanced-fields">
              <textarea aria-label="Account notes" placeholder="Internal note" />
            </div>
          </details>
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button">
            Save account
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
