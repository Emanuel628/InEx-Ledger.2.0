import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Download,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { loadAnalytics, type AnalyticsSummary } from '../lib/analyticsApi'

const emptyAnalytics: AnalyticsSummary = {
  income: 0,
  expenses: 0,
  net: 0,
  taxSetAside: null,
  currentMonthTitle: 'This month',
  currentMonthLabel: '',
  currentIncome: 0,
  currentExpenses: 0,
  currentNet: 0,
  monthProgressPct: 0,
  months: [],
  incomePoints: [],
  expensePoints: [],
  topIncome: [],
  topExpenses: [],
  cashFlow: [],
}

function Analytics(props: PageProps) {
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics)
  const [categoryMode, setCategoryMode] = useState<'Income' | 'Expenses'>('Income')
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')

  useEffect(() => {
    setLoadingData(true)
    setDataError('')
    loadAnalytics()
      .then(setAnalytics)
      .catch((error) => {
        setAnalytics(emptyAnalytics)
        setDataError(error instanceof Error ? error.message : 'Unable to load analytics.')
      })
      .finally(() => setLoadingData(false))
  }, [])

  const categoryRows = categoryMode === 'Income' ? analytics.topIncome : analytics.topExpenses

  return (
    <AppShell {...props} searchPlaceholder="Search analytics, categories, reports">
      <main className="transactions-page analytics-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Performance</p>
            <h1>Analytics</h1>
            <p>Understand performance, trends, and cash movement without digging through reports.</p>
          </div>
          <div className="analytics-heading-actions">
            <button className="secondary-button" type="button">
              <Calendar size={18} />
              Last 12 months
              <ChevronDown size={16} />
            </button>
            <button className="secondary-button" type="button">
              <Download size={18} />
              Export insight
            </button>
          </div>
        </section>

        <section className="summary-strip" aria-label="Analytics summary">
          <SummaryItem label="Income" value={formatMoney(analytics.income)} tone="income" icon={TrendingUp} />
          <SummaryItem label="Expenses" value={formatMoney(analytics.expenses)} tone="expense" icon={TrendingDown} />
          <SummaryItem label="Net profit" value={formatMoney(analytics.net)} tone="net" icon={Wallet} />
          <SummaryItem label="Tax set-aside" value={analytics.taxSetAside === null ? 'Upgrade' : formatMoney(analytics.taxSetAside)} tone="review" icon={ShieldCheck} />
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Refresh the page or check the connected account data.</span>
            </div>
          </section>
        ) : null}

        <section className="analytics-primary-grid">
          <article className="export-card analytics-chart-card">
            <div className="analytics-card-head">
              <h2>Income vs expenses</h2>
              <div className="analytics-legend">
                <span><i className="legend-income" /> Income</span>
                <span><i className="legend-expense" /> Expenses</span>
              </div>
            </div>
            <TrendChart months={analytics.months} incomePoints={analytics.incomePoints} expensePoints={analytics.expensePoints} />
          </article>

          <article className="export-card analytics-month-card">
            <div className="analytics-card-head">
              <h2>{analytics.currentMonthTitle}</h2>
              <span className="analytics-muted">{analytics.currentMonthLabel || 'No activity yet'}</span>
            </div>
            <div className="month-progress">
              <div className="progress-ring">{analytics.monthProgressPct}%</div>
              <div className="progress-copy">
                <span>Month progress</span>
                <div><i style={{ width: `${analytics.monthProgressPct}%` }} /></div>
              </div>
            </div>
            <div className="month-stat income"><span>Income</span><strong>{formatMoney(analytics.currentIncome)}</strong></div>
            <div className="month-stat expense"><span>Expenses</span><strong>{formatMoney(analytics.currentExpenses)}</strong></div>
            <div className="month-stat net"><span>Net</span><strong>{formatMoney(analytics.currentNet)}</strong></div>
          </article>
        </section>

        <section className="analytics-secondary-grid">
          <article className="export-card analytics-categories-card">
            <div className="analytics-card-head">
              <h2>Top categories</h2>
              <div className="analytics-segmented">
                <button className={categoryMode === 'Income' ? 'is-selected' : ''} type="button" onClick={() => setCategoryMode('Income')}>Income</button>
                <button className={categoryMode === 'Expenses' ? 'is-selected' : ''} type="button" onClick={() => setCategoryMode('Expenses')}>Expenses</button>
              </div>
            </div>
            <div className="category-bars">
              {categoryRows.length ? categoryRows.map((row) => (
                <div className="category-bar-row" key={row.name}>
                  <span>{row.name}</span>
                  <div><i style={{ width: `${Math.max(4, row.pct)}%` }} /></div>
                  <strong>{formatMoney(row.amount)}</strong>
                  <em>{row.pct}%</em>
                </div>
              )) : <div className="empty-table-state">{loadingData ? 'Loading categories...' : 'No category activity yet.'}</div>}
            </div>
          </article>

          <article className="export-card analytics-cash-card">
            <div className="analytics-card-head">
              <h2>Cash flow outlook</h2>
              <span className="analytics-muted">Next 3 months</span>
            </div>
            <div className="cash-flow-table">
              {analytics.cashFlow.length ? analytics.cashFlow.map((row) => (
                <div className="cash-flow-row" key={row.month}>
                  <span>{row.month}</span>
                  <strong className={row.tone}>{formatMoney(row.net)}</strong>
                  <em className={row.tone}>{row.risk}</em>
                </div>
              )) : <div className="empty-table-state">{loadingData ? 'Loading outlook...' : 'No cash-flow projection yet.'}</div>}
            </div>
          </article>
        </section>

        <section className="progressive-panels" aria-label="Advanced analytics">
          <ProgressivePanel
            id="monthly"
            title="Monthly breakdown"
            summary="Income, expenses, net"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Review trailing monthly detail after the chart points to a month worth investigating.
          </ProgressivePanel>
          <ProgressivePanel
            id="seasonal"
            title="Seasonal patterns"
            summary="Income by calendar month"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Compare average income by month to spot repeat seasonal peaks and slow periods.
          </ProgressivePanel>
          <ProgressivePanel
            id="whatif"
            title="What-if planner"
            summary="Scenario modeling"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Model income changes, cost cuts, weeks off, and custom monthly income without crowding the dashboard.
          </ProgressivePanel>
        </section>
      </main>
    </AppShell>
  )
}

function TrendChart({
  months,
  incomePoints,
  expensePoints,
}: {
  months: string[]
  incomePoints: number[]
  expensePoints: number[]
}) {
  const width = 760
  const height = 260
  const padding = 34
  const safeMonths = months.length ? months : ['No data']
  const max = Math.max(1, ...incomePoints, ...expensePoints)
  const xStep = safeMonths.length > 1 ? (width - padding * 2) / (safeMonths.length - 1) : 0
  const y = (value: number) => height - padding - (value / max) * (height - padding * 2)
  const points = (values: number[]) => values.map((value, index) => `${padding + index * xStep},${y(value)}`).join(' ')
  const safeIncome = incomePoints.length ? incomePoints : [0]
  const safeExpenses = expensePoints.length ? expensePoints : [0]

  return (
    <svg className="analytics-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Income and expense trend">
      {[0, 1, 2, 3].map((tick) => (
        <line key={tick} x1={padding} x2={width - padding} y1={padding + tick * 52} y2={padding + tick * 52} />
      ))}
      <polyline className="trend-expense" points={points(safeExpenses)} />
      <polyline className="trend-income" points={points(safeIncome)} />
      {safeIncome.map((point, index) => (
        <circle className="dot-income" cx={padding + index * xStep} cy={y(point)} r="4" key={`income-${safeMonths[index]}`} />
      ))}
      {safeExpenses.map((point, index) => (
        <circle className="dot-expense" cx={padding + index * xStep} cy={y(point)} r="4" key={`expense-${safeMonths[index]}`} />
      ))}
      {safeMonths.map((month, index) => (
        <text x={padding + index * xStep} y={height - 8} key={month}>{month}</text>
      ))}
    </svg>
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

function formatMoney(value: number) {
  return value.toLocaleString(getMoneyLocale(), {
    style: 'currency',
    currency: getActiveCurrency(),
    maximumFractionDigits: 0,
  })
}

function getActiveCurrency() {
  return window.__LUNA_ME__?.business?.currency?.toUpperCase() === 'CAD' ? 'CAD' : 'USD'
}

function getMoneyLocale() {
  return getActiveCurrency() === 'CAD' ? 'en-CA' : 'en-US'
}

export default Analytics
