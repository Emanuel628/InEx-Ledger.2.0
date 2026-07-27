import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  Archive,
  ChevronDown,
  FileText,
  Headphones,
  Mail,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { PageProps } from '../App'
import AppShell from '../components/AppShell'
import useOutsideActionMenu from '../hooks/useOutsideActionMenu'
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

const MAX_REPLY_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_MESSAGE_ATTACHMENTS = 5

type LaneLabel = 'Inbox' | 'Invoices' | 'Support' | 'Notices' | 'Sent' | 'Archived'

const laneIcons: Record<LaneLabel, LucideIcon> = {
  Inbox: Mail,
  Invoices: FileText,
  Support: Headphones,
  Notices: Archive,
  Sent: Send,
  Archived: Archive,
}

function Messages(props: PageProps) {
  const [selectedThread, setSelectedThread] = useState<MessageRecord | null>(null)
  const [threadMessages, setThreadMessages] = useState<MessageRecord[]>([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeType, setComposeType] = useState<'general' | 'support'>('general')
  const [lanesCollapsed, setLanesCollapsed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [activeLane, setActiveLane] = useState<LaneLabel>('Inbox')
  const [inbox, setInbox] = useState<MessageRecord[]>([])
  const [sent, setSent] = useState<MessageRecord[]>([])
  const [archived, setArchived] = useState<MessageRecord[]>([])
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({ total: 0, messages: 0, support: 0, notifications: 0 })
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Unread'>('All')
  const [typeFilter, setTypeFilter] = useState<'All' | MessageType>('All')
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState('')
  useOutsideActionMenu(Boolean(actionMenuId || filtersOpen), () => {
    setActionMenuId(null)
    setFiltersOpen(false)
  })

  async function refreshMessages() {
    setLoadingData(true)
    setDataError('')
    try {
      const [nextInbox, nextSent, nextArchived, counts] = await Promise.all([
        loadInboxMessages(),
        loadSentMessages(),
        loadArchivedMessages(),
        loadUnreadCounts(),
      ])
      setInbox(nextInbox)
      setSent(nextSent)
      setArchived(nextArchived)
      setUnreadCounts(counts)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load messages.')
      setInbox([])
      setSent([])
      setArchived([])
    } finally {
      setLoadingData(false)
    }
  }

  useEffect(() => {
    void refreshMessages()
  }, [])

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', detailOpen || composeOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [detailOpen, composeOpen])

  const lanes = useMemo(() => {
    const supportCount = inbox.filter((message) => message.type === 'Support').length
    const invoiceCount = inbox.filter((message) => message.type === 'Invoice reply').length
    const noticeCount = inbox.filter((message) => message.type === 'Account notice').length

    return [
      { label: 'Inbox' as const, count: inbox.length || unreadCounts.messages, icon: laneIcons.Inbox },
      { label: 'Invoices' as const, count: invoiceCount, icon: laneIcons.Invoices },
      { label: 'Support' as const, count: supportCount || unreadCounts.support, icon: laneIcons.Support },
      { label: 'Notices' as const, count: noticeCount || unreadCounts.notifications, icon: laneIcons.Notices },
      { label: 'Sent' as const, count: sent.length, icon: laneIcons.Sent },
      { label: 'Archived' as const, count: archived.length, icon: laneIcons.Archived },
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
    setSelectedThread(thread)
    setThreadMessages([])
    setDetailOpen(true)
    try {
      const messages = await loadMessageThread(thread.id)
      setThreadMessages(messages)
      if (thread.unread) {
        await markMessageRead(thread.id)
        void refreshMessages()
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to open message.')
    }
  }

  async function handleArchive(thread: MessageRecord) {
    try {
      await archiveMessage(thread.id)
      setDetailOpen(false)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to archive message.')
    }
  }

  async function handleDelete(thread: MessageRecord) {
    if (!window.confirm(`Delete "${thread.subject}"?`)) {
      return
    }
    try {
      await deleteMessage(thread.id)
      setDetailOpen(false)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to delete message.')
    }
  }

  async function handleReply(thread: MessageRecord, body: string, attachments: File[]) {
    try {
      await replyToMessage(thread.id, body, attachments)
      setDetailOpen(false)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to send reply.')
    }
  }

  async function handleCompose(payload: { to: string; cc: string; subject: string; body: string; attachments: File[] }) {
    try {
      if (composeType === 'support') {
        await sendSupportMessage(payload.subject, payload.body, payload.attachments)
      } else {
        await sendGeneralMessage(payload.to, payload.cc, payload.subject, payload.body, payload.attachments)
      }
      setComposeOpen(false)
      await refreshMessages()
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to send message.')
    }
  }

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search messages, clients, invoices"
      overlay={
        <>
          {detailOpen && selectedThread ? (
            <MessageDetailModal
              thread={selectedThread}
              messages={threadMessages}
              onArchive={handleArchive}
              onClose={() => setDetailOpen(false)}
              onDelete={handleDelete}
              onReply={handleReply}
            />
          ) : null}
          {composeOpen ? (
            <ComposeModal
              mode={composeType}
              onClose={() => setComposeOpen(false)}
              onSend={handleCompose}
            />
          ) : null}
        </>
      }
    >
      <main className="transactions-page messages-page">
        <section className="page-heading messages-heading">
          <div>
            <p className="eyebrow">Inbox</p>
            <h1>Messages</h1>
            <p>Handle invoice replies, support, and account notices without living in email.</p>
          </div>
          <div className="messages-heading-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setComposeType('support')
                setComposeOpen(true)
              }}
            >
              <Headphones size={18} />
              Request support
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setComposeType('general')
                setComposeOpen(true)
              }}
            >
              <Plus size={18} />
              Compose
            </button>
          </div>
        </section>

        {dataError ? (
          <section className="top-alert" role="alert">
            <Mail size={18} />
            <div>
              <strong>{dataError}</strong>
              <span>Try again or refresh the page.</span>
            </div>
            <button className="top-alert-close" type="button" aria-label="Dismiss message warning" onClick={() => setDataError('')}>
              <X size={16} />
            </button>
          </section>
        ) : null}

        <section className={`messages-workspace ${lanesCollapsed ? 'message-lanes-are-collapsed' : ''}`} aria-label="Message center">
          <aside className="message-lanes" aria-label="Message lanes">
            <div className="message-lanes-header">
              <span>Mailboxes</span>
              <button
                type="button"
                aria-label={lanesCollapsed ? 'Expand inbox lanes' : 'Collapse inbox lanes'}
                onClick={() => setLanesCollapsed((value) => !value)}
              >
                <ChevronDown size={17} />
              </button>
            </div>
            {lanes.map(({ label, count, icon: Icon }) => (
              <button
                className={label === activeLane ? 'is-selected' : ''}
                type="button"
                key={label}
                onClick={() => setActiveLane(label)}
              >
                <Icon size={18} />
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </aside>

          <section className="message-thread-list" aria-label="Conversation queue">
            <div className="message-list-toolbar">
              <label className="field search-field">
                <Search size={18} />
                <input type="search" placeholder="Search or refine" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
              </label>
              <div className="filter-popover-wrap">
                <button className="icon-button filter-icon-button" type="button" aria-label="Message filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>
                  <SlidersHorizontal size={18} />
                </button>
                {filtersOpen ? (
                  <div className="filter-popover message-filter-popover" role="dialog" aria-label="Message filters">
                    <label>
                      Status
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | 'Unread')}>
                        <option value="All">All messages</option>
                        <option value="Unread">Unread only</option>
                      </select>
                    </label>
                    <label>
                      Type
                      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | MessageType)}>
                        <option value="All">All types</option>
                        <option value="Invoice reply">Invoice replies</option>
                        <option value="Support">Support</option>
                        <option value="Account notice">Notices</option>
                        <option value="General">General</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="message-rows">
              {loadingData ? (
                <div className="empty-panel">
                  <Mail size={28} />
                  <strong>Loading messages</strong>
                  <p>Your conversations will appear here.</p>
                </div>
              ) : visibleThreads.length ? (
                visibleThreads.map((thread) => (
                  <article
                    className={`message-row-card ${selectedThread?.id === thread.id ? 'is-selected' : ''}`}
                    key={thread.id}
                  >
                    <span className={`message-unread-dot ${thread.unread ? 'is-visible' : ''}`} />
                    <span className={`merchant-icon merchant-${thread.tone}`}>{getInitials(thread.sender)}</span>
                    <button className="message-row-open" type="button" onClick={() => void openThread(thread)}>
                      <span className="message-row-main">
                      <strong>{thread.sender}</strong>
                      <span>{thread.subject}</span>
                      <small>{thread.preview || 'No preview available'}</small>
                      </span>
                    </button>
                    <span className="message-row-meta">
                      <TypePill type={thread.type} />
                      {thread.threadCount > 1 ? <span className="follow-up-chip">{thread.threadCount} messages</span> : null}
                    </span>
                    <span className="message-row-date">{thread.date}</span>
                    <span className="message-row-actions">
                      <button
                        className="row-action"
                        type="button"
                        aria-label={`Actions for ${thread.subject}`}
                        aria-expanded={actionMenuId === thread.id}
                        onClick={() => setActionMenuId((id) => (id === thread.id ? null : thread.id))}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {actionMenuId === thread.id ? (
                        <div className="row-action-menu message-action-menu">
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuId(null)
                              void openThread(thread)
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActionMenuId(null)
                              void handleArchive(thread)
                            }}
                          >
                            {thread.archived ? 'Unarchive' : 'Archive'}
                          </button>
                          <button
                            className="is-danger"
                            type="button"
                            onClick={() => {
                              setActionMenuId(null)
                              void handleDelete(thread)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </span>
                  </article>
                ))
              ) : (
                <div className="empty-panel">
                  <Mail size={28} />
                  <strong>No messages yet</strong>
                  <p>Invoice replies, support requests, and account notices will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </section>

      </main>
    </AppShell>
  )
}

function TypePill({ type }: { type: MessageType }) {
  const className =
    type === 'Invoice reply'
      ? 'type-income'
      : type === 'Support'
        ? 'status-needs-review'
        : type === 'Account notice'
          ? 'status-draft'
          : ''

  return <span className={`type-pill ${className}`}>{type}</span>
}

function MessageDetailModal({
  thread,
  messages,
  onArchive,
  onClose,
  onDelete,
  onReply,
}: {
  thread: MessageRecord
  messages: MessageRecord[]
  onArchive: (thread: MessageRecord) => Promise<void>
  onClose: () => void
  onDelete: (thread: MessageRecord) => Promise<void>
  onReply: (thread: MessageRecord, body: string, attachments: File[]) => Promise<void>
}) {
  const [replyBody, setReplyBody] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const visibleMessages = messages.length ? messages : [thread]

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (attachments.length + files.length > MAX_MESSAGE_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files.`)
      return
    }
    if (files.some((file) => file.size > MAX_REPLY_ATTACHMENT_BYTES)) {
      setAttachmentError('Each attachment must be 10 MB or smaller.')
      return
    }
    setAttachmentError('')
    setAttachments((current) => [...current, ...files])
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function submitReply() {
    if (!replyBody.trim()) return
    setSending(true)
    try {
      await onReply(thread, replyBody, attachments)
      setReplyBody('')
      setAttachments([])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="message-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="message-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="messageDetailTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="message-modal-header">
          <div>
            <p className="eyebrow">Conversation</p>
            <h2 id="messageDetailTitle">{thread.subject}</h2>
            <div className="message-detail-person">
              <span className={`merchant-icon merchant-${thread.tone}`}>{getInitials(thread.sender)}</span>
              <div>
                <strong>{thread.sender}</strong>
                <span>{thread.email || 'No email on file'}</span>
              </div>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Close message" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="message-reading-actions">
          <button type="button" onClick={() => void onArchive(thread)}>
            <Archive size={17} />
            {thread.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button type="button" onClick={() => void onDelete(thread)}>
            <Trash2 size={17} />
            Delete
          </button>
          <TypePill type={thread.type} />
        </div>

        <div className="message-modal-body">
          <div className="message-bubbles">
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} sender={message.sender} time={message.date} sent={message.senderId === message.receiverId}>
                {message.body || message.preview || 'No message body available.'}
              </MessageBubble>
            ))}
          </div>

          <div className="message-reply-box">
            <textarea placeholder="Write your reply..." aria-label="Write your reply" value={replyBody} onChange={(event) => setReplyBody(event.target.value)} />
            {attachments.length ? (
              <div className="message-reply-attachment-list">
                {attachments.map((file, index) => (
                  <div className="message-reply-attachment" key={`${file.name}-${index}`}>
                    <Paperclip size={15} />
                    <span>{file.name}</span>
                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachment(index)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {attachmentError ? <p className="drawer-error" role="alert">{attachmentError}</p> : null}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="visually-hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.csv,.doc,.docx,.xls,.xlsx"
              onChange={handleAttachmentChange}
            />
            <div className="message-reply-actions">
              <button className="secondary-button" type="button" disabled={attachments.length >= MAX_MESSAGE_ATTACHMENTS} onClick={() => fileInputRef.current?.click()}>
                <Paperclip size={17} />
                {attachments.length ? 'Add another attachment' : 'Attach'}
              </button>
              <button className="primary-button" type="button" disabled={sending || !replyBody.trim()} onClick={() => void submitReply()}>
                <Send size={18} />
                {sending ? 'Sending' : 'Send reply'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function ComposeModal({
  mode,
  onClose,
  onSend,
}: {
  mode: 'general' | 'support'
  onClose: () => void
  onSend: (payload: { to: string; cc: string; subject: string; body: string; attachments: File[] }) => Promise<void>
}) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    if (attachments.length + files.length > MAX_MESSAGE_ATTACHMENTS) {
      setAttachmentError(`You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files.`)
      return
    }
    if (files.some((file) => file.size > MAX_REPLY_ATTACHMENT_BYTES)) {
      setAttachmentError('Each attachment must be 10 MB or smaller.')
      return
    }
    setAttachmentError('')
    setAttachments((current) => [...current, ...files])
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, fileIndex) => fileIndex !== index))
  }

  async function submitForm() {
    setSending(true)
    try {
      await onSend({ to, cc, subject, body, attachments })
    } finally {
      setSending(false)
    }
  }

  const canSend = Boolean(body.trim() && (mode === 'support' || to.trim()))

  return (
    <div className="message-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="compose-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="composeTitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="message-modal-header">
          <div>
            <p className="eyebrow">{mode === 'support' ? 'Support' : 'Message'}</p>
            <h2 id="composeTitle">{mode === 'support' ? 'Request support' : 'Compose message'}</h2>
            <p>{mode === 'support' ? 'Send a support request to InEx Ledger.' : 'Start a new client or account thread.'}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close compose" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form
          className="compose-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSend) void submitForm()
          }}
        >
          {mode === 'support' ? null : (
            <>
              <label>
                To
                <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@example.com, billing@example.com" />
              </label>
              <label>
                CC
                <input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="owner@example.com, bookkeeper@example.com" />
              </label>
            </>
          )}
          {mode === 'support' ? (
            <label>
              Type
              <select defaultValue="support">
                <option value="support">Support request</option>
                <option value="it_support">IT support</option>
              </select>
            </label>
          ) : null}
          <label>
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Brief subject" />
          </label>
          <label>
            Message
            <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your message..." />
          </label>
          {attachments.length ? (
            <div className="message-reply-attachment-list">
              {attachments.map((file, index) => (
                <div className="message-reply-attachment" key={`${file.name}-${index}`}>
                  <Paperclip size={15} />
                  <span>{file.name}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachment(index)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {attachmentError ? <p className="drawer-error" role="alert">{attachmentError}</p> : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="visually-hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.txt,.csv,.doc,.docx,.xls,.xlsx"
            onChange={handleAttachmentChange}
          />
        </form>

        <div className="message-modal-actions">
          <button className="secondary-button compose-attach-button" type="button" disabled={attachments.length >= MAX_MESSAGE_ATTACHMENTS} onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={17} />
            {attachments.length ? 'Add another attachment' : 'Attach'}
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={sending || !canSend} onClick={() => void submitForm()}>
            <Send size={18} />
            {sending ? 'Sending' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  )
}

function MessageBubble({
  sender,
  time,
  sent = false,
  children,
}: {
  sender: string
  time: string
  sent?: boolean
  children: string
}) {
  return (
    <article className={`message-bubble ${sent ? 'is-sent' : ''}`}>
      <div>
        <strong>{sender}</strong>
        <span>{time}</span>
      </div>
      <p>{children}</p>
    </article>
  )
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default Messages
