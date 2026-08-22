import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Download,
  Lock,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import { loadAnalytics, type AnalyticsSummary } from '../lib/analyticsApi'
import { downloadCsv as downloadCsvFile } from '../lib/browserDownload'
import { formatMoney as sharedFormatMoney, getActiveCurrency } from '../lib/money'

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
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(emptyAnalytics)
  const [categoryMode, setCategoryMode] = useState<'Income' | 'Expenses'>('Income')
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const [periodModalOpen, setPeriodModalOpen] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)

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
  const hasCurrentMonthActivity = analytics.currentIncome > 0 || analytics.currentExpenses > 0
  const monthProgressPct = hasCurrentMonthActivity ? analytics.monthProgressPct : 0

  return (
    <AppShell
      {...props}
      overlay={
        <>
          {periodModalOpen ? <AnalyticsPeriodModal analytics={analytics} onClose={() => setPeriodModalOpen(false)} /> : null}
          {exportModalOpen ? <AnalyticsExportModal analytics={analytics} onClose={() => setExportModalOpen(false)} /> : null}
        </>
      }
    >
      <main className="transactions-page analytics-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Performance</p>
            <h1>Analytics</h1>
            <p>Understand performance, trends, and cash movement without digging through reports.</p>
          </div>
          <div className="analytics-heading-actions">
            <button className="secondary-button" type="button" onClick={() => setPeriodModalOpen(true)}>
              <Calendar size={18} />
              Last 12 months
              <ChevronDown size={16} />
            </button>
            <button className="secondary-button" type="button" onClick={() => setExportModalOpen(true)}>
              <Download size={18} />
              Export insight
            </button>
          </div>
        </section>

        <section className="summary-strip" aria-label="Analytics summary">
          <SummaryItem label="Income" value={formatMoney(analytics.income)} tone="income" icon={TrendingUp} />
          <SummaryItem label="Expenses" value={formatMoney(analytics.expenses)} tone="expense" icon={TrendingDown} />
          <SummaryItem label="Net profit" value={formatMoney(analytics.net)} tone="net" icon={Wallet} />
          <SummaryItem label="Tax set-aside" value={analytics.taxSetAside === null ? null : formatMoney(analytics.taxSetAside)} tone="review" icon={ShieldCheck} />
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
              <div className="progress-ring">{monthProgressPct}%</div>
              <div className="progress-copy">
                <span>Month progress</span>
                <div><i style={{ width: `${monthProgressPct}%` }} /></div>
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
              <h2>Estimated cash flow</h2>
              <span className="analytics-muted">Next 3 months, based on your recent activity</span>
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

function SummaryItem({ label, value, tone, icon: Icon }: { label: string; value: string | null; tone: string; icon: LucideIcon }) {
  return (
    <article className={`summary-item tone-${tone}`}>
      <div className="summary-icon">
        <Icon size={24} />
      </div>
      <div>
        <span>{label}</span>
        {value === null ? (
          <span className="summary-locked-value">
            <Lock size={13} /> Pro feature
          </span>
        ) : (
          <strong>{value}</strong>
        )}
      </div>
    </article>
  )
}

function AnalyticsPeriodModal({ analytics, onClose }: { analytics: AnalyticsSummary; onClose: () => void }) {
  const rows = analytics.months.map((month, index) => ({
    month,
    income: analytics.incomePoints[index] || 0,
    expenses: analytics.expensePoints[index] || 0,
    net: (analytics.incomePoints[index] || 0) - (analytics.expensePoints[index] || 0),
  }))

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="center-modal analytics-modal" role="dialog" aria-modal="true" aria-labelledby="analyticsPeriodTitle" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Analytics range</p>
            <h2 id="analyticsPeriodTitle">Last 12 months</h2>
            <p>Monthly income, expenses, and net from the same data powering the chart.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close analytics range" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="analytics-modal-table">
          {rows.length ? rows.map((row) => (
            <div className="analytics-modal-row" key={row.month}>
              <strong>{row.month}</strong>
              <span>{formatMoney(row.income)} income</span>
              <span>{formatMoney(row.expenses)} expenses</span>
              <em className={row.net >= 0 ? 'income' : 'expense'}>{formatMoney(row.net)} net</em>
            </div>
          )) : <div className="empty-table-state">No monthly analytics available yet.</div>}
        </div>
      </section>
    </div>
  )
}

function AnalyticsExportModal({ analytics, onClose }: { analytics: AnalyticsSummary; onClose: () => void }) {
  const rows = analytics.months.map((month, index) => ({
    month,
    income: analytics.incomePoints[index] || 0,
    expenses: analytics.expensePoints[index] || 0,
    net: (analytics.incomePoints[index] || 0) - (analytics.expensePoints[index] || 0),
  }))

  function downloadCsv() {
    downloadCsvFile(
      [
        ['Month', 'Income', 'Expenses', 'Net'],
        ...rows.map((row) => [row.month, row.income, row.expenses, row.net]),
      ],
      'inex-ledger-analytics-insights.csv'
    )
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="center-modal analytics-modal" role="dialog" aria-modal="true" aria-labelledby="analyticsExportTitle" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Export</p>
            <h2 id="analyticsExportTitle">Export insights</h2>
            <p>Download the current analytics summary as a CSV for review or sharing.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close export insights" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <section className="invoice-total-preview">
          <div><span>Income</span><strong>{formatMoney(analytics.income)}</strong></div>
          <div><span>Expenses</span><strong>{formatMoney(analytics.expenses)}</strong></div>
          <div><span>Net</span><strong>{formatMoney(analytics.net)}</strong></div>
        </section>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" onClick={downloadCsv}>
            <Download size={18} />
            Download CSV
          </button>
        </div>
      </section>
    </div>
  )
}

function formatMoney(value: number) {
  return sharedFormatMoney(value, getActiveCurrency(), { maximumFractionDigits: 0 })
}

export default Analytics
