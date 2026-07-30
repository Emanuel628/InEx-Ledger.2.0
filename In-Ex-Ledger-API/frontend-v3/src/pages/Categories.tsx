import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
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
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import useSessionDismissed from '../hooks/useSessionDismissed'
import {
  archiveCategory,
  deleteCategory,
  getTaxLineOptions,
  loadCategories,
  restoreCategory,
  saveCategoryDraft,
  type CategoryDraft,
  type CategoryStatus,
  type CategoryType,
  type TaxCategory,
} from '../lib/categoriesApi'

function Categories(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<TaxCategory | null>(null)
  const [categoryRows, setCategoryRows] = useState<TaxCategory[]>([])
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState<CategoryType | 'All'>('All')
  const [statusFilter, setStatusFilter] = useState<CategoryStatus | 'All'>('All')
  const [dataError, setDataError] = useState('')
  const [noticeVisible, dismissNotice] = useSessionDismissed('categories-review')
  useOutsideActionMenu(Boolean(actionMenuId), () => setActionMenuId(null))
  const businessRegion = props.authUser?.business?.type === 'CA' ? 'CA' : 'US'
  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return categoryRows.filter((category) => {
      const matchesSearch = !normalizedSearch || [
        category.name,
        category.type,
        category.taxLine,
        category.status,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesSearch
        && (typeFilter === 'All' || category.type === typeFilter)
        && (statusFilter === 'All' || category.status === statusFilter)
    })
  }, [categoryRows, searchTerm, statusFilter, typeFilter])
  const activeCount = categoryRows.filter((category) => category.status !== 'Archived').length
  const incomeCount = categoryRows.filter((category) => category.type === 'Income' && category.status !== 'Archived').length
  const expenseCount = categoryRows.filter((category) => category.type === 'Expense' && category.status !== 'Archived').length
  const reviewCount = categoryRows.filter((category) => category.status === 'Needs review').length

  async function refreshCategories() {
    setDataError('')
    try {
      const loadedCategories = await loadCategories()
      setCategoryRows(loadedCategories.length ? loadedCategories : [])
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load categories.')
      setCategoryRows([])
    }
  }

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  useEffect(() => {
    void refreshCategories()
  }, [])

  return (
    <AppShell
      {...props}
      overlay={drawerOpen ? (
        <CategoryDrawer
          category={editingCategory}
          businessRegion={businessRegion}
          onClose={() => {
            setDrawerOpen(false)
            setEditingCategory(null)
          }}
          onSave={(draft) => {
            void saveCategoryDraft(draft, editingCategory, businessRegion)
              .then((savedCategory) => {
                setCategoryRows((rows) => (
                  editingCategory
                    ? rows.map((row) => (row.id === savedCategory.id ? savedCategory : row))
                    : [savedCategory, ...rows]
                ))
                setDrawerOpen(false)
                setEditingCategory(null)
              })
              .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to save category.'))
          }}
        />
      ) : null}
    >
        <main className="transactions-page categories-page">
          <section className="page-heading">
            <div>
              <p className="eyebrow">Workspace</p>
              <h1>Tax Categories</h1>
              <p>Organize how transactions map to tax-ready reporting.</p>
            </div>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditingCategory(null)
                setDrawerOpen(true)
              }}
            >
              <Plus size={18} />
              Add category
            </button>
          </section>

          {noticeVisible && reviewCount > 0 ? (
            <section className="top-alert" aria-label="Categories need review">
              <AlertTriangle size={17} />
              <div>
                <strong>{reviewCount} {reviewCount === 1 ? 'category needs' : 'categories need'} review</strong>
                <span>Tax line mappings are missing or need attention.</span>
              </div>
              <button type="button" onClick={() => setStatusFilter('Needs review')}>Review</button>
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
                <span>Showing local preview categories until live data is available.</span>
              </div>
              <button className="top-alert-close" type="button" aria-label="Dismiss data warning" onClick={() => setDataError('')}>
                <X size={16} />
              </button>
            </section>
          ) : null}

          <section className="summary-strip" aria-label="Tax category summary">
            <SummaryItem label="Active categories" value={String(activeCount)} tone="net" icon={Tags} />
            <SummaryItem label="Income categories" value={String(incomeCount)} tone="income" icon={TrendingUp} />
            <SummaryItem label="Expense categories" value={String(expenseCount)} tone="expense" icon={TrendingDown} />
            <SummaryItem label="Needs review" value={String(reviewCount)} tone="review" icon={AlertTriangle} />
          </section>

          <section className="table-panel">
            <div className="table-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input type="search" placeholder="Search categories" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </label>

              <div className="filter-actions">
                <label className="secondary-button month-filter-button">
                  <Tags size={17} />
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as CategoryType | 'All')}>
                    <option value="All">Type: All</option>
                    <option value="Income">Income</option>
                    <option value="Expense">Expense</option>
                  </select>
                </label>
                <label className="secondary-button month-filter-button">
                  <AlertTriangle size={17} />
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CategoryStatus | 'All')}>
                    <option value="All">Review: All</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Needs review">Needs review</option>
                    <option value="Archived">Archived</option>
                  </select>
                </label>
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
                  {filteredCategories.map((category) => (
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
                        <button
                          className="row-action"
                          type="button"
                          aria-label={`Actions for ${category.name}`}
                          aria-expanded={actionMenuId === category.id}
                          onClick={() => setActionMenuId((id) => (id === category.id ? null : category.id))}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {actionMenuId === category.id ? (
                          <div className="row-action-menu">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCategory(category)
                                setDrawerOpen(true)
                                setActionMenuId(null)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const action = category.status === 'Archived' ? restoreCategory : archiveCategory
                                void action(category)
                                  .then((savedCategory) => {
                                    setCategoryRows((rows) => rows.map((row) => (row.id === savedCategory.id ? savedCategory : row)))
                                    setActionMenuId(null)
                                  })
                                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to update category.'))
                              }}
                            >
                              {category.status === 'Archived' ? 'Restore' : 'Archive'}
                            </button>
                            <button
                              className="is-danger"
                              type="button"
                              onClick={() => {
                                void deleteCategory(category.id)
                                  .then(() => {
                                    setCategoryRows((rows) => rows.filter((row) => row.id !== category.id))
                                    setActionMenuId(null)
                                  })
                                  .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete category.'))
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-table-cell">No categories match these filters.</td>
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

function TypePill({ type }: { type: CategoryType }) {
  return <span className={`type-pill type-${type.toLowerCase()}`}>{type}</span>
}

function StatusPill({ status }: { status: CategoryStatus }) {
  return <span className={`status-pill status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
}

const emptyDraft: CategoryDraft = {
  name: '',
  type: '',
  taxLine: '',
}

function CategoryDrawer({
  category,
  businessRegion,
  onClose,
  onSave,
}: {
  category: TaxCategory | null
  businessRegion: 'US' | 'CA'
  onClose: () => void
  onSave: (draft: CategoryDraft) => void
}) {
  const [draft, setDraft] = useState<CategoryDraft>(() => category ? {
    name: category.name,
    type: category.type,
    taxLine: category.taxMapUs || category.taxMapCa || '',
  } : emptyDraft)
  const [error, setError] = useState('')
  const isEditing = Boolean(category)
  const taxLineOptions = getTaxLineOptions(category?.businessRegion || businessRegion)

  function updateDraft<K extends keyof CategoryDraft>(key: K, value: CategoryDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }

  function submitCategory() {
    if (!draft.name.trim() || !draft.type) {
      setError('Add a category name and type.')
      return
    }
    onSave(draft)
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label={isEditing ? 'Edit category' : 'Add category'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{isEditing ? 'Edit category' : 'Add category'}</h2>
            <p>Keep the label, type, and tax mapping clear.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Category name
            <input placeholder="Software" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} />
          </label>
          <label>
            Type
            <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value as CategoryDraft['type'])}>
              <option value="" disabled>
                Select type
              </option>
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
          </label>
          <label>
            Tax line
            <select value={draft.taxLine} onChange={(event) => updateDraft('taxLine', event.target.value)}>
              {taxLineOptions.map((option) => (
                <option value={option.value} key={option.value || 'empty'}>{option.label}</option>
              ))}
            </select>
          </label>
          {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={submitCategory}>
            {isEditing ? 'Save changes' : 'Save category'}
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
