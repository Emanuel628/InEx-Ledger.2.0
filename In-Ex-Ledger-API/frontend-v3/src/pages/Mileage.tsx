import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Car,
  ChevronDown,
  Edit3,
  Fuel,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'

type MileageKind = 'Trip' | 'Expense' | 'Maintenance'

type MileageEntry = {
  id: number
  kind: MileageKind
  date: string
  title: string
  subtitle: string
  distance?: number
  amount?: number
  tone: string
}

const mileageEntries: MileageEntry[] = [
  {
    id: 1,
    kind: 'Trip',
    date: 'May 31',
    title: 'Client meeting',
    subtitle: 'Downtown office',
    distance: 18.4,
    tone: 'blue',
  },
  {
    id: 2,
    kind: 'Expense',
    date: 'May 29',
    title: 'Fuel',
    subtitle: 'Shell',
    amount: 68.45,
    tone: 'yellow',
  },
  {
    id: 3,
    kind: 'Maintenance',
    date: 'May 24',
    title: 'Oil change',
    subtitle: 'City Garage',
    amount: 92,
    tone: 'green',
  },
  {
    id: 4,
    kind: 'Trip',
    date: 'May 20',
    title: 'Supply run',
    subtitle: 'Office Depot',
    distance: 11.2,
    tone: 'violet',
  },
  {
    id: 5,
    kind: 'Expense',
    date: 'May 18',
    title: 'Parking',
    subtitle: 'Convention center',
    amount: 22,
    tone: 'red',
  },
  {
    id: 6,
    kind: 'Trip',
    date: 'May 12',
    title: 'Job site visit',
    subtitle: 'North Austin',
    distance: 31.6,
    tone: 'coral',
  },
]

function Mileage(props: PageProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [entryMode, setEntryMode] = useState<MileageKind>('Trip')
  const [expandedPanel, setExpandedPanel] = useState<string | null>('rate')
  const totalTrips = mileageEntries.filter((entry) => entry.kind === 'Trip')
  const totalDistance = totalTrips.reduce((sum, entry) => sum + (entry.distance || 0), 0)
  const vehicleExpenses = mileageEntries
    .filter((entry) => entry.kind === 'Expense')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0)
  const maintenance = mileageEntries
    .filter((entry) => entry.kind === 'Maintenance')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0)

  const planningEstimate = useMemo(() => totalDistance * 0.67, [totalDistance])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', drawerOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [drawerOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search trips, vehicle expenses, maintenance"
      overlay={drawerOpen ? <MileageDrawer entryMode={entryMode} setEntryMode={setEntryMode} onClose={() => setDrawerOpen(false)} /> : null}
    >
      <main className="transactions-page mileage-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Vehicle log</p>
            <h1>Mileage</h1>
            <p>Track business trips, vehicle expenses, and maintenance in one timeline.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => setDrawerOpen(true)}>
            <Plus size={18} />
            Add activity
          </button>
        </section>

        <section className="summary-strip" aria-label="Mileage summary">
          <SummaryItem label="Trips" value={String(totalTrips.length)} tone="net" icon={Car} />
          <SummaryItem label="Distance" value={`${totalDistance.toFixed(1)} mi`} tone="income" icon={Calendar} />
          <SummaryItem label="Vehicle costs" value={formatMoney(vehicleExpenses)} tone="expense" icon={Fuel} />
          <SummaryItem label="Maintenance" value={formatMoney(maintenance)} tone="review" icon={Wrench} />
        </section>

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

            <QuickEntryForm entryMode={entryMode} />
          </article>

          <article className="export-card mileage-planning-card">
            <div className="export-card-header">
              <div>
                <p className="eyebrow">Planning only</p>
                <h2>Mileage rate preview</h2>
              </div>
              <Car size={20} />
            </div>
            <div className="planning-estimate">
              <span>Standard mileage planning estimate</span>
              <strong>{formatMoney(planningEstimate)}</strong>
              <p>
                This is not tax advice or a guaranteed deduction. It uses the visible trip distance and a configurable
                rate for planning before export.
              </p>
            </div>
            <div className="export-total-box">
              <div>
                <span>Working unit</span>
                <strong>Miles</strong>
              </div>
              <div>
                <span>Example rate</span>
                <strong>$0.67 / mi</strong>
              </div>
            </div>
          </article>
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <label className="field search-field">
              <Search size={18} />
              <input type="search" placeholder="Search purpose, vendor, destination, or notes" />
            </label>

            <div className="filter-actions">
              <button className="secondary-button" type="button">
                <Calendar size={17} />
                Date range
              </button>
              <button className="secondary-button" type="button">
                <Car size={17} />
                Type: All
              </button>
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
                {mileageEntries.map((entry) => (
                  <tr key={entry.id}>
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
                      {entry.distance ? `${entry.distance.toFixed(1)} mi` : formatMoney(entry.amount || 0)}
                    </td>
                    <td data-label="Actions" className="action-col receipt-actions">
                      <button className="row-action" type="button" aria-label={`Edit ${entry.title}`}>
                        <Edit3 size={17} />
                      </button>
                      <button className="row-action" type="button" aria-label={`Delete ${entry.title}`}>
                        <Trash2 size={17} />
                      </button>
                      <button className="row-action" type="button" aria-label={`More actions for ${entry.title}`}>
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-footer">
            <span>Showing 6 of 24 activities</span>
            <div className="pagination" aria-label="Mileage pages">
              <button type="button">1</button>
              <button className="is-active" type="button">2</button>
              <button type="button">3</button>
            </div>
            <button className="secondary-button per-page-button" type="button">20 per page</button>
          </div>
        </section>

        <section className="progressive-panels" aria-label="Mileage settings">
          <ProgressivePanel
            id="rate"
            title="Mileage rate and unit settings"
            summary="Miles, planning rate"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            The old app supported miles/kilometers behavior from settings. This page keeps that workflow, but deduction
            language stays clearly labeled as planning-only.
          </ProgressivePanel>
        </section>
      </main>
    </AppShell>
  )
}

function QuickEntryForm({ entryMode }: { entryMode: MileageKind }) {
  if (entryMode === 'Trip') {
    return (
      <form className="mileage-inline-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Date
          <input type="date" />
        </label>
        <label>
          Purpose
          <input placeholder="Client meeting" />
        </label>
        <label>
          Destination
          <input placeholder="Office, job site, supplier" />
        </label>
        <label>
          Miles
          <input type="number" min="0.1" step="0.1" placeholder="0.0" />
        </label>
        <button className="primary-button" type="button">Add trip</button>
      </form>
    )
  }

  return (
    <form className="mileage-inline-form" onSubmit={(event) => event.preventDefault()}>
      <label>
        Date
        <input type="date" />
      </label>
      <label>
        {entryMode} title
        <input placeholder={entryMode === 'Maintenance' ? 'Oil change' : 'Fuel, parking, tolls'} />
      </label>
      <label>
        Vendor
        <input placeholder="Shell, City Garage" />
      </label>
      <label>
        Amount
        <input type="number" min="0.01" step="0.01" placeholder="$0.00" />
      </label>
      <button className="primary-button" type="button">Add {entryMode.toLowerCase()}</button>
    </form>
  )
}

function MileageDrawer({
  entryMode,
  setEntryMode,
  onClose,
}: {
  entryMode: MileageKind
  setEntryMode: (mode: MileageKind) => void
  onClose: () => void
}) {
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="transaction-drawer" role="dialog" aria-modal="true" aria-label="Add activity" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2>Add activity</h2>
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
              onClick={() => setEntryMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <form className="drawer-form" onSubmit={(event) => event.preventDefault()}>
          {entryMode === 'Trip' ? (
            <>
              <label>
                Date
                <input type="date" />
              </label>
              <label>
                Purpose
                <input placeholder="Client meeting" />
              </label>
              <label>
                Destination
                <input placeholder="Office, job site, supplier" />
              </label>
              <label>
                Miles
                <input type="number" min="0.1" step="0.1" placeholder="0.0" />
              </label>
            </>
          ) : (
            <>
              <label>
                Date
                <input type="date" />
              </label>
              <label>
                {entryMode} title
                <input placeholder={entryMode === 'Maintenance' ? 'Oil change' : 'Fuel, parking, tolls'} />
              </label>
              <label>
                Vendor
                <input placeholder="Shell, City Garage" />
              </label>
              <label>
                Amount
                <input type="number" min="0.01" step="0.01" placeholder="$0.00" />
              </label>
              <label>
                Notes
                <textarea placeholder="Optional service or purchase note" />
              </label>
            </>
          )}
        </form>

        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="button">
            Save activity
          </button>
        </div>
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

function getEntryIcon(kind: MileageKind) {
  if (kind === 'Trip') return 'T'
  if (kind === 'Maintenance') return 'M'
  return 'E'
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default Mileage
