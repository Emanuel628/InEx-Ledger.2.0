import { useEffect, useState } from 'react'
import {
  Archive,
  ChevronDown,
  Clock3,
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

type MessageType = 'Invoice reply' | 'Support' | 'Account notice' | 'General'

type MessageThread = {
  id: number
  sender: string
  email: string
  subject: string
  preview: string
  type: MessageType
  followUp?: string
  date: string
  unread: boolean
  tone: string
}

const lanes = [
  { label: 'Inbox', count: 0, icon: Mail },
  { label: 'Invoices', count: 0, icon: FileText },
  { label: 'Support', count: 0, icon: Headphones },
  { label: 'Notices', count: 0, icon: Archive },
  { label: 'Archived', count: 0, icon: Archive },
] satisfies { label: string; count: number; icon: LucideIcon }[]

const threads: MessageThread[] = []

function Messages(props: PageProps) {
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null)
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeType, setComposeType] = useState<'general' | 'support'>('general')
  const [lanesCollapsed, setLanesCollapsed] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('modal-is-open', detailOpen || composeOpen)

    return () => document.body.classList.remove('modal-is-open')
  }, [detailOpen, composeOpen])

  return (
    <AppShell
      {...props}
      searchPlaceholder="Search messages, clients, invoices"
      overlay={
        <>
          {detailOpen && selectedThread ? <MessageDetailModal thread={selectedThread} onClose={() => setDetailOpen(false)} /> : null}
          {composeOpen ? (
            <ComposeModal
              mode={composeType}
              onClose={() => setComposeOpen(false)}
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
              <button className={label === 'Invoices' ? 'is-selected' : ''} type="button" key={label}>
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
                <input type="search" placeholder="Search or refine" />
              </label>
              <button className="secondary-button" type="button">
                Needs reply
                <ChevronDown size={16} />
              </button>
              <button className="secondary-button" type="button">
                All
                <ChevronDown size={16} />
              </button>
              <button className="icon-button" type="button" aria-label="Message filters">
                <SlidersHorizontal size={18} />
              </button>
            </div>

            <div className="message-rows">
              {threads.length ? (
                threads.map((thread) => (
                  <button
                    className={`message-row-card ${selectedThread?.id === thread.id ? 'is-selected' : ''}`}
                    type="button"
                    key={thread.id}
                    onClick={() => {
                      setSelectedThread(thread)
                      setDetailOpen(true)
                    }}
                  >
                    <span className={`message-unread-dot ${thread.unread ? 'is-visible' : ''}`} />
                    <span className={`merchant-icon merchant-${thread.tone}`}>{getInitials(thread.sender)}</span>
                    <span className="message-row-main">
                      <strong>{thread.sender}</strong>
                      <span>{thread.subject}</span>
                      <small>{thread.preview}</small>
                    </span>
                    <span className="message-row-meta">
                      <TypePill type={thread.type} />
                      {thread.followUp ? <span className="follow-up-chip">{thread.followUp}</span> : null}
                    </span>
                    <span className="message-row-date">{thread.date}</span>
                    <MoreHorizontal size={18} />
                  </button>
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

        <section className="progressive-panels" aria-label="Message settings">
          <ProgressivePanel
            id="settings"
            title="Rules and templates"
            summary="Snippets, follow-ups, routing"
            expandedPanel={expandedPanel}
            onToggle={setExpandedPanel}
          >
            Keep reply snippets, follow-up timing, invoice-reply routing, and support defaults tucked away until needed.
          </ProgressivePanel>
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

function MessageDetailModal({ thread, onClose }: { thread: MessageThread; onClose: () => void }) {
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
                <span>{thread.email}</span>
              </div>
            </div>
          </div>
          <button className="icon-button" type="button" aria-label="Close message" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="message-reading-actions">
          <button type="button">
            <Archive size={17} />
            Archive
          </button>
          <button type="button">
            <Trash2 size={17} />
            Delete
          </button>
          <button type="button">
            <Clock3 size={17} />
            Follow up
          </button>
          <TypePill type={thread.type} />
        </div>

        <div className="message-modal-body">
          <div className="message-bubbles">
            <MessageBubble sender={thread.sender} time="1h ago">
              Thanks for the details. Can you clarify the hosting line item before we approve this invoice?
            </MessageBubble>
            <MessageBubble sender="You" time="45m ago" sent>
              Good question. It is an annual charge for managed hosting renewal starting May 1, 2026.
            </MessageBubble>
            <MessageBubble sender={thread.sender} time="20m ago">
              Got it, thanks. Please go ahead and process the payment.
            </MessageBubble>
          </div>

          <div className="message-reply-box">
            <textarea placeholder="Write your reply..." aria-label="Write your reply" />
            <div className="message-reply-actions">
              <button className="secondary-button" type="button">Snippets</button>
              <button className="secondary-button" type="button">
                <Paperclip size={17} />
                Attach
              </button>
              <button className="primary-button" type="button">
                <Send size={18} />
                Send reply
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function ComposeModal({ mode, onClose }: { mode: 'general' | 'support'; onClose: () => void }) {
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

        <form className="compose-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            To
            <input
              defaultValue={mode === 'support' ? 'support@inexledger.com' : ''}
              placeholder="name@example.com, billing@example.com"
            />
          </label>
          {mode === 'support' ? null : (
            <label>
              CC
              <input placeholder="owner@example.com, bookkeeper@example.com" />
            </label>
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
            <input placeholder="Brief subject" />
          </label>
          <label>
            Message
            <textarea placeholder="Write your message..." />
          </label>
        </form>

        <div className="message-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button">
            <Send size={18} />
            Send
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

function ProgressivePanel({
  id,
  title,
  summary,
  expandedPanel,
  onToggle,
  children,
}: {
  id: string
  title: string
  summary: string
  expandedPanel: string | null
  onToggle: (id: string | null) => void
  children: string
}) {
  const isExpanded = expandedPanel === id

  return (
    <article className="progressive-panel">
      <button type="button" onClick={() => onToggle(isExpanded ? null : id)} aria-expanded={isExpanded}>
        <span>{title}</span>
        <strong>{summary}</strong>
        <ChevronDown size={17} />
      </button>
      {isExpanded ? <p>{children}</p> : null}
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
