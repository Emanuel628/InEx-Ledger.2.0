import type { ReviewQueueResponse } from '../../lib/transactionsApi'
import { normalizeReviewLabels, reviewText } from '../../lib/transactionReview'

type ReviewQueuePanelProps = {
  reviewQueue: ReviewQueueResponse
  onOpenTransaction: (transactionId: string) => void
  onAttachReceipt: (transactionId: string) => void
  onManageCategories: () => void
}

export default function ReviewQueuePanel({
  reviewQueue,
  onOpenTransaction,
  onAttachReceipt,
  onManageCategories,
}: ReviewQueuePanelProps) {
  const items = (reviewQueue.queue || []).slice(0, 5)
  if (!items.length) {
    return <p className="progressive-panel-note">No missing categories, receipts, or support items right now.</p>
  }

  return (
    <div className="review-queue-list">
      {items.map((item) => {
        const labels = normalizeReviewLabels(
          item.issueLabels.length
            ? item.issueLabels
            : item.issueEntries.map((entry) => entry.label || entry.issueCode || 'Review needed'),
          item.description,
        )
        const actionLabel = item.quickAction?.label || 'Review'

        return (
          <article className="review-queue-item" key={item.id}>
            <div>
              <strong>{item.description}</strong>
              <span>{labels.slice(0, 2).join(', ')}</span>
              {reviewText(item.categoryReason) ? <small>Mapping: {reviewText(item.categoryReason)}</small> : null}
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                if (item.quickAction?.supportType === 'receipt' || labels.some((label) => /receipt/i.test(label))) {
                  onAttachReceipt(item.id)
                } else if (labels.some((label) => /category|tax mapping/i.test(label))) {
                  onManageCategories()
                } else {
                  onOpenTransaction(item.id)
                }
              }}
            >
              {actionLabel}
            </button>
          </article>
        )
      })}
    </div>
  )
}
