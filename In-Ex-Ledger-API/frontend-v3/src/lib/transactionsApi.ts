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
}

type ListResponse = {
  data: LegacyTransaction[]
  summary?: {
    income_total?: number
    expense_total?: number
    transaction_count?: number
  }
}

export async function loadTransactionPageData() {
  const [transactions, accounts, categories] = await Promise.all([
    apiRequest<ListResponse>('/api/transactions?limit=500&offset=0'),
    apiRequest<{ data: AccountOption[] }>('/api/accounts?limit=500&offset=0'),
    apiRequest<{ data: CategoryOption[] }>('/api/categories?limit=500&offset=0'),
  ])

  return {
    transactions: transactions.data.map(mapTransaction),
    accounts: accounts.data.map((account) => ({ id: account.id, name: account.name })),
    categories: categories.data.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
  }
}

export async function saveTransactionDraft(
  draft: TransactionDraft,
  transaction: Transaction | null,
  accounts: AccountOption[],
  categories: CategoryOption[],
) {
  const kind = draft.kind === 'Income' ? 'income' : 'expense'
  const account = accounts.find((item) => item.name === draft.account)
  const category = categories.find((item) => item.name === draft.category && item.kind === kind)
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

export async function importTransactionsCsv(file: File) {
  const form = new FormData()
  form.append('file', file)
  await apiRequest('/api/transactions/import/csv', {
    method: 'POST',
    body: form,
  })
}

function mapTransaction(row: LegacyTransaction): Transaction {
  const amount = Math.abs(Number(row.amount || 0))
  const signedAmount = row.type === 'income' ? amount : -amount
  const receiptCount = Number(row.receipt_count || 0)
  const status = mapStatus(row, receiptCount)

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
  }
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
