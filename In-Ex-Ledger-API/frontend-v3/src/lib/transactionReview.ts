import type { Transaction } from './transactionsApi'

export function reviewLabelsFor(transaction: Transaction) {
  return normalizeReviewLabels(transaction.reviewIssues.flatMap((issue) => {
    const directLabels = issue.issueLabels?.map(reviewText).filter(Boolean) || []
    const entryLabels = issue.issueEntries?.map((entry) => reviewText(entry.label) || reviewText(entry.issueCode)).filter(Boolean) || []
    const summaries = [issue.supportSummary, issue.reviewNotes].map(reviewText).filter(Boolean)

    return [...directLabels, ...entryLabels, ...summaries]
  }), transaction.description)
}

export function normalizeReviewLabels(labels: string[], description = '') {
  const seen = new Set<string>()
  const hasDescription = hasUsableDescription(description)
  return labels
    .map((label) => reviewText(label).trim())
    .map(canonicalReviewLabel)
    .filter((label) => {
      if (!label || /^mapped$/i.test(label)) return false
      const key = reviewLabelKey(label)
      if (key === 'description' && hasDescription) return false
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function reviewText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(reviewText).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return reviewText(record.summary)
      || [reviewText(record.reasonLabel), reviewText(record.confidenceLabel)].filter(Boolean).join(' - ')
      || reviewText(record.label)
      || reviewText(record.code)
      || ''
  }
  return ''
}

export function hasReviewFor(labels: string[], patterns: RegExp[]) {
  return labels.some((label) => patterns.some((pattern) => pattern.test(label)))
}

function canonicalReviewLabel(label: string) {
  if (/description|merchant|vendor|memo|payer/i.test(label) && /missing|required|needed|blank|empty|add/i.test(label)) {
    return 'Description is missing'
  }
  if (/receipt|support|source document|proof/i.test(label) && /missing|required|needed|attach|upload/i.test(label)) {
    return 'Receipt or support missing'
  }
  if (/category|tax mapping|tax line|deduct/i.test(label) && /missing|required|needed|map|uncategorized/i.test(label)) {
    return 'Tax mapping needed'
  }
  return label
}

function reviewLabelKey(label: string) {
  if (/^description is missing$/i.test(label)) return 'description'
  if (/^receipt or support missing$/i.test(label)) return 'receipt_support'
  if (/^tax mapping needed$/i.test(label)) return 'tax_mapping'
  return label.toLowerCase()
}

function hasUsableDescription(description: string) {
  const normalized = description.trim().toLowerCase()
  return Boolean(normalized && normalized !== 'untitled transaction' && normalized !== '(no description)')
}
