import { apiRequest } from './apiClient'

export type AnalyticsSummary = {
  income: number
  expenses: number
  net: number
  taxSetAside: number | null
  currentMonthTitle: string
  currentMonthLabel: string
  currentIncome: number
  currentExpenses: number
  currentNet: number
  monthProgressPct: number
  months: string[]
  incomePoints: number[]
  expensePoints: number[]
  topIncome: AnalyticsCategoryRow[]
  topExpenses: AnalyticsCategoryRow[]
  cashFlow: AnalyticsCashFlowRow[]
}

export type AnalyticsCategoryRow = {
  name: string
  amount: number
  pct: number
}

export type AnalyticsCashFlowRow = {
  month: string
  net: number
  risk: 'Low' | 'Moderate' | 'High'
  tone: 'income' | 'review' | 'expense'
}

type DashboardResponse = {
  summary?: {
    total_income?: number
    total_expense?: number
    net?: number
    se_tax_estimate?: number | null
  }
  current_month?: {
    title?: string
    label?: string
    income?: number
    expense?: number
    net?: number
    days_elapsed?: number
    days_in_month?: number
  }
  monthly_breakdown?: Array<{
    month: string
    income: number
    expense: number
  }>
  top_income_sources?: Array<{ category: string; total: number }>
  top_expense_categories?: Array<{ category: string; total: number }>
}

type CashFlowResponse = {
  projections?: Array<{
    month: string
    projected_net: number
    risk_notification?: string | null
  }>
}

export async function loadAnalytics() {
  const [dashboard, cashFlow] = await Promise.all([
    apiRequest<DashboardResponse>('/api/analytics/dashboard'),
    apiRequest<CashFlowResponse>('/api/analytics/cash-flow'),
  ])

  const monthly = dashboard.monthly_breakdown || []
  return {
    income: Number(dashboard.summary?.total_income || 0),
    expenses: Number(dashboard.summary?.total_expense || 0),
    net: Number(dashboard.summary?.net || 0),
    taxSetAside: dashboard.summary?.se_tax_estimate ?? null,
    currentMonthTitle: dashboard.current_month?.title || 'This month',
    currentMonthLabel: dashboard.current_month?.label || '',
    currentIncome: Number(dashboard.current_month?.income || 0),
    currentExpenses: Number(dashboard.current_month?.expense || 0),
    currentNet: Number(dashboard.current_month?.net || 0),
    monthProgressPct: calculateMonthProgress(dashboard.current_month?.days_elapsed, dashboard.current_month?.days_in_month),
    months: monthly.map((row) => formatMonthLabel(row.month)),
    incomePoints: monthly.map((row) => Number(row.income || 0)),
    expensePoints: monthly.map((row) => Number(row.expense || 0)),
    topIncome: mapCategoryRows(dashboard.top_income_sources || []),
    topExpenses: mapCategoryRows(dashboard.top_expense_categories || []),
    cashFlow: (cashFlow.projections || []).map((row) => {
      const net = Number(row.projected_net || 0)
      const risk = row.risk_notification ? (net < 0 ? 'High' : 'Moderate') : 'Low'
      return {
        month: formatMonthLabel(row.month),
        net,
        risk,
        tone: risk === 'High' ? 'expense' : risk === 'Moderate' ? 'review' : 'income',
      }
    }),
  } satisfies AnalyticsSummary
}

/**
 * Fetches only the backend-computed self-employment tax set-aside estimate
 * (GET /api/analytics/dashboard's summary.se_tax_estimate), without the
 * extra cash-flow request loadAnalytics() also makes. Used by pages that
 * want to show this same figure without pulling in the full Analytics
 * dataset -- see Transactions.tsx, which previously computed its own
 * estimate client-side using hardcoded, unmaintained tax-bracket rates that
 * could (and did) disagree with this real backend figure.
 */
export async function loadTaxSetAside(): Promise<number | null> {
  const dashboard = await apiRequest<DashboardResponse>('/api/analytics/dashboard')
  return dashboard.summary?.se_tax_estimate ?? null
}

function mapCategoryRows(rows: Array<{ category: string; total: number }>) {
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0)
  return rows.map((row) => ({
    name: row.category || 'Uncategorized',
    amount: Number(row.total || 0),
    pct: total > 0 ? Number((Number(row.total || 0) / total * 100).toFixed(1)) : 0,
  }))
}

function calculateMonthProgress(daysElapsed?: number, daysInMonth?: number) {
  if (!daysElapsed || !daysInMonth) {
    return 0
  }
  return Math.min(100, Math.max(0, Math.round(daysElapsed / daysInMonth * 100)))
}

function formatMonthLabel(value: string) {
  const parsed = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value || 'Unknown'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}
