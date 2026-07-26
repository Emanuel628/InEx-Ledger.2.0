import { apiRequest } from './apiClient'

export type AccountStatus = 'Active' | 'Needs details' | 'Archived'

export type AccountRecord = {
  id: string
  name: string
  type: 'Checking' | 'Savings' | 'Credit Card' | 'Cash' | 'Loan' | 'Other'
  transactionCount: number
  status: AccountStatus
  tone: string
}

export type AccountDraft = {
  name: string
  type: AccountRecord['type'] | ''
}

type LegacyAccount = {
  id: string
  name: string
  type: string
  transaction_count?: number
}

export async function loadAccounts() {
  const [accounts, transactions] = await Promise.all([
    apiRequest<{ data: LegacyAccount[] }>('/api/accounts?limit=500&offset=0'),
    apiRequest<{ data: Array<{ account_id?: string | null }> }>('/api/transactions?limit=500&offset=0'),
  ])
  const transactionCounts = transactions.data.reduce((counts, transaction) => {
    if (transaction.account_id) {
      counts.set(transaction.account_id, (counts.get(transaction.account_id) || 0) + 1)
    }
    return counts
  }, new Map<string, number>())

  return accounts.data.map((account) => mapAccount(account, transactionCounts.get(account.id) || 0))
}

export async function saveAccountDraft(draft: AccountDraft, account: AccountRecord | null) {
  if (!draft.name.trim()) {
    throw new Error('Account name is required.')
  }
  if (!draft.type) {
    throw new Error('Choose an account type.')
  }

  const body = JSON.stringify({
    name: draft.name.trim(),
    type: mapTypeToLegacy(draft.type),
  })

  const saved = account
    ? await apiRequest<LegacyAccount>(`/api/accounts/${account.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyAccount>('/api/accounts', { method: 'POST', body })

  return mapAccount(saved, account?.transactionCount || 0)
}

export async function deleteAccount(accountId: string) {
  await apiRequest(`/api/accounts/${accountId}`, { method: 'DELETE' })
}

function mapAccount(row: LegacyAccount, transactionCount = Number(row.transaction_count || 0)): AccountRecord {
  const type = mapTypeFromLegacy(row.type)
  return {
    id: row.id,
    name: row.name,
    type,
    transactionCount,
    status: 'Active',
    tone: toneForType(type),
  }
}

function mapTypeFromLegacy(type: string): AccountRecord['type'] {
  switch (String(type || '').toLowerCase()) {
    case 'checking':
      return 'Checking'
    case 'savings':
      return 'Savings'
    case 'credit_card':
    case 'credit card':
      return 'Credit Card'
    case 'cash':
      return 'Cash'
    case 'loan':
      return 'Loan'
    default:
      return 'Other'
  }
}

function mapTypeToLegacy(type: AccountRecord['type']) {
  switch (type) {
    case 'Credit Card':
      return 'credit_card'
    case 'Other':
      return 'custom'
    default:
      return type.toLowerCase().replace(/\s+/g, '_')
  }
}

function toneForType(type: AccountRecord['type']) {
  if (type === 'Credit Card') return 'violet'
  if (type === 'Cash') return 'yellow'
  if (type === 'Loan') return 'coral'
  if (type === 'Savings') return 'green'
  return 'blue'
}
