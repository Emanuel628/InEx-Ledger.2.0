import { apiRequest } from './apiClient'

export type TransactionStatus = 'Cleared' | 'Needs review' | 'Missing receipt' | 'Draft'

export type Transaction = {
  id: string
  accountId: string
  categoryId: string
  dateIso: string
  date: string
  description: string
  category: string
  account: string
  receipt: 'Attached' | 'Missing' | 'Uploaded'
  status: TransactionStatus
  amount: number
  merchantTone: string
  note: string
  cleared: boolean
  reviewStatus: string
  reviewNotes: string
  reviewIssues: ReviewQueueItem[]
}

export type TransactionDraft = {
  kind: 'Income' | 'Expense'
  amount: string
  description: string
  date: string
  category: string
  account: string
  note: string
}

export type AccountOption = {
  id: string
  name: string
}

export type CategoryOption = {
  id: string
  name: string
  kind: 'income' | 'expense'
}

export type BusinessTaxProfile = {
  region: 'US' | 'CA'
  province: string
  rate: number
  label: string
  note: string
}

export type ReviewQueueItem = {
  id: string
  description: string
  reviewStatus: string
  issueLabels: string[]
  issueEntries: {
    issueCode?: string
    label?: string
    severity?: string
    issueSeverity?: string
    explanation?: string
    blocksExport?: boolean
  }[]
  quickAction?: {
    label?: string
    action?: string
    supportType?: string
    href?: string
  } | null
  categoryReason?: unknown
  supportSummary?: unknown
  reviewNotes?: unknown
  receiptAttached?: boolean
}

export type ReviewQueueResponse = {
  queue: ReviewQueueItem[]
  summary?: {
    total?: number
    actionNeededCount?: number
    needsReviewCount?: number
    missingReceiptCount?: number
    missingCategoryCount?: number
  }
}

export type RecurringTemplate = {
  id: string
  accountId: string
  categoryId: string
  amount: number
  type: 'income' | 'expense'
  description: string
  note: string
  cadence: string
  startDate: string
  nextRunDate: string
  endDate: string
  lastRunDate: string
  clearedDefault: boolean
  active: boolean
}

export type RecurringTemplateDraft = {
  kind: 'Income' | 'Expense'
  amount: string
  description: string
  accountId: string
  categoryId: string
  cadence: string
  startDate: string
  endDate: string
  note: string
  clearedDefault: boolean
  active: boolean
}

type LegacyTransaction = {
  id: string
  account_id: string
  account_name?: string | null
  category_id: string
  category_name?: string | null
  amount: number | string
  type: 'income' | 'expense'
  cleared?: boolean
  description?: string | null
  date: string
  note?: string | null
  receipt_count?: number
  review_status?: string | null
  review_notes?: string | null
}

type ListResponse = {
  data: LegacyTransaction[]
  summary?: {
    income_total?: number
    expense_total?: number
    transaction_count?: number
  }
}

type LegacyBusiness = {
  region?: string | null
  country?: string | null
  province?: string | null
}

type LegacyRecurringTemplate = {
  id: string
  account_id?: string | null
  category_id?: string | null
  amount?: number | string
  type?: 'income' | 'expense'
  description?: string | null
  note?: string | null
  cadence?: string | null
  start_date?: string | null
  next_run_date?: string | null
  end_date?: string | null
  last_run_date?: string | null
  cleared_default?: boolean
  active?: boolean
}

export type CsvImportResult = {
  imported?: number
  skipped?: number
  out_of_range?: number
  truncated?: boolean
  truncated_at?: number
  errors?: { reason?: string }[]
}

export async function loadTransactionPageData() {
  const [transactions, accounts, categories, business, reviewQueue, recurringTemplates] = await Promise.all([
    apiRequest<ListResponse>('/api/transactions?limit=500&offset=0'),
    apiRequest<{ data: AccountOption[] }>('/api/accounts?limit=500&offset=0'),
    apiRequest<{ data: CategoryOption[] }>('/api/categories?limit=500&offset=0'),
    apiRequest<LegacyBusiness>('/api/business').catch(() => null),
    apiRequest<ReviewQueueResponse>('/api/review/queue').catch(() => ({ queue: [] })),
    apiRequest<LegacyRecurringTemplate[]>('/api/recurring').catch(() => []),
  ])
  const reviewItemsByTransaction = new Map(
    (reviewQueue.queue || []).map((item) => [String(item.id), item]),
  )

  return {
    transactions: transactions.data.map((transaction) => mapTransaction(transaction, reviewItemsByTransaction)),
    accounts: accounts.data.map((account) => ({ id: account.id, name: account.name })),
    categories: categories.data.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
    taxProfile: resolveEstimatedTaxProfile(business),
    reviewQueue,
    recurringTemplates: recurringTemplates.map(mapRecurringTemplate),
  }
}

export async function saveTransactionDraft(
  draft: TransactionDraft,
  transaction: Transaction | null,
  accounts: AccountOption[],
  categories: CategoryOption[],
) {
  const kind = draft.kind === 'Income' ? 'income' : 'expense'
  const account = transaction && transaction.account === draft.account
    ? { id: transaction.accountId, name: transaction.account }
    : accounts.find((item) => item.name === draft.account)
  const category = transaction && transaction.category === draft.category
    ? { id: transaction.categoryId, name: transaction.category, kind }
    : categories.find((item) => item.name === draft.category && item.kind === kind)
    || categories.find((item) => item.name === draft.category)
  const amount = Number(draft.amount.replace(/[$,]/g, ''))

  if (!account) {
    throw new Error('Choose an account before saving.')
  }
  if (!category) {
    throw new Error('Choose a category before saving.')
  }
  if (!draft.description.trim() || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Add a description and a valid amount.')
  }

  const body = JSON.stringify({
    account_id: account.id,
    category_id: category.id,
    amount,
    type: kind,
    date: draft.date || new Date().toISOString().slice(0, 10),
    cleared: transaction?.cleared ?? kind === 'income',
    description: draft.description.trim(),
    note: draft.note.trim(),
  })

  const saved = transaction
    ? await apiRequest<LegacyTransaction>(`/api/transactions/${transaction.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyTransaction>('/api/transactions', { method: 'POST', body })

  return mapTransaction(saved)
}

export async function deleteTransaction(transactionId: string) {
  await apiRequest(`/api/transactions/${transactionId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason: 'Deleted from v3 transactions page.' }),
  })
}

export async function undoDeletedTransaction() {
  const response = await apiRequest<{
    transaction?: LegacyTransaction
    remaining_undo_count?: number
  }>('/api/transactions/undo-delete', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return {
    transaction: response.transaction ? mapTransaction(response.transaction) : null,
    remainingUndoCount: Number(response.remaining_undo_count || 0),
  }
}

export async function loadTransactionUndoStatus() {
  const response = await apiRequest<{ remaining_undo_count?: number }>('/api/transactions/undo-delete-status')
  return Number(response.remaining_undo_count || 0)
}

export async function importTransactionsCsv(input: {
  file: File
  accountId: string
  startDate?: string
  endDate?: string
}) {
  const form = new FormData()
  form.append('file', input.file)
  form.append('account_id', input.accountId)
  if (input.startDate) {
    form.append('start_date', input.startDate)
  }
  if (input.endDate) {
    form.append('end_date', input.endDate)
  }

  return apiRequest<CsvImportResult>('/api/transactions/import/csv', {
    method: 'POST',
    body: form,
  })
}

export async function updateRecurringTemplateStatus(templateId: string, active: boolean) {
  const template = await apiRequest<LegacyRecurringTemplate>(`/api/recurring/${templateId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
  return mapRecurringTemplate(template)
}

export async function saveRecurringTemplateDraft(draft: RecurringTemplateDraft, template: RecurringTemplate | null) {
  const amount = Number(draft.amount.replace(/[$,]/g, ''))
  if (!draft.description.trim() || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Add a description and a valid recurring amount.')
  }
  if (!draft.accountId) {
    throw new Error('Select an account for this recurring template.')
  }
  if (!draft.categoryId) {
    throw new Error('Select a category for this recurring template.')
  }
  if (!draft.startDate) {
    throw new Error('Choose a start date.')
  }
  if (draft.endDate && draft.endDate < draft.startDate) {
    throw new Error('End date must be on or after the start date.')
  }

  const body = JSON.stringify({
    account_id: draft.accountId,
    category_id: draft.categoryId,
    amount,
    type: draft.kind === 'Income' ? 'income' : 'expense',
    description: draft.description.trim(),
    note: draft.note.trim(),
    cadence: draft.cadence,
    start_date: draft.startDate,
    end_date: draft.endDate || '',
    cleared_default: draft.clearedDefault,
    active: draft.active,
  })

  const saved = template
    ? await apiRequest<LegacyRecurringTemplate>(`/api/recurring/${template.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyRecurringTemplate>('/api/recurring', { method: 'POST', body })
  return mapRecurringTemplate(saved)
}

export async function runRecurringTemplate(templateId: string) {
  const response = await apiRequest<{ created?: boolean; recurring?: LegacyRecurringTemplate }>(`/api/recurring/${templateId}/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return {
    created: response.created === true,
    recurring: response.recurring ? mapRecurringTemplate(response.recurring) : null,
  }
}

export async function deleteRecurringTemplate(templateId: string) {
  await apiRequest(`/api/recurring/${templateId}`, { method: 'DELETE' })
}

function mapTransaction(row: LegacyTransaction, reviewItemsByTransaction = new Map<string, ReviewQueueItem>()): Transaction {
  const amount = Math.abs(Number(row.amount || 0))
  const signedAmount = row.type === 'income' ? amount : -amount
  const receiptCount = Number(row.receipt_count || 0)
  const status = mapStatus(row, receiptCount)
  const reviewItem = reviewItemsByTransaction.get(String(row.id))

  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
    dateIso: String(row.date || '').slice(0, 10),
    date: formatShortDate(String(row.date || '').slice(0, 10)),
    description: row.description || 'Untitled transaction',
    category: row.category_name || 'Uncategorized',
    account: row.account_name || 'Account',
    receipt: receiptCount > 0 ? 'Attached' : 'Missing',
    status,
    amount: signedAmount,
    merchantTone: row.type === 'income' ? 'green' : status === 'Cleared' ? 'blue' : 'red',
    note: row.note || '',
    cleared: Boolean(row.cleared),
    reviewStatus: row.review_status || '',
    reviewNotes: row.review_notes || '',
    reviewIssues: reviewItem ? [reviewItem] : [],
  }
}

function mapRecurringTemplate(row: LegacyRecurringTemplate): RecurringTemplate {
  return {
    id: row.id,
    accountId: row.account_id || '',
    categoryId: row.category_id || '',
    amount: Number(row.amount || 0),
    type: row.type === 'income' ? 'income' : 'expense',
    description: row.description || 'Recurring transaction',
    note: row.note || '',
    cadence: row.cadence || 'monthly',
    startDate: String(row.start_date || '').slice(0, 10),
    nextRunDate: String(row.next_run_date || '').slice(0, 10),
    endDate: String(row.end_date || '').slice(0, 10),
    lastRunDate: String(row.last_run_date || '').slice(0, 10),
    clearedDefault: row.cleared_default === true,
    active: row.active === true,
  }
}

function resolveEstimatedTaxProfile(business: LegacyBusiness | null): BusinessTaxProfile {
  const region = String(business?.region || business?.country || 'US').toUpperCase() === 'CA' ? 'CA' : 'US'
  const province = String(business?.province || '').toUpperCase()
  const rate = region === 'CA' ? estimatedCanadianRate(province) : 0.24
  const label = region === 'CA'
    ? `${province || 'Canada'} estimated tax`
    : 'US Schedule C estimate'
  const note = region === 'CA'
    ? 'Draft T2125 tracking estimate based on your business profile.'
    : 'Draft Schedule C estimate based on net profit using a 24% buffer.'
  return { region, province, rate, label, note }
}

function estimatedCanadianRate(province: string) {
  const rates: Record<string, number> = {
    AB: 0.05,
    BC: 0.12,
    MB: 0.12,
    NB: 0.15,
    NL: 0.15,
    NS: 0.15,
    NT: 0.05,
    NU: 0.05,
    ON: 0.13,
    PE: 0.15,
    QC: 0.14975,
    SK: 0.11,
    YT: 0.05,
  }
  return rates[province] || 0.05
}

function mapStatus(row: LegacyTransaction, receiptCount: number): TransactionStatus {
  if (String(row.review_status || '') === 'needs_review') {
    return 'Needs review'
  }
  if (row.type === 'expense' && receiptCount === 0) {
    return 'Missing receipt'
  }
  if (row.cleared) {
    return 'Cleared'
  }
  return 'Draft'
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'Today'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
