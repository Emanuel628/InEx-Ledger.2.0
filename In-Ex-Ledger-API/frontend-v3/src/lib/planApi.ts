import { apiRequest } from './apiClient'

export type PlanCode = 'free' | 'v1' | 'business'

export type PlanFeatureKey =
  | 'transactions'
  | 'receipts'
  | 'csv_imports'
  | 'accounts'
  | 'categories'
  | 'mileage'
  | 'invoices'
  | 'basic_analytics'
  | 'basic_csv_export'
  | 'recurring_transactions'
  | 'tax_estimates'
  | 'pdf_exports'
  | 'advanced_exports'
  | 'export_history'
  | 'edge_case_tools'
  | 'additional_businesses'

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
