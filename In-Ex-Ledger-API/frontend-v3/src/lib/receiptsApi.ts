import { apiRequest } from './apiClient'

export type ReceiptLinkState = 'Linked' | 'Unlinked'

export type ReceiptRecord = {
  id: string
  fileName: string
  uploadedAt: string
  date: string
  linkedTransactionId: string | null
  linkedTransaction: string
  linkState: ReceiptLinkState
  tone: string
  isViewable: boolean
  url: string
}

export type TransactionLinkOption = {
  id: string
  label: string
}

type LegacyReceipt = {
  id: string
  filename?: string | null
  uploaded_at?: string | null
  created_at?: string | null
  transaction_id?: string | null
  is_viewable?: boolean
  url?: string
}

type LegacyTransaction = {
  id: string
  description?: string | null
  amount?: number | string
  type?: 'income' | 'expense'
  date?: string
}

export async function loadReceiptPageData() {
  const [receipts, transactions] = await Promise.all([
    apiRequest<LegacyReceipt[]>('/api/receipts'),
    apiRequest<{ data: LegacyTransaction[] }>('/api/transactions?limit=500&offset=0'),
  ])
  const transactionOptions = transactions.data.map(mapTransactionOption)
  const transactionLabels = new Map(transactionOptions.map((transaction) => [transaction.id, transaction.label]))

  return {
    receipts: receipts.map((receipt) => mapReceipt(receipt, transactionLabels)),
    transactions: transactionOptions,
  }
}

export async function uploadReceipt(file: File, transactionId: string) {
  const form = new FormData()
  form.append('receipt', file)
  if (transactionId) {
    form.append('transaction_id', transactionId)
  }

  const saved = await apiRequest<LegacyReceipt>('/api/receipts', {
    method: 'POST',
    body: form,
  })
  return saved
}

export async function attachReceipt(receiptId: string, transactionId: string | null) {
  const saved = await apiRequest<{ id: string; transaction_id: string | null }>(`/api/receipts/${receiptId}/attach`, {
    method: 'PATCH',
    body: JSON.stringify({ transaction_id: transactionId }),
  })
  return saved
}

export async function deleteReceipt(receiptId: string) {
  await apiRequest(`/api/receipts/${receiptId}`, { method: 'DELETE' })
}

function mapReceipt(row: LegacyReceipt, transactionLabels: Map<string, string>): ReceiptRecord {
  const linkedTransactionId = row.transaction_id || null
  const uploadedAt = row.uploaded_at || row.created_at || ''
  return {
    id: row.id,
    fileName: row.filename || 'Receipt',
    uploadedAt,
    date: formatShortDate(uploadedAt),
    linkedTransactionId,
    linkedTransaction: linkedTransactionId ? transactionLabels.get(linkedTransactionId) || 'Linked transaction' : 'Not linked',
    linkState: linkedTransactionId ? 'Linked' : 'Unlinked',
    tone: linkedTransactionId ? 'green' : 'yellow',
    isViewable: row.is_viewable !== false,
    url: row.url || `/api/receipts/${row.id}`,
  }
}

function mapTransactionOption(transaction: LegacyTransaction): TransactionLinkOption {
  const amount = Math.abs(Number(transaction.amount || 0)).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
  const sign = transaction.type === 'expense' ? '-' : ''
  const date = String(transaction.date || '').slice(0, 10)
  return {
    id: transaction.id,
    label: `${transaction.description || 'Untitled transaction'} - ${sign}${amount}${date ? ` - ${date}` : ''}`,
  }
}

function formatShortDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
