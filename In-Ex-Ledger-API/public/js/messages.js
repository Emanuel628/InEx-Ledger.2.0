/* messages.js - Message Center */

const TOAST_MS = 3500;
const POLL_INTERVAL_MS = 30000;
const PAGE_SIZE = 25;
const PREVIEW_MAX_LENGTH = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAILBOX_META = {
  inbox: {
    title: "Inbox",
    headerSubtitle: "Secure threads from accountants, support, and your account channel.",
    surfaceTitle: "Conversation queue",
    surfaceSubtitle: "Review incoming threads, keep support work organized, and archive finished conversations without losing history.",
    queueMeta: "Visible in your inbox"
  },
  sent: {
    title: "Sent",
    headerSubtitle: "Every outbound request and reply sent from your ledger account.",
    surfaceTitle: "Outbound threads",
    surfaceSubtitle: "Track what you sent, confirm who received it, and keep follow-ups out of your personal inbox.",
    queueMeta: "Visible in sent mail"
  },
  archived: {
    title: "Archived",
    headerSubtitle: "Resolved or stored conversations kept out of the active queue.",
    surfaceTitle: "Archive history",
    surfaceSubtitle: "Keep finished threads searchable and attached to your account history without cluttering active work.",
    queueMeta: "Visible in archive"
  }
};

const MESSAGE_TYPE_FILTERS = {
  messages: (message) => !message.message_type
    || ["general", "cpa", "general_cpa", "invoice_sent", "invoice_reply"].includes(message.message_type),
  support: (message) => ["it_support", "support_request"].includes(message.message_type),
  notifications: (message) => message.message_type === "notification"
};

let _toastTimer = null;
let _pollTimer = null;
let _currentMailbox = "inbox";
let _currentFilter = "messages";
let _currentMsgId = null;
let _currentMsgReceiverId = null;
let _currentReplyMode = "in-app";
let _contacts = [];
let _mailboxMessages = [];
let _lastRefreshAt = null;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

function translate(key, fallback = "") {
  return typeof t === "function" ? t(key) : fallback;
}

function findSupportContact() {
  return _contacts.find((contact) =>
    isUuid(contact?.id) && (contact.role === "it_support" || contact.role === "admin")
  ) || null;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  wireTabBar();
  wireSidebar();
  wireComposeModal();
  wireDetailPanel();
  applyMailboxMeta();

  await Promise.all([loadContacts(), loadMessages()]);
  schedulePoll();
});

function wireTabBar() {
  document.querySelectorAll(".messages-tab[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchFilter(button.getAttribute("data-tab")));
  });
}

function wireSidebar() {
  document.querySelectorAll(".app-sidebar .sidebar-link[data-tab]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      switchMailbox(link.getAttribute("data-tab"));
    });
  });

  document.getElementById("sidebarNewMsg")?.addEventListener("click", (event) => {
    event.preventDefault();
    openComposeModal();
  });

  document.getElementById("sidebarSupport")?.addEventListener("click", (event) => {
    event.preventDefault();
    openSupportComposer();
  });

  document.getElementById("supportShortcutBtn")?.addEventListener("click", openSupportComposer);
}

function switchFilter(filter) {
  _currentFilter = filter || "messages";
  updateTabState();
  renderCurrentView();
}

async function switchMailbox(mailbox) {
  _currentMailbox = mailbox || "inbox";
  applyMailboxMeta();
  updateSidebarState();
  await loadMessages();
}

function applyMailboxMeta() {
  const meta = MAILBOX_META[_currentMailbox] || MAILBOX_META.inbox;

  const title = document.getElementById("messagesTitle");
  const headerSubtitle = document.getElementById("messagesHeaderSubtitle");
  const surfaceTitle = document.getElementById("messagesSurfaceTitle");
  const surfaceSubtitle = document.getElementById("messagesSurfaceSubtitle");
  const mailboxBadge = document.getElementById("messagesMailboxBadge");
  const queueMeta = document.getElementById("messagesQueueMeta");

  if (title) title.textContent = meta.title;
  if (headerSubtitle) headerSubtitle.textContent = meta.headerSubtitle;
  if (surfaceTitle) surfaceTitle.textContent = meta.surfaceTitle;
  if (surfaceSubtitle) surfaceSubtitle.textContent = meta.surfaceSubtitle;
  if (mailboxBadge) mailboxBadge.textContent = meta.title;
  if (queueMeta) queueMeta.textContent = meta.queueMeta;
}

function updateSidebarState() {
  document.querySelectorAll(".app-sidebar .sidebar-link[data-tab]").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("data-tab") === _currentMailbox);
  });
}

function updateTabState() {
  let activeTabId = "tabMessages";

  document.querySelectorAll(".messages-tab[data-tab]").forEach((button) => {
    const isActive = button.getAttribute("data-tab") === _currentFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    if (isActive && button.id) activeTabId = button.id;
  });

  document.getElementById("messagesPanel")?.setAttribute("aria-labelledby", activeTabId);
}

function buildMailboxUrl(mailbox) {
  switch (mailbox) {
    case "sent":
      return `/api/messages/sent?limit=${PAGE_SIZE}`;
    case "archived":
      return `/api/messages/archived?limit=${PAGE_SIZE}`;
    case "inbox":
    default:
      return `/api/messages/inbox?limit=${PAGE_SIZE}`;
  }
}

async function loadMessages() {
  const list = document.getElementById("messagesList");
  if (!list) return;

  list.innerHTML = `<div class="messages-loading">${escapeHtml(translate("messages_loading", "Loading messages..."))}</div>`;

  try {
    const response = await apiFetch(buildMailboxUrl(_currentMailbox));
    if (!response || !response.ok) throw new Error("Failed to load messages");

    const { messages } = await response.json();
    _mailboxMessages = Array.isArray(messages) ? messages : [];
    _lastRefreshAt = new Date();

    renderCurrentView();
    updateRefreshUI();
    await updateUnreadBadge();
  } catch {
    list.innerHTML = buildEmptyStateMarkup({
      title: "Unable to load messages",
      body: translate("messages_empty_load_error", "Unable to load messages. Please refresh."),
      actionLabel: "Retry",
      action: "reload"
    });
    wireEmptyStateActions();
  }
}

function renderCurrentView() {
  const filtered = getFilteredMessages(_mailboxMessages, _currentFilter);
  updateOverviewMetrics(filtered, _mailboxMessages);
  renderMessageList(filtered);
}

function getFilteredMessages(messages, filter) {
  const matcher = MESSAGE_TYPE_FILTERS[filter];
  if (!matcher) return messages;
  return messages.filter(matcher);
}

function updateOverviewMetrics(filteredMessages, mailboxMessages) {
  const queueMetric = document.getElementById("messagesQueueMetric");
  const supportMetric = document.getElementById("messagesSupportMetric");
  const countPill = document.getElementById("messagesVisibleCount");

  const visibleCount = filteredMessages.length;
  const supportCount = mailboxMessages.filter(MESSAGE_TYPE_FILTERS.support).length;

  if (queueMetric) queueMetric.textContent = String(visibleCount);
  if (supportMetric) supportMetric.textContent = String(supportCount);
  if (countPill) countPill.textContent = `${visibleCount} ${visibleCount === 1 ? "thread" : "threads"} visible`;
}

function updateRefreshUI() {
  const refreshMetric = document.getElementById("messagesRefreshMetric");
  const syncStatus = document.getElementById("messagesSyncStatus");
  const formatted = _lastRefreshAt ? formatClock(_lastRefreshAt) : "-";

  if (refreshMetric) refreshMetric.textContent = formatted;
  if (syncStatus) {
    syncStatus.textContent = _lastRefreshAt
      ? `Last checked ${formatted}`
      : "Checking for new activity";
  }
}

function renderMessageList(messages) {
  const list = document.getElementById("messagesList");
  if (!list) return;

  if (!messages.length) {
    list.innerHTML = buildEmptyStateMarkup(getEmptyStateConfig());
    wireEmptyStateActions();
    return;
  }

  list.innerHTML = messages.map((message) => renderMessageRow(message)).join("");

  list.querySelectorAll(".message-row[data-id]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest(".msg-btn")) return;
      openMessageDetail(row.getAttribute("data-id"));
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openMessageDetail(row.getAttribute("data-id"));
    });
  });

  list.querySelectorAll("[data-archive]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      archiveMessage(button.getAttribute("data-archive"));
    });
  });

  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteMessage(button.getAttribute("data-delete"));
    });
  });
}

function renderMessageRow(message) {
  const currentUserId = getCurrentUserId();
  const isSentMessage = message.sender_id === currentUserId;
  const counterpart = isSentMessage
    ? (message.receiver_name || message.receiver_email || "Unknown")
    : (message.sender_name || message.sender_email || "Unknown");
  const initial = (counterpart[0] || "?").toUpperCase();
  const unread = !isSentMessage && !message.is_read;
  const typeLabel = getTypeLabel(message.message_type);
  const subject = message.subject || "(No subject)";
  const preview = buildPreview(message.body || "");
  const dateStr = formatRelativeDate(message.created_at);
  const archiveLabel = message.is_archived ? "Unarchive" : "Archive";
  const directionLabel = isSentMessage ? "Sent" : "Received";

  const avatarClass = ["support_request", "it_support"].includes(message.message_type)
    ? " message-avatar--support"
    : message.is_archived
      ? " message-avatar--archived"
      : "";

  const statusBadges = [
    unread ? '<span class="message-state-badge is-unread">New</span>' : "",
    message.is_archived ? '<span class="message-state-badge is-archived">Archived</span>' : "",
    `<span class="message-direction-badge">${directionLabel}</span>`
  ].filter(Boolean).join("");

  return `
    <div class="message-row${unread ? " is-unread" : ""}" data-id="${escapeHtml(message.id)}" tabindex="0" role="button" aria-label="Open message: ${escapeHtml(subject)}">
      <span class="message-avatar${avatarClass}" aria-hidden="true">${escapeHtml(initial)}</span>
      <div class="message-row-body">
        <div class="message-row-meta">
          <div class="message-row-kickers">
            <span class="message-type-badge ${escapeHtml(message.message_type || "general")}">${escapeHtml(typeLabel)}</span>
            ${statusBadges}
          </div>
          <span class="message-date">${escapeHtml(dateStr)}</span>
        </div>
        <div class="message-row-main">
          <span class="message-from">${escapeHtml(counterpart)}</span>
          <span class="message-subject">${escapeHtml(subject)}</span>
        </div>
        <div class="message-preview">${escapeHtml(preview)}</div>
      </div>
      <div class="message-row-actions">
        <button type="button" class="msg-btn" data-archive="${escapeHtml(message.id)}">${archiveLabel}</button>
        <button type="button" class="msg-btn danger" data-delete="${escapeHtml(message.id)}">Delete</button>
      </div>
    </div>`;
}

function getTypeLabel(type) {
  return {
    cpa: translate("messages_type_review", "Review"),
    general_cpa: translate("messages_type_review", "Review"),
    it_support: translate("messages_type_it_support", "IT Support"),
    support_request: translate("messages_type_support_request", "Support Request"),
    general: translate("messages_type_general", "General"),
    invoice_sent: translate("messages_type_invoice_sent", "Invoice sent"),
    invoice_reply: translate("messages_type_invoice_reply", "Invoice reply")
  }[type] || type || "Message";
}

function buildPreview(body) {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= PREVIEW_MAX_LENGTH) return compact;
  return `${compact.slice(0, PREVIEW_MAX_LENGTH)}...`;
}

function buildEmptyStateMarkup({ title, body, actionLabel, action }) {
  return `
    <div class="messages-empty">
      <div class="message-empty-card">
        <span class="message-empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"></path><path d="M4 8l8 6 8-6"></path></svg>
        </span>
        <h3 class="message-empty-title">${escapeHtml(title)}</h3>
        <p class="message-empty-copy">${escapeHtml(body)}</p>
        ${actionLabel ? `<button type="button" class="message-empty-action" data-empty-action="${escapeHtml(action || "")}">${escapeHtml(actionLabel)}</button>` : ""}
      </div>
    </div>`;
}

function getEmptyStateConfig() {
  if (_currentFilter === "notifications") {
    return {
      title: "No notifications yet",
      body: translate("messages_empty_notifications", "No system notifications yet."),
      actionLabel: null
    };
  }

  if (_currentFilter === "support") {
    return {
      title: "No support threads in this mailbox",
      body: _currentMailbox === "archived"
        ? "Archived support threads will appear here once you store them."
        : translate("messages_empty_support", "No support tickets yet."),
      actionLabel: "Request Support",
      action: "support"
    };
  }

  if (_currentMailbox === "sent") {
    return {
      title: "No sent messages yet",
      body: "Messages you send from InEx Ledger will appear here for follow-up and recordkeeping.",
      actionLabel: "Compose Message",
      action: "compose"
    };
  }

  if (_currentMailbox === "archived") {
    return {
      title: "Archive is clear",
      body: "Archived conversations will appear here once you move finished threads out of the active queue.",
      actionLabel: null
    };
  }

  return {
    title: "No messages yet",
    body: translate("messages_empty", "No messages yet."),
    actionLabel: "Compose Message",
    action: "compose"
  };
}

function wireEmptyStateActions() {
  document.querySelectorAll("[data-empty-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-empty-action");
      if (action === "compose") {
        openComposeModal();
      } else if (action === "support") {
        openSupportComposer();
      } else if (action === "reload") {
        void loadMessages();
      }
    });
  });
}

function wireDetailPanel() {
  document.getElementById("messageDetailClose")?.addEventListener("click", closeMessageDetail);
  document.getElementById("messageDetailOverlay")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeMessageDetail();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMessageDetail();
  });

  document.getElementById("detailReplyBtn")?.addEventListener("click", () => {
    const area = document.getElementById("replyArea");
    if (!area) return;
    area.classList.toggle("hidden");
    if (!area.classList.contains("hidden")) {
      document.getElementById("replyInput")?.focus();
    }
  });
    
    document.getElementById("detailEmailReplyBtn")?.addEventListener("click", () => {
  const area = document.getElementById("replyArea");
  if (!area) return;
  area.classList.toggle("hidden");
  if (!area.classList.contains("hidden")) {
    document.getElementById("replyInput")?.focus();
  }
    });
    
  document.getElementById("detailArchiveBtn")?.addEventListener("click", () => {
    if (_currentMsgId) archiveMessage(_currentMsgId, true);
  });

  document.getElementById("detailDeleteBtn")?.addEventListener("click", () => {
    if (_currentMsgId) deleteMessage(_currentMsgId, true);
  });

  document.getElementById("replySendBtn")?.addEventListener("click", sendReply);
}

async function openMessageDetail(id) {
  try {
    const response = await apiFetch(`/api/messages/${encodeURIComponent(id)}`);
    if (!response || !response.ok) throw new Error("Failed to open message");

    const { message } = await response.json();
    const currentUserId = getCurrentUserId();
    const isSentMessage = message.sender_id === currentUserId;
    const counterpart = isSentMessage
      ? (message.receiver_name || message.receiver_email || "Unknown")
      : (message.sender_name || message.sender_email || "Unknown");
    const typeLabel = getTypeLabel(message.message_type);
    const dateStr = formatRelativeDate(message.created_at);
    const subject = message.subject || "(No subject)";

    _currentMsgId = message.id;
    _currentMsgReceiverId = isSentMessage ? message.receiver_id : message.sender_id;

    const subjectEl = document.getElementById("messageDetailSubject");
    const fromEl = document.getElementById("messageDetailFrom");
    const bodyEl = document.getElementById("messageDetailBody");
    const replyArea = document.getElementById("replyArea");
    const replyInput = document.getElementById("replyInput");
    const detailReplyBtn = document.getElementById("detailReplyBtn");
    const detailEmailReplyBtn = document.getElementById("detailEmailReplyBtn");
    
    if (subjectEl) subjectEl.textContent = `${subject} (${typeLabel})`;
    if (fromEl) {
      fromEl.innerHTML = isSentMessage
        ? `${translate("messages_detail_to", "To")} <strong>${escapeHtml(counterpart)}</strong> - ${escapeHtml(dateStr)}`
        : `${translate("messages_detail_from", "From")} <strong>${escapeHtml(counterpart)}</strong> - ${escapeHtml(dateStr)}`;
    }
    if (bodyEl) {
      bodyEl.textContent = message.body || "";
      // For invoice-related messages, append an "Open invoice" link so the
      // user can jump straight to the source invoice from a reply or the
      // outbound record.
      if (message.invoice_id) {
        const link = document.createElement("a");
        link.href = `invoices?focus=${encodeURIComponent(message.invoice_id)}`;
        link.className = "message-invoice-link";
        link.textContent = message.invoice_number
          ? `Open invoice ${message.invoice_number}`
          : "Open invoice";
        const wrap = document.createElement("p");
        wrap.style.marginTop = "12px";
        wrap.appendChild(link);
        bodyEl.appendChild(wrap);
      }
    }
    if (replyArea) replyArea.classList.add("hidden");
    if (replyInput) replyInput.value = "";
    // Inbound invoice replies have no in-app sender to reply to; hide the
    // in-app reply UI in that case.
    const isInvoiceReply = message.message_type === "invoice_reply";
    _currentReplyMode = isInvoiceReply ? "email" : "in-app";
    if (detailReplyBtn) {detailReplyBtn.hidden = isSentMessage || isInvoiceReply;
      
    }

if (detailEmailReplyBtn) {
  detailEmailReplyBtn.hidden = !isInvoiceReply || !message.external_sender_email;
}

    document.getElementById("messageDetailOverlay")?.classList.remove("hidden");

    _mailboxMessages = _mailboxMessages.map((item) => item.id === message.id
      ? { ...item, is_read: true }
      : item);

    renderCurrentView();
  } catch {
    showToast(translate("messages_error_open", "Unable to open the selected message."));
  }
}

function closeMessageDetail() {
  document.getElementById("messageDetailOverlay")?.classList.add("hidden");
  _currentMsgId = null;
  _currentMsgReceiverId = null;
  _currentReplyMode = "in-app";
}

async function sendReply() {
  const input = document.getElementById("replyInput");
  const body = (input?.value || "").trim();

  if (!body) {
    showFieldTooltip(input, translate("messages_error_reply_empty", "Write a reply before sending."));
    return;
  }

  if (_currentReplyMode !== "email" && !isUuid(_currentMsgReceiverId)) {showToast(translate("messages_error_reply_recipient", "Reply recipient is unavailable."));
    return;
  }

  const button = document.getElementById("replySendBtn");
  if (button) {
    button.disabled = true;
    button.textContent = translate("messages_sending", "Sending...");
  }

try {
  const response = _currentReplyMode === "email"
  ? await apiFetch(`/api/messages/${encodeURIComponent(_currentMsgId)}/reply-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    })
  : await apiFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver_id: _currentMsgReceiverId,
        message_type: "general",
        body,
        parent_id: _currentMsgId
      })
    });
    
    if (!response || !response.ok) {
      const error = response ? await response.json().catch(() => ({})) : {};
      throw new Error(error.error || "Failed to send reply");
    }

    if (input) input.value = "";
    document.getElementById("replyArea")?.classList.add("hidden");
    closeMessageDetail();
    showToast(translate("messages_reply_sent", "Reply sent."));
    await loadMessages();
  } catch (error) {
    showToast(error.message || "Failed to send reply. Please try again.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = translate("messages_reply_send_btn", "Send Reply");
    }
  }
}

async function archiveMessage(id, closeDetail = false) {
  try {
    const response = await apiFetch(`/api/messages/${encodeURIComponent(id)}/archive`, { method: "PATCH" });
    if (!response || !response.ok) throw new Error("Failed");

    const data = await response.json();
    showToast(data.archived ? "Message archived." : "Message unarchived.");
    if (closeDetail) closeMessageDetail();
    await loadMessages();
  } catch {
    showToast("Unable to archive message. Please try again.");
  }
}

async function deleteMessage(id, closeDetail = false) {
  try {
    const response = await apiFetch(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response || !response.ok) throw new Error("Failed");

    showToast("Message deleted.");
    if (closeDetail) closeMessageDetail();
    await loadMessages();
  } catch {
    showToast("Unable to delete message. Please try again.");
  }
}

async function loadContacts() {
  try {
    const response = await apiFetch("/api/messages/contacts");
    if (!response || !response.ok) return;

    const { contacts } = await response.json();
    _contacts = contacts || [];
    populateContactSelect(document.getElementById("composeTo"));
  } catch {
    _contacts = [];
  }
}

function populateContactSelect(select) {
  if (!select) return;

  const currentValue = select.value;
  const placeholder = select.querySelector("option[value='']");
  select.innerHTML = "";

  if (placeholder) {
    select.appendChild(placeholder);
  } else {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Select contact...";
    select.appendChild(option);
  }

  _contacts.forEach((contact) => {
    if (!isUuid(contact.id)) return;

    const option = document.createElement("option");
    option.value = contact.id;
    const roleTag = contact.role && contact.role !== "user"
      ? ` (${String(contact.role).replace("_", " ")})`
      : "";
    option.textContent = `${contact.name}${roleTag}`;
    select.appendChild(option);
  });

  if (currentValue) select.value = currentValue;
}

function wireComposeModal() {
  document.getElementById("composeBtn")?.addEventListener("click", openComposeModal);
  document.getElementById("composeCancelBtn")?.addEventListener("click", closeComposeModal);
  document.getElementById("composeSendBtn")?.addEventListener("click", sendComposedMessage);
  document.getElementById("composeOverlay")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeComposeModal();
  });
}

function openComposeModal(prefill = null) {
  const overlay = document.getElementById("composeOverlay");
  if (!overlay) return;

  const toEl = document.getElementById("composeTo");
  const typeEl = document.getElementById("composeType");
  const subjectEl = document.getElementById("composeSubject");
  const bodyEl = document.getElementById("composeBody");
  const errorEl = document.getElementById("composeError");

  populateContactSelect(toEl);

  if (toEl) toEl.value = prefill?.to || "";
  if (typeEl) typeEl.value = prefill?.type || "general";
  if (subjectEl) subjectEl.value = prefill?.subject || "";
  if (bodyEl) bodyEl.value = prefill?.body || "";
  if (errorEl) errorEl.textContent = "";

  overlay.classList.remove("hidden");
  (toEl || bodyEl)?.focus();
}

function closeComposeModal() {
  document.getElementById("composeOverlay")?.classList.add("hidden");
}

function openSupportComposer() {
  const supportContact = findSupportContact();
  if (!supportContact) {
    showToast("Support messaging is unavailable right now. Use support@inexledger.com.");
    return;
  }

  openComposeModal({
    to: supportContact.id,
    type: "support_request",
    subject: "Support Request"
  });
}

async function sendComposedMessage() {
  const toEl = document.getElementById("composeTo");
  const typeEl = document.getElementById("composeType");
  const subjectEl = document.getElementById("composeSubject");
  const bodyEl = document.getElementById("composeBody");
  const errorEl = document.getElementById("composeError");
  const sendBtn = document.getElementById("composeSendBtn");

  const receiverId = (toEl?.value || "").trim();
  const messageType = (typeEl?.value || "general").trim();
  const subject = (subjectEl?.value || "").trim();
  const body = (bodyEl?.value || "").trim();

  if (!receiverId) {
    if (errorEl) errorEl.textContent = translate("messages_error_no_recipient", "Select a recipient.");
    toEl?.focus();
    return;
  }

  if (!isUuid(receiverId)) {
    if (errorEl) errorEl.textContent = translate("messages_error_invalid_recipient", "Recipient is invalid.");
    toEl?.focus();
    return;
  }

  if (!body) {
    if (errorEl) errorEl.textContent = translate("messages_error_body_required", "Message body is required.");
    bodyEl?.focus();
    return;
  }

  if (errorEl) errorEl.textContent = "";

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = translate("messages_sending", "Sending...");
  }

  try {
    const response = await apiFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver_id: receiverId,
        message_type: messageType,
        subject: subject || undefined,
        body
      })
    });

    if (!response || !response.ok) {
      const error = response ? await response.json().catch(() => ({})) : {};
      if (errorEl) errorEl.textContent = error.error || "Failed to send message.";
      return;
    }

    closeComposeModal();
    showToast(translate("messages_toast_sent", "Message sent."));
    if (_currentMailbox === "sent") {
      await loadMessages();
    }
  } catch {
    if (errorEl) errorEl.textContent = translate("messages_error_network", "Network error. Please try again.");
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = translate("messages_compose_send_btn", "Send");
    }
  }
}

async function updateUnreadBadge() {
  if (typeof getToken === "function" && !getToken()) {
    stopPoll();
    return false;
  }

  try {
    const response = await apiFetch("/api/messages/unread-count");
    if (!response) {
      stopPoll();
      return false;
    }
    if (!response.ok) return true;

    const { count } = await response.json();
    setUnreadBadge(count);
    return true;
  } catch {
    return true;
  }
}

function setUnreadBadge(count) {
  const badges = [
    document.getElementById("inboxBadge"),
    document.getElementById("sidebarUnreadBadge")
  ];

  badges.forEach((badge) => {
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  });

  document.getElementById("messagesUnreadMetric")?.replaceChildren(document.createTextNode(String(count)));

  document.querySelectorAll(".nav-msg-badge").forEach((badge) => {
    badge.setAttribute("data-count", String(count));
    badge.textContent = "";
    badge.hidden = count <= 0;

    const label = count === 1 ? "1 unread message" : `${count} unread messages`;
    if (count > 0) {
      badge.setAttribute("aria-label", label);
      badge.title = label;
    } else {
      badge.removeAttribute("aria-label");
      badge.removeAttribute("title");
    }
  });
}

function schedulePoll() {
  stopPoll();
  _pollTimer = setInterval(() => {
    void updateUnreadBadge().then((shouldContinue) => {
      if (shouldContinue === false) stopPoll();
    });
  }, POLL_INTERVAL_MS);
}

function stopPoll() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

function formatRelativeDate(iso) {
  if (!iso) return "";

  const date = new Date(iso);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatClock(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function getCurrentUserId() {
  try {
    const token = typeof getToken === "function"
      ? getToken()
      : sessionStorage.getItem("token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.id || payload.sub || null;
  } catch {
    return null;
  }
}

function showToast(message) {
  const toast = document.getElementById("messagesToast");
  const text = document.getElementById("messagesToastText");
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.remove("hidden");

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add("hidden"), TOAST_MS);
}
