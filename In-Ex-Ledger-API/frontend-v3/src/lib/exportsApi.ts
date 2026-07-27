import { apiBlobRequest, apiRequest } from './apiClient'

export type ExportFormat = 'pdf' | 'csv_basic' | 'csv_full' | 'csv_excluded' | 'csv_category_summary'
export type ExportMode = 'draft' | 'workpaper' | 'finalized'

export type ExportSettings = {
  startDate: string
  endDate: string
  exportType: ExportFormat
  exportMode: ExportMode
  language: string
  currency: string
  includeTaxId: boolean
  taxId: string
  certifiedByUser: boolean
}

export type ExportDatasetSummary = {
  income: number
  expenses: number
  netProfit: number
  readinessIssues: number
  missingReceiptCount: number
  needsCategoryCount: number
  taxForm: string
  currency: string
}

export type ExportHistoryItem = {
  id: string
  name: string
  format: 'PDF' | 'CSV'
  mode: string
  period: string
  status: 'Current' | 'Stale'
  generated: string
}

type DatasetResponse = {
  totals?: {
    grossIncome?: number
    totalExpenses?: number
    netProfit?: number
    missingReceiptCount?: number
    needsCategoryCount?: number
    openHardReviewerIssueCount?: number
    openWarningReviewerIssueCount?: number
  }
  metadata?: {
    taxForm?: string
    currency?: string
  }
}

type GrantResponse = {
  grantToken: string
}

type PublicKeyResponse = {
  kid: string
  jwk: JsonWebKey
}

type LegacyHistory = {
  id: string
  filename?: string | null
  export_type?: string | null
  export_mode?: string | null
  start_date?: string | null
  end_date?: string | null
  created_at?: string | null
  snapshot_status?: string | null
  invalidated_at?: string | null
}

export async function loadExportPageData(startDate: string, endDate: string) {
  const params = new URLSearchParams({ startDate, endDate })
  const [dataset, history] = await Promise.all([
    apiRequest<DatasetResponse>(`/api/exports/dataset?${params.toString()}`),
    apiRequest<LegacyHistory[]>('/api/exports/history'),
  ])

  return {
    summary: mapDatasetSummary(dataset),
    history: history.map(mapHistoryItem),
  }
}

export async function generateExport(settings: ExportSettings) {
  if (!settings.startDate || !settings.endDate) {
    throw new Error('Choose a start and end date before exporting.')
  }
  if (settings.includeTaxId && settings.exportType !== 'pdf') {
    throw new Error('Tax ID can only be included on PDF exports.')
  }
  if (settings.includeTaxId && !settings.certifiedByUser) {
    throw new Error('Certify the sensitive identifier before generating this PDF.')
  }

  const grant = await apiRequest<GrantResponse>('/api/exports/request-grant', {
    method: 'POST',
    body: JSON.stringify({
      exportType: settings.exportType,
      includeTaxId: settings.includeTaxId,
      dateRange: {
        startDate: settings.startDate,
        endDate: settings.endDate,
      },
      language: settings.language,
      currency: settings.currency,
      templateVersion: 'v1',
    }),
  })

  const taxId_jwe = settings.includeTaxId ? await encryptTaxId(settings.taxId.trim()) : ''
  const blob = await apiBlobRequest('/api/exports/generate', {
    method: 'POST',
    body: JSON.stringify({
      grantToken: grant.grantToken,
      exportMode: settings.exportMode,
      ...(taxId_jwe ? { taxId_jwe } : {}),
      ...(settings.certifiedByUser ? { certifiedByUser: true } : {}),
    }),
  })

  downloadBlob(blob, buildExportFilename(settings))
}

export async function downloadRedactedExport(exportId: string) {
  const blob = await apiBlobRequest(`/api/exports/history/${encodeURIComponent(exportId)}/redacted`)
  downloadBlob(blob, 'inex-ledger-redacted-export.pdf')
}

export async function downloadCsvExport(exportId: string, filename: string) {
  const blob = await apiBlobRequest(`/api/exports/history/${encodeURIComponent(exportId)}/csv`)
  downloadBlob(blob, filename)
}

export async function deleteExportHistoryItem(exportId: string) {
  await apiRequest(`/api/exports/history/${encodeURIComponent(exportId)}`, { method: 'DELETE' })
}

function mapDatasetSummary(dataset: DatasetResponse): ExportDatasetSummary {
  const totals = dataset.totals || {}
  const missingReceiptCount = Number(totals.missingReceiptCount || 0)
  const needsCategoryCount = Number(totals.needsCategoryCount || 0)
  const reviewerIssues = Number(totals.openHardReviewerIssueCount || 0) + Number(totals.openWarningReviewerIssueCount || 0)

  return {
    income: Number(totals.grossIncome || 0),
    expenses: Number(totals.totalExpenses || 0),
    netProfit: Number(totals.netProfit || 0),
    readinessIssues: missingReceiptCount + needsCategoryCount + reviewerIssues,
    missingReceiptCount,
    needsCategoryCount,
    taxForm: dataset.metadata?.taxForm || 'Schedule C',
    currency: dataset.metadata?.currency || 'USD',
  }
}

function mapHistoryItem(item: LegacyHistory): ExportHistoryItem {
  const exportType = String(item.export_type || 'pdf').toLowerCase()
  const status = item.invalidated_at || item.snapshot_status === 'stale' ? 'Stale' : 'Current'
  return {
    id: item.id,
    name: item.filename || defaultHistoryName(exportType, item.start_date, item.end_date),
    format: exportType === 'pdf' ? 'PDF' : 'CSV',
    mode: formatMode(item.export_mode || (exportType === 'pdf' ? 'workpaper' : 'draft')),
    period: formatPeriod(item.start_date, item.end_date),
    status,
    generated: formatDate(item.created_at || ''),
  }
}

async function encryptTaxId(taxId: string) {
  if (!taxId) {
    throw new Error('Enter the sensitive identifier for this PDF.')
  }

  const { jwk, kid } = await apiRequest<PublicKeyResponse>('/api/crypto/export-public-key')
  if (!window.crypto?.subtle) {
    throw new Error('Secure browser cryptography is unavailable in this environment.')
  }

  const publicKey = await window.crypto.subtle.importKey(
    'jwk',
    { ...jwk, ext: false },
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  )
  const symKey = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt'])
  const rawSymKey = await window.crypto.subtle.exportKey('raw', symKey)
  const encryptedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawSymKey)
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    alg: 'RSA-OAEP-256',
    enc: 'A256GCM',
    typ: 'JWE',
    kid,
  })))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const ciphertextWithTag = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
      additionalData: new TextEncoder().encode(encodedHeader),
    },
    symKey,
    new TextEncoder().encode(taxId),
  )
  const bytes = new Uint8Array(ciphertextWithTag)
  const tag = bytes.slice(bytes.length - 16)
  const ciphertext = bytes.slice(0, bytes.length - 16)

  return [
    encodedHeader,
    base64UrlEncode(encryptedKey),
    base64UrlEncode(iv),
    base64UrlEncode(ciphertext),
    base64UrlEncode(tag),
  ].join('.')
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function buildExportFilename(settings: ExportSettings) {
  const extension = settings.exportType === 'pdf' ? 'pdf' : 'csv'
  return `inex-ledger-export-${settings.startDate}_to_${settings.endDate}.${extension}`
}

function defaultHistoryName(exportType: string, startDate?: string | null, endDate?: string | null) {
  return `${exportType === 'pdf' ? 'PDF export' : 'CSV export'} - ${formatPeriod(startDate, endDate)}`
}

function formatPeriod(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) {
    return 'Unknown period'
  }
  return `${formatDate(startDate)} - ${formatDate(endDate)}`
}

function formatMode(mode: string) {
  if (mode === 'finalized') return 'Finalized'
  if (mode === 'draft') return 'Draft'
  return 'CPA workpaper'
}

function formatDate(value: string) {
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
