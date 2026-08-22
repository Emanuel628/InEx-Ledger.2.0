import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Fuel,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useBodyModalLock from '../hooks/useBodyModalLock'
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
import useSessionDismissed from '../hooks/useSessionDismissed'
import { isCanadaBusiness } from '../lib/businessLocale'
import { getPaginationPages } from '../lib/pagination'
import {
  blankMileageDraft,
  deleteMileageEntry,
  draftFromEntry,
  loadMileagePageData,
  saveMileageDraft,
  type MileageDraft,
  type MileageEntry,
  type MileageKind,
  type MileageSummary,
} from '../lib/mileageApi'
import { formatMoney as sharedFormatMoney, getActiveCurrency } from '../lib/money'
import { loadAccountingLock, type AccountingLock } from '../lib/settingsApi'

const emptySummary: MileageSummary = {
  tripCount: 0,
  totalMiles: 0,
  vehicleExpenseTotal: 0,
  maintenanceTotal: 0,
}

function Mileage(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [entryMode, setEntryMode] = useState<MileageKind>('Trip')
  const [editingEntry, setEditingEntry] = useState<MileageEntry | null>(null)
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([])
  const [summary, setSummary] = useState<MileageSummary>(emptySummary)
  const [accountingLock, setAccountingLock] = useState<AccountingLock | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [monthFilter, setMonthFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState<'All' | MileageKind>('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [noticeVisible, dismissNotice] = useSessionDismissed('mileage-settings')
  useOutsideActionMenu(Boolean(actionMenuId || filtersOpen), () => {
    setActionMenuId(null)
    setFiltersOpen(false)
  })
  useBodyModalLock(drawerOpen)
  const usesKilometers = isCanadaBusiness(props.authUser?.business?.region || props.authUser?.business?.type, props.authUser?.business?.currency)
  const unitLabel = usesKilometers ? 'Kilometers' : 'Miles'
  const unitShort = usesKilometers ? 'km' : 'mi'

  async function refreshPageData() {
    setLoadingData(true)
    setDataError('')
    try {
      const [pageData, lockState] = await Promise.all([
        loadMileagePageData(),
        loadAccountingLock().catch(() => null),
      ])
      setMileageEntries(pageData.entries)
      setSummary(pageData.summary)
      setAccountingLock(lockState)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load mileage.')
      setMileageEntries([])
      setSummary(emptySummary)
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshPageData()
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [monthFilter, pageSize, searchTerm, typeFilter])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return mileageEntries.filter((entry) => {
      const matchesMonth = monthFilter === 'All' || entry.dateIso.startsWith(monthFilter)
      const matchesType = typeFilter === 'All' || entry.kind === typeFilter
      const matchesSearch = !normalizedSearch || [
        entry.date,
        entry.title,
        entry.subtitle,
        entry.kind,
        entry.notes || '',
        String(entry.distance || ''),
        String(entry.amount || ''),
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesMonth && matchesType && matchesSearch
    })
  }, [mileageEntries, monthFilter, searchTerm, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const pageStart = (safeCurrentPage - 1) * pageSize
  const visibleRows = filteredRows.slice(pageStart, pageStart + pageSize)
  const paginationPages = getPaginationPages(safeCurrentPage, totalPages)
  const monthOptions = useMemo(() => {
    const values = uniqueValues(mileageEntries.map((entry) => entry.dateIso.slice(0, 7)).filter(Boolean))
    return values.sort((first, second) => second.localeCompare(first))
  }, [mileageEntries])

  function openDrawer(kind: MileageKind, entry: MileageEntry | null = null) {
    if (entry && isMileageLocked(entry, accountingLock)) {
      setDataError(`This mileage activity is locked through ${formatMonthDate(accountingLock?.lockedThroughDate || '')}.`)
      return
    }
    setEntryMode(kind)
    setEditingEntry(entry)
    setDrawerOpen(true)
    setActionMenuId(null)
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingEntry(null)
  }

  function handleSave(draft: MileageDraft) {
    return saveMileageDraft(draft, editingEntry)
      .then(() => {
        closeDrawer()
        return refreshPageData()
      })
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to save mileage activity.'))
  }

  function handleDelete(entry: MileageEntry) {
    if (isMileageLocked(entry, accountingLock)) {
      setDataError(`This mileage activity is locked through ${formatMonthDate(accountingLock?.lockedThroughDate || '')}.`)
      setActionMenuId(null)
      return
    }
    if (!window.confirm(`Delete ${entry.title}?`)) {
      return
    }
    deleteMileageEntry(entry)
      .then(refreshPageData)
      .catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to delete mileage activity.'))
      .finally(() => setActionMenuId(null))
  }

  const emptyMessage = loadingData ? 'Loading mileage activity...' : 'No mileage activity found.'

  return (
    <AppShell
      {...props}
      overlay={drawerOpen ? (
        <MileageDrawer
          entryMode={entryMode}
          setEntryMode={setEntryMode}
          unitLabel={unitLabel}
          editingEntry={editingEntry}
          onClose={closeDrawer}
          onSave={handleSave}
        />
      ) : null}
    >
      <main className="transactions-page mileage-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Vehicle log</p>
            <h1>{usesKilometers ? 'Kilometers' : 'Mileage'}</h1>
            <p>Track business trips, vehicle expenses, and maintenance in one timeline.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => openDrawer('Trip')}>
            <Plus size={18} />
            Add activity
          </button>
        </section>

        <section className="summary-strip" aria-label={`${usesKilometers ? 'Kilometers' : 'Mileage'} summary`}>
          <SummaryItem label="Trips" value={String(summary.tripCount)} tone="net" icon={Car} />
          <SummaryItem label="Distance" value={`${summary.totalMiles.toFixed(1)} ${unitShort}`} tone="income" icon={Calendar} />
          <SummaryItem label="Vehicle costs" value={formatMoney(summary.vehicleExpenseTotal)} tone="expense" icon={Fuel} />
          <SummaryItem label="Maintenance" value={formatMoney(summary.maintenanceTotal)} tone="review" icon={Wrench} />
        </section>

        {noticeVisible ? (
          <section className="top-alert" aria-label="Mileage settings note">
            <Settings2 size={18} />
            <div>
              <strong>Mileage settings live here.</strong>
              <span>Use this area for rate and unit settings before exports.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss alert" onClick={dismissNotice}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        {dataError ? (
          <section className="top-alert" role="alert">
            <Settings2 size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Refresh the page or try the action again.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss data warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className="mileage-focus-grid">
          <article className="export-card mileage-quick-log">
            <div className="export-card-header">
              <div>
                <p className="eyebrow">Quick entry</p>
                <h2>Log activity</h2>
              </div>
              <Settings2 size={20} />
            </div>

            <div className="mileage-mode-toggle" role="tablist" aria-label="Activity type">
              {(['Trip', 'Expense', 'Maintenance'] as MileageKind[]).map((mode) => (
                <button
                  className={entryMode === mode ? 'is-selected' : ''}
                  key={mode}
                  type="button"
                  onClick={() => setEntryMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>

            <QuickEntryForm entryMode={entryMode} unitLabel={unitLabel} onSave={(draft) => saveMileageDraft(draft, null).then(refreshPageData)} />
          </article>

          <article className="export-card mileage-planning-card">
            <div className="export-card-header">
              <div>
                <p className="eyebrow">Readiness</p>
                <h2>Vehicle record check</h2>
              </div>
              <Car size={20} />
            </div>
            <div className="planning-estimate">
              <span>Ready for export</span>
              <strong>{mileageEntries.length ? `${mileageEntries.length} records` : 'No records yet'}</strong>
              <p>Trips, vehicle costs, and maintenance stay separated so exports can use the right source records.</p>
            </div>
            <div className="export-total-box">
              <div>
                <span>Distance unit</span>
                <strong>{unitLabel}</strong>
              </div>
              <div>
                <span>Cost records</span>
                <strong>{mileageEntries.filter((entry) => entry.kind !== 'Trip').length}</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input
                type="search"
                placeholder="Search purpose, vendor, destination, or notes"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>

            <div className="filter-actions">
              <div className="filter-popover-wrap">
                <button className="icon-button filter-icon-button" type="button" aria-label="Mileage filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
                  <SlidersHorizontal size={18} />
                </button>
                {filtersOpen ? (
                  <div className="filter-popover" role="dialog" aria-label="Mileage filters">
                    <label>
                      Date range
                      <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
                        <option value="All">All dates</option>
                        {monthOptions.map((month) => (
                          <option key={month} value={month}>{formatMonth(month)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | MileageKind)}>
                        <option value="All">All types</option>
                        <option value="Trip">Trips</option>
                        <option value="Expense">Expenses</option>
                        <option value="Maintenance">Maintenance</option>
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
                  <th>Date</th>
                  <th>Type</th>
                  <th>Details</th>
                  <th className="align-right">Distance / Amount</th>
                  <th className="action-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length ? visibleRows.map((entry) => {
                  const rowLocked = isMileageLocked(entry, accountingLock)
                  return (
                  <tr className={rowLocked ? 'is-locked-period' : ''} key={entry.id}>
                    <td data-label="Date">{entry.date}</td>
                    <td data-label="Type">
                      <KindPill kind={entry.kind} />
                    </td>
                    <td data-label="Details">
                      <div className="merchant-cell">
                        <span className={`merchant-icon merchant-${entry.tone}`}>{getEntryIcon(entry.kind)}</span>
                        <div>
                          <strong>{entry.title}</strong>
                          <span className="table-subtext">{entry.subtitle}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Distance / Amount" className="align-right amount">
                      {entry.distance ? `${entry.distance.toFixed(1)} ${unitShort}` : formatMoney(entry.amount || 0)}
                    </td>
                    <td data-label="Actions" className="action-col receipt-actions">
                      <button
                        className="row-action"
                        type="button"
                        aria-expanded={actionMenuId === entry.id}
                        aria-label={`More actions for ${entry.title}`}
                        onClick={() => setActionMenuId(actionMenuId === entry.id ? null : entry.id)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {actionMenuId === entry.id ? (
                        <div className="row-action-menu" role="menu">
                          {rowLocked ? <p className="row-action-menu-note">Locked through {formatMonthDate(accountingLock?.lockedThroughDate || '')}</p> : null}
                          <button type="button" disabled={rowLocked} onClick={() => openDrawer(entry.kind, entry)}>Edit activity</button>
                          <button className="is-danger" type="button" disabled={rowLocked} onClick={() => handleDelete(entry)}>Delete activity</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-table-state">{emptyMessage}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>
              Showing {filteredRows.length ? pageStart + 1 : 0} to {Math.min(pageStart + visibleRows.length, filteredRows.length)} of {filteredRows.length} trips
            </span>
            <div className="pagination" aria-label="Mileage pages">
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

function QuickEntryForm({
  entryMode,
  unitLabel,
  onSave,
}: {
  entryMode: MileageKind
  unitLabel: string
  onSave: (draft: MileageDraft) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(() => blankMileageDraft(entryMode))
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(blankMileageDraft(entryMode))
    setError('')
  }, [entryMode])

  function updateDraft(field: keyof MileageDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value, kind: entryMode }))
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    onSave({ ...draft, kind: entryMode })
      .then(() => setDraft(blankMileageDraft(entryMode)))
      .catch((saveError) => setError(saveError instanceof Error ? saveError.message : 'Unable to save activity.'))
  }

  if (entryMode === 'Trip') {
    return (
      <form className="mileage-inline-form" onSubmit={submitForm}>
        <label>
          Date
          <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
        </label>
        <label>
          Purpose
          <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Client meeting" />
        </label>
        <label>
          Destination
          <input value={draft.destination} onChange={(event) => updateDraft('destination', event.target.value)} placeholder="Office, job site, supplier" />
        </label>
        <label>
          {unitLabel}
          <input type="number" min="0.1" step="0.1" value={draft.distance} onChange={(event) => updateDraft('distance', event.target.value)} placeholder="0.0" />
        </label>
        {error ? <p className="drawer-error" role="alert">{error}</p> : null}
        <button className="primary-button" type="submit">Add trip</button>
      </form>
    )
  }

  return (
    <form className="mileage-inline-form" onSubmit={submitForm}>
      <label>
        Date
        <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
      </label>
      <label>
        {entryMode} title
        <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder={entryMode === 'Maintenance' ? 'Oil change' : 'Fuel, parking, tolls'} />
      </label>
      <label>
        Vendor
        <input value={draft.vendor} onChange={(event) => updateDraft('vendor', event.target.value)} placeholder="Shell, City Garage" />
      </label>
      <label>
        Amount
        <input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => updateDraft('amount', event.target.value)} placeholder="0.00" />
      </label>
      {error ? <p className="drawer-error" role="alert">{error}</p> : null}
      <button className="primary-button" type="submit">Add {entryMode.toLowerCase()}</button>
    </form>
  )
}

function MileageDrawer({
  entryMode,
  setEntryMode,
  unitLabel,
  editingEntry,
  onClose,
  onSave,
}: {
  entryMode: MileageKind
  setEntryMode: (mode: MileageKind) => void
  unitLabel: string
  editingEntry: MileageEntry | null
  onClose: () => void
  onSave: (draft: MileageDraft) => Promise<unknown>
}) {
  const [draft, setDraft] = useState<MileageDraft>(() => editingEntry ? draftFromEntry(editingEntry) : blankMileageDraft(entryMode))
  const [error, setError] = useState('')

  useEffect(() => {
    setDraft(editingEntry ? draftFromEntry(editingEntry) : blankMileageDraft(entryMode))
    setError('')
  }, [editingEntry, entryMode])

  function updateDraft(field: keyof MileageDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value, kind: entryMode }))
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    onSave({ ...draft, kind: entryMode })
      .catch((saveError) => setError(saveError instanceof Error ? saveError.message : 'Unable to save activity.'))
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label={editingEntry ? 'Edit activity' : 'Add activity'} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>{editingEntry ? 'Edit activity' : 'Add activity'}</h2>
            <p>Record a trip, expense, or maintenance item.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close drawer" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="transaction-type-toggle mileage-drawer-toggle">
          {(['Trip', 'Expense', 'Maintenance'] as MileageKind[]).map((mode) => (
            <button
              className={entryMode === mode ? 'is-selected' : ''}
              key={mode}
              type="button"
              onClick={() => {
                setEntryMode(mode)
                if (!editingEntry) {
                  setDraft(blankMileageDraft(mode))
                }
              }}
              disabled={editingEntry ? editingEntry.kind !== mode : false}
            >
              {mode}
            </button>
          ))}
        </div>

        <form className="drawer-form" onSubmit={submitForm}>
          {entryMode === 'Trip' ? (
            <>
              <label>
                Date
                <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
              </label>
              <label>
                Purpose
                <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Client meeting" />
              </label>
              <label>
                Destination
                <input value={draft.destination} onChange={(event) => updateDraft('destination', event.target.value)} placeholder="Office, job site, supplier" />
              </label>
              <label>
                {unitLabel}
                <input type="number" min="0.1" step="0.1" value={draft.distance} onChange={(event) => updateDraft('distance', event.target.value)} placeholder="0.0" />
              </label>
            </>
          ) : (
            <>
              <label>
                Date
                <input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)} />
              </label>
              <label>
                {entryMode} title
                <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder={entryMode === 'Maintenance' ? 'Oil change' : 'Fuel, parking, tolls'} />
              </label>
              <label>
                Vendor
                <input value={draft.vendor} onChange={(event) => updateDraft('vendor', event.target.value)} placeholder="Shell, City Garage" />
              </label>
              <label>
                Amount
                <input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => updateDraft('amount', event.target.value)} placeholder="0.00" />
              </label>
              <label>
                Notes
                <textarea value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Optional service or purchase note" />
              </label>
            </>
          )}

          {error ? <p className="drawer-error" role="alert">{error}</p> : null}

          <div className="drawer-actions">
            <button className="secondary-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit">
              Save activity
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

function KindPill({ kind }: { kind: MileageKind }) {
  const className = kind === 'Trip' ? 'type-income' : kind === 'Maintenance' ? 'status-needs-review' : 'type-expense'

  return <span className={`type-pill ${className}`}>{kind}</span>
}

function getEntryIcon(kind: MileageKind) {
  if (kind === 'Trip') return 'T'
  if (kind === 'Maintenance') return 'M'
  return 'E'
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

function formatMoney(value: number) {
  return sharedFormatMoney(value, getActiveCurrency(), { maximumFractionDigits: 0 })
}

function isMileageLocked(entry: MileageEntry, lock: AccountingLock | null) {
  const entryDate = normalizeDateOnly(entry.dateIso)
  const lockedThrough = normalizeDateOnly(lock?.lockedThroughDate)
  return Boolean(entryDate && lockedThrough && entryDate <= lockedThrough)
}

function normalizeDateOnly(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value).slice(0, 10) : ''
}

function formatMonthDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value || 'the locked period'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default Mileage
