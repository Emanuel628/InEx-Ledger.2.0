import { apiRequest } from './apiClient'

export type InvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Void'

export type InvoiceRecord = {
  id: string
  title: string
  invoiceNumber: string
  client: string
  clientEmail: string
  issueDate: string
  dueDate: string
  due: string
  status: InvoiceStatus
  amount: number
  currency: string
  taxRate: number
  notes: string
  lineItems: InvoiceLineItem[]
  tone: string
}

export type InvoiceLineItem = {
  description: string
  quantity: number
  unitPrice: number
}

export type InvoiceDraft = {
  title: string
  lineItemDescription: string
  clientName: string
  clientEmail: string
  issueDate: string
  dueDate: string
  currency: string
  taxRatePercent: string
  quantity: string
  unitPrice: string
  notes: string
  ccEmails: string
}

type LegacyInvoice = {
  id: string
  title?: string | null
  invoice_number?: string | null
  customer_name?: string | null
  customer_email?: string | null
  issue_date?: string | null
  due_date?: string | null
  status?: string | null
  currency?: string | null
  tax_rate?: number | string | null
  total_amount?: number | string | null
  notes?: string | null
  line_items?: InvoiceLineItem[] | string | null
}

export async function loadInvoices() {
  const invoices = await apiRequest<LegacyInvoice[]>('/api/invoices-v1')
  return invoices.map(mapInvoice)
}

export async function saveInvoiceDraft(draft: InvoiceDraft, invoice: InvoiceRecord | null, sendAfterSave: boolean, attachments?: File[]) {
  if (!draft.title.trim()) {
    throw new Error('Invoice title is required.')
  }
  if (!draft.clientName.trim()) {
    throw new Error('Client name is required.')
  }
  const quantity = Number(draft.quantity || 1)
  const unitPrice = Number(draft.unitPrice || 0)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than 0.')
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Unit price must be 0 or greater.')
  }

  const body = JSON.stringify({
    title: draft.title.trim(),
    customer_name: draft.clientName.trim(),
    customer_email: draft.clientEmail.trim(),
    issue_date: draft.issueDate,
    due_date: draft.dueDate || null,
    currency: draft.currency,
    tax_rate: Number(draft.taxRatePercent || 0) / 100,
    notes: draft.notes.trim(),
    status: invoice?.status === 'Sent' ? 'sent' : 'draft',
    line_items: [
      {
        description: draft.lineItemDescription.trim() || draft.title.trim(),
        quantity,
        unit_price: unitPrice,
      },
    ],
  })

  const saved = invoice
    ? await apiRequest<LegacyInvoice>(`/api/invoices-v1/${invoice.id}`, { method: 'PUT', body })
    : await apiRequest<LegacyInvoice>('/api/invoices-v1', { method: 'POST', body })

  if (sendAfterSave) {
    await sendInvoice(saved.id, draft.clientEmail, draft.ccEmails, attachments)
    const refreshed = await apiRequest<LegacyInvoice>(`/api/invoices-v1/${saved.id}`)
    return mapInvoice(refreshed)
  }

  return mapInvoice(saved)
}

export async function sendInvoice(invoiceId: string, recipientEmail: string, ccEmails = '', attachments?: File[]) {
  if (attachments?.length) {
    const form = new FormData()
    form.append('recipient_email', recipientEmail)
    form.append('cc_emails', ccEmails)
    attachments.forEach((file) => form.append('attachments', file))
    await apiRequest(`/api/invoices-v1/${invoiceId}/send`, { method: 'POST', body: form })
    return
  }

  await apiRequest(`/api/invoices-v1/${invoiceId}/send`, {
    method: 'POST',
    body: JSON.stringify({
      recipient_email: recipientEmail,
      cc_emails: ccEmails,
    }),
  })
}

export async function updateInvoiceStatus(invoiceId: string, status: 'draft' | 'sent' | 'paid' | 'void') {
  const saved = await apiRequest<LegacyInvoice>(`/api/invoices-v1/${invoiceId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  return mapInvoice(saved)
}

export async function deleteInvoice(invoiceId: string) {
  await apiRequest(`/api/invoices-v1/${invoiceId}`, { method: 'DELETE' })
}

export function blankInvoiceDraft(currency = 'USD'): InvoiceDraft {
  return {
    title: '',
    lineItemDescription: '',
    clientName: '',
    clientEmail: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    currency: currency.toUpperCase() === 'CAD' ? 'CAD' : 'USD',
    taxRatePercent: '0',
    quantity: '1',
    unitPrice: '',
    notes: '',
    ccEmails: '',
  }
}

export function draftFromInvoice(invoice: InvoiceRecord): InvoiceDraft {
  const lineItem = invoice.lineItems[0]
  return {
    title: invoice.title,
    lineItemDescription: lineItem?.description || '',
    clientName: invoice.client,
    clientEmail: invoice.clientEmail,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    taxRatePercent: String(Number(invoice.taxRate || 0) * 100),
    quantity: String(lineItem?.quantity || 1),
    unitPrice: String(lineItem?.unitPrice || ''),
    notes: invoice.notes,
    ccEmails: '',
  }
}

function mapInvoice(row: LegacyInvoice): InvoiceRecord {
  const lineItems = parseLineItems(row.line_items)
  const status = mapStatus(row.status, row.due_date)
  return {
    id: row.id,
    title: row.title || lineItems[0]?.description || row.invoice_number || 'Untitled invoice',
    invoiceNumber: row.invoice_number || '',
    client: row.customer_name || 'Client',
    clientEmail: row.customer_email || '',
    issueDate: String(row.issue_date || '').slice(0, 10),
    dueDate: String(row.due_date || '').slice(0, 10),
    due: formatDate(String(row.due_date || '').slice(0, 10)),
    status,
    amount: Number(row.total_amount || 0),
    currency: row.currency || 'USD',
    taxRate: Number(row.tax_rate || 0),
    notes: row.notes || '',
    lineItems,
    tone: toneForStatus(status),
  }
}

function parseLineItems(value: LegacyInvoice['line_items']): InvoiceLineItem[] {
  if (Array.isArray(value)) {
    return value.map(normalizeLineItem)
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(normalizeLineItem) : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeLineItem(item: Record<string, unknown>): InvoiceLineItem {
  return {
    description: String(item.description || 'Invoice item'),
    quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unit_price || item.unitPrice || 0),
  }
}

function mapStatus(status?: string | null, dueDate?: string | null): InvoiceStatus {
  const normalized = String(status || 'draft').toLowerCase()
  if (normalized === 'paid') return 'Paid'
  if (normalized === 'void') return 'Void'
  if (normalized === 'sent' && dueDate && String(dueDate).slice(0, 10) < new Date().toISOString().slice(0, 10)) {
    return 'Overdue'
  }
  if (normalized === 'sent') return 'Sent'
  return 'Draft'
}

function toneForStatus(status: InvoiceStatus) {
  if (status === 'Paid') return 'green'
  if (status === 'Overdue') return 'red'
  if (status === 'Sent') return 'violet'
  if (status === 'Void') return 'yellow'
  return 'blue'
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'No due date'
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
