import { apiRequest } from './apiClient'

export type MessageType = 'Invoice reply' | 'Support' | 'Account notice' | 'General'

export type MessageRecord = {
  id: string
  senderId: string | null
  receiverId: string | null
  sender: string
  email: string
  subject: string
  preview: string
  body: string
  type: MessageType
  date: string
  unread: boolean
  archived: boolean
  tone: string
  threadCount: number
}

export type UnreadCounts = {
  total: number
  messages: number
  support: number
  notifications: number
}

type LegacyMessage = {
  id: string
  sender_id?: string | null
  receiver_id?: string | null
  sender_name?: string | null
  sender_email?: string | null
  external_sender_name?: string | null
  external_sender_email?: string | null
  receiver_name?: string | null
  receiver_email?: string | null
  message_type?: string | null
  subject?: string | null
  body?: string | null
  is_read?: boolean | null
  is_archived?: boolean | null
  created_at?: string | null
  thread_count?: number | null
}

type MessagesResponse = { messages: LegacyMessage[] }
type ThreadResponse = { thread: LegacyMessage[] }

export async function loadInboxMessages() {
  const data = await apiRequest<MessagesResponse>('/api/messages/inbox')
  return data.messages.map(mapMessage)
}

export async function loadSentMessages() {
  const data = await apiRequest<MessagesResponse>('/api/messages/sent')
  return data.messages.map(mapMessage)
}

export async function loadArchivedMessages() {
  const data = await apiRequest<MessagesResponse>('/api/messages/archived')
  return data.messages.map(mapMessage)
}

export async function loadMessageThread(messageId: string) {
  const data = await apiRequest<ThreadResponse>(`/api/messages/${messageId}/thread`)
  return data.thread.map(mapMessage)
}

export async function loadUnreadCounts() {
  return apiRequest<UnreadCounts>('/api/messages/unread-count')
}

export async function sendGeneralMessage(toEmail: string, ccEmail: string, subject: string, body: string) {
  const recipients = [toEmail, ccEmail].filter((value) => value.trim()).join(', ')
  await apiRequest('/api/messages/send-email', {
    method: 'POST',
    body: JSON.stringify({
      to_email: recipients,
      message_type: 'general',
      subject,
      body,
    }),
  })
}

export async function sendSupportMessage(subject: string, body: string) {
  await apiRequest('/api/messages/support-email', {
    method: 'POST',
    body: JSON.stringify({ subject, body }),
  })
}

export async function replyToMessage(messageId: string, body: string) {
  await apiRequest(`/api/messages/${messageId}/reply-email`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export async function archiveMessage(messageId: string) {
  await apiRequest(`/api/messages/${messageId}/archive`, { method: 'PATCH' })
}

export async function markMessageRead(messageId: string) {
  await apiRequest(`/api/messages/${messageId}/read`, { method: 'PATCH' })
}

export async function deleteMessage(messageId: string) {
  await apiRequest(`/api/messages/${messageId}`, { method: 'DELETE' })
}

function mapMessage(row: LegacyMessage): MessageRecord {
  const type = mapType(row.message_type)
  const sender = row.sender_name || row.external_sender_name || row.external_sender_email || row.receiver_name || 'Message'
  const email = row.sender_email || row.external_sender_email || row.receiver_email || ''
  const body = row.body || ''

  return {
    id: row.id,
    senderId: row.sender_id || null,
    receiverId: row.receiver_id || null,
    sender,
    email,
    subject: row.subject || 'No subject',
    preview: body.replace(/\s+/g, ' ').trim(),
    body,
    type,
    date: formatMessageDate(row.created_at),
    unread: row.is_read === false || false,
    archived: Boolean(row.is_archived),
    tone: toneForType(type),
    threadCount: Number(row.thread_count || 1),
  }
}

function mapType(value?: string | null): MessageType {
  const normalized = String(value || 'general').toLowerCase()
  if (normalized === 'invoice_sent' || normalized === 'invoice_reply') return 'Invoice reply'
  if (normalized === 'it_support' || normalized === 'support_request') return 'Support'
  if (normalized === 'notification') return 'Account notice'
  return 'General'
}

function toneForType(type: MessageType) {
  if (type === 'Invoice reply') return 'blue'
  if (type === 'Support') return 'gold'
  if (type === 'Account notice') return 'purple'
  return 'green'
}

function formatMessageDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)

  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
