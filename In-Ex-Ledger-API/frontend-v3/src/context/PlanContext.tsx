import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadPlanContext, type PlanContextData, type PlanFeatureKey } from '../lib/planApi'
import type { AuthUser } from '../lib/authApi'

export type PlanContextValue = {
  /** Full plan snapshot from the backend, or null while loading / signed out. */
  plan: PlanContextData | null
  loading: boolean
  error: string
  /** True once `plan.plan.code` resolves to anything other than Basic ("free"). */
  isPro: boolean
  hasFeature: (feature: PlanFeatureKey) => boolean
  /** Re-fetches /api/entitlements/plan-context. Call after any action that can
   *  change plan/usage (checkout, cancellation, creating a transaction/receipt,
   *  etc.) so usage meters and gates reflect the latest state. */
  refreshPlanContext: () => Promise<void>
}

const PlanReactContext = createContext<PlanContextValue | null>(null)

/**
 * Loads and shares the canonical plan/entitlement snapshot for the signed-in
 * user's active business. This is presentation-only: the backend
 * (requirePlanFeature middleware + config/planCatalog.js) remains the sole
 * authority on what a request is actually allowed to do. This provider just
 * lets pages show usage meters and Pro gates without each one re-fetching or
 * re-deriving plan state independently.
 */
export function PlanProvider({ authUser, children }: { authUser: AuthUser | null; children: ReactNode }) {
  const [plan, setPlan] = useState<PlanContextData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshPlanContext = useCallback(async () => {
    if (!authUser) {
      setPlan(null)
      setError('')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await loadPlanContext()
      setPlan(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan.')
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }, [authUser])

  // Plan entitlements are scoped to the active business, so switching
  // businesses must refresh even when the signed-in user id is unchanged.
  const authUserId = authUser?.id
  const currentBusinessId = authUser?.currentBusinessId
  useEffect(() => {
    void refreshPlanContext()
  }, [authUserId, currentBusinessId])

  const hasFeature = useCallback(
    (feature: PlanFeatureKey) => Boolean(plan?.features?.[feature]),
    [plan],
  )

  const value = useMemo<PlanContextValue>(() => ({
    plan,
    loading,
    error,
    isPro: plan ? plan.plan.code !== 'free' : false,
    hasFeature,
    refreshPlanContext,
  }), [plan, loading, error, hasFeature, refreshPlanContext])

  return <PlanReactContext.Provider value={value}>{children}</PlanReactContext.Provider>
}

export function usePlan() {
  const context = useContext(PlanReactContext)
  if (!context) {
    throw new Error('usePlan() must be used within a <PlanProvider>.')
  }
  return context
}
