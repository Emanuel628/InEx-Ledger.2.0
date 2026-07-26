import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  Tags,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useSessionDismissed from '../hooks/useSessionDismissed'

type CategoryType = 'Income' | 'Expense' | 'Other'
type CategoryStatus = 'Active' | 'Needs review'

type TaxCategory = {
  id: number
  name: string
  type: CategoryType
  taxLine: string
  transactions: number
  status: CategoryStatus
  tone: string
}

const categories: TaxCategory[] = [
  {
    id: 1,
    name: 'Consulting Income',
    type: 'Income',
    taxLine: 'Schedule C - Gross receipts',
    transactions: 134,
    status: 'Active',
    tone: 'green',
  },
  {
    id: 2,
    name: 'Software',
    type: 'Expense',
    taxLine: 'Schedule C - Office expense',
    transactions: 56,
    status: 'Active',
    tone: 'blue',
  },
  {
    id: 3,
    name: 'Meals',
    type: 'Expense',
    taxLine: 'Schedule C - Meals',
    transactions: 42,
    status: 'Active',
    tone: 'coral',
  },
  {
    id: 4,
    name: 'Fuel',
    type: 'Expense',
    taxLine: 'Schedule C - Car and truck',
    transactions: 78,
    status: 'Active',
    tone: 'yellow',
  },
  {
    id: 5,
    name: 'Office Supplies',
    type: 'Expense',
    taxLine: 'Schedule C - Supplies',
    transactions: 31,
    status: 'Needs review',
    tone: 'red',
  },
  {
    id: 6,
    name: 'Owner Draw',
    type: 'Other',
    taxLine: 'Not included on tax return',
    transactions: 12,
    status: 'Needs review',
    tone: 'violet',
  },
]

function Categories(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('categories-review')

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search categories, tax lines, transaction links"
      overlay={drawerOpen ? <CategoryDrawer onClose={() => setDrawerOpen(false)} /> : null}
    >
        <main className="transactions-page categories-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>Tax Categories</h1>
              <p>Organize how transactions map to tax-ready reporting.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>
              <Plus size={18} />
              Add category
            </button>
          </section>

          {noticeVisible ? (
            <section className="top-alert" aria-label="Categories need review">
              <AlertTriangle size={17} />
              <div>
                <strong>2 categories need review</strong>
                <span>Tax line mappings are missing or need attention.</span>
              </div>
              <button type="button">Review</button>
              <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          <section className="summary-strip" aria-label="Tax category summary">
            <SummaryItem label="Active categories" value="28" tone="net" icon={Tags} />
            <SummaryItem label="Income categories" value="9" tone="income" icon={TrendingUp} />
            <SummaryItem label="Expense categories" value="17" tone="expense" icon={TrendingDown} />
            <SummaryItem label="Needs review" value="2" tone="review" icon={AlertTriangle} />
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input type="search" placeholder="Search categories" />
              </label>

              <div className="filter-actions">
                <button className="secondary-button" type="button">
                  <Tags size={17} />
                  Type: All
                </button>
                <button className="secondary-button" type="button">
                  <AlertTriangle size={17} />
                  Review: All
                </button>
              </div>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Tax line</th>
                    <th>Transactions</th>
                    <th>Status</th>
                    <th className="action-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td data-label="Category">
                        <div className="merchant-cell">
                          <span className={`merchant-icon merchant-${category.tone}`}>{getCategoryInitial(category.name)}</span>
                          <strong>{category.name}</strong>
                        </div>
                      </td>
                      <td data-label="Type">
                        <TypePill type={category.type} />
                      </td>
                      <td data-label="Tax line">{category.taxLine}</td>
                      <td data-label="Transactions">{category.transactions} linked</td>
                      <td data-label="Status">
                        <StatusPill status={category.status} />
                      </td>
                      <td data-label="Actions" className="action-col">
                        <button className="row-action" type="button" aria-label={`Actions for ${category.name}`}>
                          <MoreHorizontal size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="progressive-panels" aria-label="Additional category tools">
            <ProgressivePanel
              id="archived"
              title="Archived categories"
              summary="4 hidden"
              expandedPanel={expandedPanel}
              onToggle={setExpandedPanel}
            >
              Archived categories stay available for history without crowding daily categorization.
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

function TypePill({ type }: { type: CategoryType }) {
  return <span className={`type-pill type-${type.toLowerCase()}`}>{type}</span>
}

function StatusPill({ status }: { status: CategoryStatus }) {
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

function CategoryDrawer({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label="Add category" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Add category</h2>
            <p>Keep the label, type, and tax mapping clear.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Category name
            <input placeholder="Software" />
          </label>
          <label>
            Type
            <select defaultValue="">
              <option value="" disabled>
                Select type
              </option>
              <option>Income</option>
              <option>Expense</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Tax line
            <select defaultValue="">
              <option value="" disabled>
                Select tax line
              </option>
              <option>Schedule C - Gross receipts</option>
              <option>Schedule C - Office expense</option>
              <option>Schedule C - Meals</option>
              <option>Schedule C - Car and truck</option>
              <option>Not included on tax return</option>
            </select>
          </label>
          <details>
            <summary>Notes</summary>
            <div className="advanced-fields">
              <textarea aria-label="Category notes" placeholder="Internal note" />
            </div>
          </details>
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button">
            Save category
          </button>
        </div>
      </aside>
    </div>
  )
}

function getCategoryInitial(name: string) {
  return name.trim().charAt(0).toUpperCase()
}

export default Categories
