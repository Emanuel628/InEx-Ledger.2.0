import type { PlanUsageMetric } from '../lib/planApi'

export type UsageMeterProps = {
  label: string
  metric: PlanUsageMetric | null | undefined
}

function formatResetDate(resetsAt?: string) {
  if (!resetsAt) return ''
  const date = new Date(resetsAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

/**
 * Shows "used of limit" plus a non-blocking warning near the cap for a single
 * metered Basic resource (transactions, receipts). Renders nothing meaningful
 * for Pro/Business, where `metric.limit` is null (unmetered) -- it just shows
 * a plain usage count with no bar, matching "Basic monthly limits removed"
 * messaging instead of implying a cap that doesn't exist.
 */
function UsageMeter({ label, metric }: UsageMeterProps) {
  if (!metric) {
    return null
  }

  const resetLabel = formatResetDate(metric.resetsAt)

  if (metric.limit === null) {
    return (
      <div className="usage-meter usage-meter-unmetered">
        <div className="usage-meter-head">
          <span>{label}</span>
          <strong>{metric.used} used</strong>
        </div>
        <p className="usage-meter-caption">No monthly limit on Pro.</p>
      </div>
    )
  }

  const percent = metric.limit > 0 ? Math.min(100, Math.round((metric.used / metric.limit) * 100)) : 0
  const atLimit = (metric.remaining ?? 0) <= 0
  const nearLimit = !atLimit && percent >= 80

  return (
    <div className={`usage-meter ${atLimit ? 'usage-meter-at-limit' : nearLimit ? 'usage-meter-near-limit' : ''}`}>
      <div className="usage-meter-head">
        <span>{label}</span>
        <strong>{metric.used} of {metric.limit} used</strong>
      </div>
      <div className="usage-meter-track">
        <div className="usage-meter-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="usage-meter-caption">
        {atLimit
          ? `You've used all ${metric.limit} this month. Your existing records remain available.${resetLabel ? ` Resets ${resetLabel}.` : ''}`
          : nearLimit
            ? `Getting close to your monthly limit.${resetLabel ? ` Resets ${resetLabel}.` : ''}`
            : resetLabel
              ? `Resets ${resetLabel}.`
              : ''}
      </p>
    </div>
  )
}

export default UsageMeter
