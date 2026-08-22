import { useEffect, useMemo, useRef, useState } from 'react'
import {
  archiveMessage,
  deleteMessage,
  loadArchivedMessages,
  loadInboxMessages,
  loadMessageThread,
  loadSentMessages,
  loadUnreadCounts,
  markMessageRead,
  replyToMessage,
  sendGeneralMessage,
  sendSupportMessage,
  type MessageRecord,
  type MessageType,
  type UnreadCounts,
} from '../lib/messagesApi'

export type MessagesLaneLabel = 'Inbox' | 'Invoices' | 'Support' | 'Notices' | 'Sent' | 'Archived'

export type ComposeMessagePayload = {
  to: string
  cc: string
  subject: string
  body: string
  attachments: File[]
}

type LaneDefinition = {
  label: MessagesLaneLabel
  count: number
}

const EMPTY_UNREAD_COUNTS: UnreadCounts = { total: 0, messages: 0, support: 0, notifications: 0 }

export default function useMessagesPageData() {
  const [selectedThread, setSelectedThread] = useState<MessageRecord | null>(null)
  const [threadMessages, setThreadMessages] = useState<MessageRecord[]>([])
  const [activeLane, setActiveLane] = useState<MessagesLaneLabel>('Inbox')
  const [inbox, setInbox] = useState<MessageRecord[]>([])
  const [sent, setSent] = useState<MessageRecord[]>([])
  const [archived, setArchived] = useState<MessageRecord[]>([])
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>(EMPTY_UNREAD_COUNTS)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread'>('All')
  const [typeFilter, setTypeFilter] = useState<'All' | MessageType>('All')
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  const refreshRequestSeq = useRef(0)
  const threadRequestSeq = useRef(0)

  async function refreshMessages() {
    const requestId = refreshRequestSeq.current + 1
    refreshRequestSeq.current = requestId
    setLoadingData(true)
    setDataError('')
    try {
      const [nextInbox, nextSent, nextArchived, counts] = await Promise.all([
        loadInboxMessages(),
        loadSentMessages(),
        loadArchivedMessages(),
        loadUnreadCounts(),
      ])
      if (requestId !== refreshRequestSeq.current) {
        return
      }
      setInbox(nextInbox)
      setSent(nextSent)
      setArchived(nextArchived)
      setUnreadCounts(counts)
    } catch (error) {
      if (requestId !== refreshRequestSeq.current) {
        return
      }
      setDataError(error instanceof Error ? error.message : 'Unable to load messages.')
      setInbox([])
      setSent([])
      setArchived([])
    } finally {
      if (requestId === refreshRequestSeq.current) {
        setLoadingData(false)
      }
    }
  }

  useEffect(() => {
    void refreshMessages()
  }, [])

  const lanes = useMemo<LaneDefinition[]>(() => {
    const supportCount = inbox.filter((message) => message.type === 'Support').length
    const invoiceCount = inbox.filter((message) => message.type === 'Invoice reply').length
    const noticeCount = inbox.filter((message) => message.type === 'Account notice').length

    return [
      { label: 'Inbox', count: inbox.length || unreadCounts.messages },
      { label: 'Invoices', count: invoiceCount },
      { label: 'Support', count: supportCount || unreadCounts.support },
      { label: 'Notices', count: noticeCount || unreadCounts.notifications },
      { label: 'Sent', count: sent.length },
      { label: 'Archived', count: archived.length },
    ]
  }, [archived.length, inbox, sent.length, unreadCounts])

  const laneMessages = useMemo(() => {
    if (activeLane === 'Sent') return sent
    if (activeLane === 'Archived') return archived
    if (activeLane === 'Invoices') return inbox.filter((message) => message.type === 'Invoice reply')
    if (activeLane === 'Support') return inbox.filter((message) => message.type === 'Support')
    if (activeLane === 'Notices') return inbox.filter((message) => message.type === 'Account notice')
    return inbox
  }, [activeLane, archived, inbox, sent])

  const visibleThreads = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    return laneMessages.filter((message) => {
      const matchesStatus = statusFilter === 'All' || message.unread
      const matchesType = typeFilter === 'All' || message.type === typeFilter
      const matchesSearch = !normalizedSearch || [
        message.sender,
        message.email,
        message.subject,
        message.preview,
        message.type,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))

      return matchesStatus && matchesType && matchesSearch
    })
  }, [laneMessages, searchTerm, statusFilter, typeFilter])

  async function openThread(thread: MessageRecord) {
    const requestId = threadRequestSeq.current + 1
    threadRequestSeq.current = requestId
    setSelectedThread(thread)
    setThreadMessages([])
    try {
      const messages = await loadMessageThread(thread.id)
      if (requestId !== threadRequestSeq.current) {
        return
      }
      setThreadMessages(messages)
      if (thread.unread) {
        await markMessageRead(thread.id)
        if (requestId !== threadRequestSeq.current) {
          return
        }
        void refreshMessages()
      }
    } catch (error) {
      if (requestId !== threadRequestSeq.current) {
        return
      }
      setDataError(error instanceof Error ? error.message : 'Unable to open message.')
    }
  }

  async function archiveThread(thread: MessageRecord) {
    try {
      await archiveMessage(thread.id)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to archive message.')
    }
  }

  async function deleteThread(thread: MessageRecord) {
    try {
      await deleteMessage(thread.id)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to delete message.')
    }
  }

  async function replyToThread(thread: MessageRecord, body: string, attachments: File[]) {
    try {
      await replyToMessage(thread.id, body, attachments)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to send reply.')
    }
  }

  async function sendMessage(mode: 'general' | 'support', payload: ComposeMessagePayload) {
    try {
      if (mode === 'support') {
        await sendSupportMessage(payload.subject, payload.body, payload.attachments)
      } else {
        await sendGeneralMessage(payload.to, payload.cc, payload.subject, payload.body, payload.attachments)
      }
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to send message.')
    }
  }

  return {
    activeLane,
    archiveThread,
    dataError,
    deleteThread,
    dismissDataError: () => setDataError(''),
    lanes,
    loadingData,
    openThread,
    replyToThread,
    searchTerm,
    selectedThread,
    sendMessage,
    setActiveLane,
    setSearchTerm,
    setStatusFilter,
    setTypeFilter,
    statusFilter,
    threadMessages,
    typeFilter,
    visibleThreads,
  }
}
