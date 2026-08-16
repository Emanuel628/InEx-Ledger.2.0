import { apiRequest } from './apiClient'

export type PlanCode = 'free' | 'v1' | 'business'

export const PLAN_FEATURE_KEYS = [
  'transactions',
  'receipts',
  'csv_imports',
  'accounts',
  'categories',
  'mileage',
  'invoices',
  'basic_analytics',
  'basic_csv_export',
  'recurring_transactions',
  'tax_estimates',
  'pdf_exports',
  'advanced_exports',
  'export_history',
  'edge_case_tools',
  'additional_businesses',
] as const

export type PlanFeatureKey =
  typeof PLAN_FEATURE_KEYS[number]

export const PLAN_FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  transactions: 'Transactions',
  receipts: 'Receipt uploads',
  csv_imports: 'CSV imports',
  accounts: 'Accounts',
  categories: 'Categories',
  mileage: 'Mileage tracking',
  invoices: 'Invoicing',
  basic_analytics: 'Analytics',
  basic_csv_export: 'CSV export',
  recurring_transactions: 'Recurring transactions',
  tax_estimates: 'Tax estimates',
  pdf_exports: 'PDF exports',
  advanced_exports: 'Advanced exports',
  export_history: 'Export history',
  edge_case_tools: 'Advanced tools',
  additional_businesses: 'Additional businesses',
}

export type PlanFeatures = Record<PlanFeatureKey, boolean>

export type PlanUsageMetric = {
  limit: number | null
  used: number
  remaining: number | null
  resetsAt: string
}

export type PlanInfo = {
  code: PlanCode
  name: string
  status: string
  isPaid: boolean
  isTrialing: boolean
  cancelAtPeriodEnd: boolean
}

export type PlanBusinessCapacity = {
  included: number
  additional: number
  maximum: number
  active: number
}

export type PlanUpgradeInfo = {
  available: boolean
  targetPlan: PlanCode
  targetName: string
}

export type PlanContextData = {
  plan: PlanInfo
  features: PlanFeatures
  usage: {
    transactions: PlanUsageMetric
    receipts: PlanUsageMetric
  }
  businessCapacity: PlanBusinessCapacity
  upgrade: PlanUpgradeInfo
}

/** Canonical plan/entitlement snapshot for the current business. The backend
 *  (routes/entitlements.routes.js + config/planCatalog.js) is the sole source
 *  of truth -- this call is the only thing the frontend plan provider needs. */
export async function loadPlanContext() {
  return apiRequest<PlanContextData>('/api/entitlements/plan-context')
}
