import { Sparkles, X } from 'lucide-react'

export type UpgradePromptProps = {
  /** Plain-language reason shown above the CTA, e.g. "Recurring transactions
   *  are available on Pro." Never a raw HTTP error string. */
  message: string
  onUpgrade: () => void
  onClose: () => void
}

/**
 * Standardized "this needs Pro" dialog. Used whenever a plan-gated action is
 * blocked -- either proactively (PlanGate) or reactively (an API response
 * with code "feature_requires_plan" / a metered-limit rejection). Never
 * render a raw HTTP error for these cases; always route through this prompt
 * so the messaging and CTA stay consistent app-wide.
 */
function UpgradePrompt({ message, onUpgrade, onClose }: UpgradePromptProps) {
  return (
    <div className="transaction-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="transaction-detail-modal upgrade-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgradePromptTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <span className="status-pill status-draft upgrade-prompt-badge">
              <Sparkles size={14} /> Pro
            </span>
            <h2 id="upgradePromptTitle">Upgrade to Pro</h2>
            <p>{message}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="transaction-detail-body">
          <p>Your existing records remain available either way. Upgrading only unlocks new Pro capacity and tools.</p>
        </div>
        <div className="drawer-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Not now</button>
          <button className="primary-button" type="button" onClick={onUpgrade}>Upgrade to Pro</button>
        </div>
      </section>
    </div>
  )
}

export default UpgradePrompt
