import { useState, type ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { usePlan } from '../context/PlanContext'
import { PLAN_FEATURE_LABELS, type PlanFeatureKey } from '../lib/planApi'
import UpgradePrompt from './UpgradePrompt'

export type PlanGateProps = {
  feature: PlanFeatureKey
  children: ReactNode
  /** Rendered instead of `children` when the feature is unavailable. Defaults
   *  to a small inline "Pro" badge + button that opens the upgrade prompt. */
  fallback?: ReactNode
  onUpgrade?: () => void
}

/**
 * Presentation-only gate for a single plan feature. This never enforces
 * anything by itself -- the backend (requirePlanFeature middleware) is the
 * real authority, and always re-checks on the actual request. This component
 * only avoids showing an action a user's current plan can't use, replacing it
 * with a clear, non-error upgrade affordance instead.
 */
function PlanGate({ feature, children, fallback, onUpgrade }: PlanGateProps) {
  const { hasFeature, loading } = usePlan()
  const [promptOpen, setPromptOpen] = useState(false)

  if (loading) {
    return null
  }

  if (hasFeature(feature)) {
    return <>{children}</>
  }

  if (fallback !== undefined) {
    return <>{fallback}</>
  }

  const label = PLAN_FEATURE_LABELS[feature] || 'This feature'

  return (
    <>
      <button
        type="button"
        className="plan-gate-locked-button"
        onClick={() => {
          if (onUpgrade) {
            onUpgrade()
            return
          }
          setPromptOpen(true)
        }}
      >
        <Sparkles size={14} />
        <span>{label} is on Pro</span>
      </button>
      {!onUpgrade && promptOpen ? (
        <UpgradePrompt
          message={`${label} ${label.endsWith('s') ? 'are' : 'is'} available on Pro.`}
          onClose={() => setPromptOpen(false)}
          onUpgrade={() => {
            setPromptOpen(false)
            window.location.assign('/upgrade')
          }}
        />
      ) : null}
    </>
  )
}

export default PlanGate
