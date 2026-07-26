import { useState } from 'react'
import {
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

const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const incomePoints = [42, 55, 50, 58, 66, 53, 62, 67, 82, 63, 71, 84]
const expensePoints = [18, 23, 20, 22, 25, 18, 23, 24, 30, 22, 24, 28]

const categoryRows = [
  { name: 'Software Services', amount: '$68,420', pct: '47.9%', width: '92%' },
  { name: 'Consulting', amount: '$36,180', pct: '25.3%', width: '64%' },
  { name: 'Subscriptions', amount: '$18,650', pct: '13.0%', width: '36%' },
  { name: 'Other Income', amount: '$19,610', pct: '13.8%', width: '42%' },
]

const cashFlowRows = [
  { month: 'Jul 2026', net: '$12,400', risk: 'Low', tone: 'income' },
  { month: 'Aug 2026', net: '$8,200', risk: 'Moderate', tone: 'review' },
  { month: 'Sep 2026', net: '$4,100', risk: 'High', tone: 'expense' },
]

function Analytics(props: PageProps) {
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)

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
          <SummaryItem label="Income" value="$142,860" tone="income" icon={TrendingUp} />
          <SummaryItem label="Expenses" value="$68,430" tone="expense" icon={TrendingDown} />
          <SummaryItem label="Net profit" value="$74,430" tone="net" icon={Wallet} />
          <SummaryItem label="Tax set-aside" value="$18,600" tone="review" icon={ShieldCheck} />
        </section>

        <section className="analytics-primary-grid">
          <article className="export-card analytics-chart-card">
            <div className="analytics-card-head">
              <h2>Income vs expenses</h2>
              <div className="analytics-legend">
                <span><i className="legend-income" /> Income</span>
                <span><i className="legend-expense" /> Expenses</span>
              </div>
            </div>
            <TrendChart />
          </article>

          <article className="export-card analytics-month-card">
            <div className="analytics-card-head">
              <h2>This month</h2>
              <span className="analytics-muted">25 of 31 days</span>
            </div>
            <div className="month-progress">
              <div className="progress-ring">81%</div>
              <div className="progress-copy">
                <span>Month progress</span>
                <div><i style={{ width: '81%' }} /></div>
              </div>
            </div>
            <div className="month-stat income"><span>Income</span><strong>$18,420</strong></div>
            <div className="month-stat expense"><span>Expenses</span><strong>$7,420</strong></div>
            <div className="month-stat net"><span>Net</span><strong>$11,000</strong></div>
          </article>
        </section>

        <section className="analytics-secondary-grid">
          <article className="export-card analytics-categories-card">
            <div className="analytics-card-head">
              <h2>Top categories</h2>
              <div className="analytics-segmented">
                <button className="is-selected" type="button">Income</button>
                <button type="button">Expenses</button>
              </div>
            </div>
            <div className="category-bars">
              {categoryRows.map((row) => (
                <div className="category-bar-row" key={row.name}>
                  <span>{row.name}</span>
                  <div><i style={{ width: row.width }} /></div>
                  <strong>{row.amount}</strong>
                  <em>{row.pct}</em>
                </div>
              ))}
            </div>
          </article>

          <article className="export-card analytics-cash-card">
            <div className="analytics-card-head">
              <h2>Cash flow outlook</h2>
              <span className="analytics-muted">Next 3 months</span>
            </div>
            <div className="cash-flow-table">
              {cashFlowRows.map((row) => (
                <div className="cash-flow-row" key={row.month}>
                  <span>{row.month}</span>
                  <strong className={row.tone}>{row.net}</strong>
                  <em className={row.tone}>{row.risk}</em>
                </div>
              ))}
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

function TrendChart() {
  const width = 760
  const height = 260
  const padding = 34
  const max = 90
  const xStep = (width - padding * 2) / (months.length - 1)
  const y = (value: number) => height - padding - (value / max) * (height - padding * 2)
  const points = (values: number[]) => values.map((value, index) => `${padding + index * xStep},${y(value)}`).join(' ')

  return (
    <svg className="analytics-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Income and expense trend">
      {[0, 1, 2, 3].map((tick) => (
        <line key={tick} x1={padding} x2={width - padding} y1={padding + tick * 52} y2={padding + tick * 52} />
      ))}
      <polyline className="trend-expense" points={points(expensePoints)} />
      <polyline className="trend-income" points={points(incomePoints)} />
      {incomePoints.map((point, index) => (
        <circle className="dot-income" cx={padding + index * xStep} cy={y(point)} r="4" key={`income-${months[index]}`} />
      ))}
      {expensePoints.map((point, index) => (
        <circle className="dot-expense" cx={padding + index * xStep} cy={y(point)} r="4" key={`expense-${months[index]}`} />
      ))}
      {months.map((month, index) => (
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

export default Analytics
