/* messages.js — Message Center */

const TOAST_MS = 3500;
const POLL_INTERVAL_MS = 30000; // 30 s polling for unread count
const PAGE_SIZE = 25;
const PREVIEW_MAX_LENGTH = 80;

let _toastTimer = null;
let _pollTimer = null;
let _currentTab = "inbox"; // inbox | sent | archived
let _currentMsgId = null;
let _currentMsgReceiverId = null;
let _contacts = [];

// ─────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireTabBar();
  wireSidebar();
  wireComposeModal();
  wireDetailPanel();

  await Promise.all([loadMessages("inbox"), loadContacts()]);

  // Kick off polling
  schedulePoll();
});

// ─────────────────────────────────────────────
// Tab bar wiring
// ─────────────────────────────────────────────
function wireTabBar() {
  document.querySelectorAll(".messages-tab[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });
}

function switchTab(tab) {
  _currentTab = tab;
  let activeTabId = "tabInbox";

  document.querySelectorAll(".messages-tab").forEach((btn) => {
    const isActive = btn.getAttribute("data-tab") === tab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
    btn.tabIndex = isActive ? 0 : -1;
    if (isActive && btn.id) {
      activeTabId = btn.id;
    }
  });

  const panel = document.getElementById("messagesPanel");
  if (panel) {
    panel.setAttribute("aria-labelledby", activeTabId);
  }

  document.querySelectorAll(".app-sidebar .sidebar-link[data-tab]").forEach((a) => {
    a.classList.toggle("is-active", a.getAttribute("data-tab") === tab);
  });

  const titleMap = { inbox: "Inbox", sent: "Sent", archived: "Archived" };
  const titleEl = document.getElementById("messagesTitle");
  if (titleEl) titleEl.textContent = titleMap[tab] || "Messages";

  loadMessages(tab);
}

// ─────────────────────────────────────────────
// Sidebar links
// ─────────────────────────────────────────────
function wireSidebar() {
  document.querySelectorAll(".app-sidebar .sidebar-link[data-tab]").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(a.getAttribute("data-tab"));
    });
  });

  document.getElementById("sidebarNewMsg")?.addEventListener("click", (e) => {
    e.preventDefault();
    openComposeModal();
  });

  document.getElementById("sidebarSupport")?.addEventListener("click", (e) => {
    e.preventDefault();
    openComposeModal({ type: "support_request", subject: "Support Request" });
  });
}

// ─────────────────────────────────────────────
// Load messages
// ─────────────────────────────────────────────
async function loadMessages(tab) {
  const list = document.getElementById("messagesList");
  if (!list) return;
  list.innerHTML = '<div class="messages-loading">Loading messages…</div>';

  try {
    let url;
    if (tab === "sent") {
      url = `/api/messages/sent?limit=${PAGE_SIZE}`;
    } else if (tab === "archived") {
      url = `/api/messages/inbox?archived=true&limit=${PAGE_SIZE}`;
    } else {
      url = `/api/messages/inbox?limit=${PAGE_SIZE}`;
    }

    const res = await apiFetch(url);
    if (!res || !res.ok) throw new Error("Failed to load messages");

    const { messages } = await res.json();
    renderMessageList(messages, tab);
    updateUnreadBadge();
  } catch {
    list.innerHTML = '<div class="messages-empty">Unable to load messages. Please refresh.</div>';
  }
}

function renderMessageList(messages, tab) {
  const list = document.getElementById("messagesList");

  if (!messages || !messages.length) {
    const emptyText = tab === "sent" ? "No sent messages." : tab === "archived" ? "No archived messages." : "Your inbox is empty.";
    list.innerHTML = `<div class="messages-empty">${emptyText}</div>`;
    return;
  }

  list.innerHTML = messages.map((m) => renderMessageRow(m, tab)).join("");

  list.querySelectorAll(".message-row[data-id]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".msg-btn")) return;
      openMessageDetail(row.getAttribute("data-id"));
    });
  });

  list.querySelectorAll("[data-archive]").forEach((btn) => {
    btn.addEventListener("click", () => archiveMessage(btn.getAttribute("data-archive")));
  });

  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMessage(btn.getAttribute("data-delete")));
  });
}

function renderMessageRow(m, tab) {
  const isSent = tab === "sent";
  const counterpart = isSent
    ? (m.receiver_name || m.receiver_email || "Unknown")
    : (m.sender_name || m.sender_email || "Unknown");
  const initial = (counterpart[0] || "?").toUpperCase();
  const unreadClass = (!isSent && !m.is_read) ? " is-unread" : "";
  const typeLabel = { cpa: "CPA", it_support: "IT Support", support_request: "Support", general: "General" }[m.message_type] || m.message_type;
  const subject = m.subject || "(No subject)";
  const preview = m.body.replace(/\n/g, " ").slice(0, PREVIEW_MAX_LENGTH) + (m.body.length > PREVIEW_MAX_LENGTH ? "…" : "");
  const dateStr = formatRelativeDate(m.created_at);
  const archiveLabel = m.is_archived ? "Unarchive" : "Archive";

  return `
    <div class="message-row${unreadClass}" data-id="${escapeHtml(m.id)}" tabindex="0" role="button" aria-label="Open message: ${escapeHtml(subject)}">
      <span class="message-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
      <div class="message-row-body">
        <div class="message-row-top">
          <span class="message-from">${escapeHtml(counterpart)}<span class="message-type-badge ${escapeHtml(m.message_type)}">${escapeHtml(typeLabel)}</span></span>
          <span class="message-date">${escapeHtml(dateStr)}</span>
        </div>
        <div class="message-subject">${escapeHtml(subject)}</div>
        <div class="message-preview">${escapeHtml(preview)}</div>
      </div>
      <div class="message-row-actions">
        <button type="button" class="msg-btn" data-archive="${escapeHtml(m.id)}">${archiveLabel}</button>
        <button type="button" class="msg-btn danger" data-delete="${escapeHtml(m.id)}">Delete</button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────
// Message detail panel
// ─────────────────────────────────────────────
function wireDetailPanel() {
  document.getElementById("messageDetailClose")?.addEventListener("click", closeMessageDetail);
  document.getElementById("messageDetailOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeMessageDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMessageDetail();
  });

  document.getElementById("detailReplyBtn")?.addEventListener("click", () => {
    const area = document.getElementById("replyArea");
    if (area) {
      area.classList.toggle("hidden");
      if (!area.classList.contains("hidden")) {
        document.getElementById("replyInput")?.focus();
      }
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
    const res = await apiFetch(`/api/messages/${encodeURIComponent(id)}`);
    if (!res || !res.ok) throw new Error("Failed");
    const { message: m } = await res.json();

    _currentMsgId = m.id;
    _currentMsgReceiverId = m.sender_id === getCurrentUserId() ? m.receiver_id : m.sender_id;

    const subject = m.subject || "(No subject)";
    const isSent = m.sender_id === getCurrentUserId();
    const counterpart = isSent
      ? (m.receiver_name || m.receiver_email || "Unknown")
      : (m.sender_name || m.sender_email || "Unknown");
    const dateStr = formatRelativeDate(m.created_at);
    const typeLabel = { cpa: "CPA", it_support: "IT Support", support_request: "Support Request", general: "General" }[m.message_type] || m.message_type;

    const subjectEl = document.getElementById("messageDetailSubject");
    const fromEl = document.getElementById("messageDetailFrom");
    const bodyEl = document.getElementById("messageDetailBody");
    const replyArea = document.getElementById("replyArea");
    const replyInput = document.getElementById("replyInput");
    const detailReplyBtn = document.getElementById("detailReplyBtn");

    if (subjectEl) subjectEl.textContent = `${subject} [${typeLabel}]`;
    if (fromEl) {
      fromEl.innerHTML = isSent
        ? `To: <strong>${escapeHtml(counterpart)}</strong> &mdash; ${escapeHtml(dateStr)}`
        : `From: <strong>${escapeHtml(counterpart)}</strong> &mdash; ${escapeHtml(dateStr)}`;
    }
    if (bodyEl) bodyEl.textContent = m.body;
    if (replyArea) { replyArea.classList.add("hidden"); }
    if (replyInput) replyInput.value = "";

    // Hide reply button for sent messages (can still reply via compose)
    if (detailReplyBtn) detailReplyBtn.hidden = isSent;

    const overlay = document.getElementById("messageDetailOverlay");
    if (overlay) overlay.classList.remove("hidden");

    // Refresh the list row to show read state
    const row = document.querySelector(`.message-row[data-id="${CSS.escape(id)}"]`);
    if (row) row.classList.remove("is-unread");

    updateUnreadBadge();
  } catch {
    showToast("Unable to open message. Please try again.");
  }
}

function closeMessageDetail() {
  document.getElementById("messageDetailOverlay")?.classList.add("hidden");
  _currentMsgId = null;
  _currentMsgReceiverId = null;
}

async function sendReply() {
  const input = document.getElementById("replyInput");
  const body = (input?.value || "").trim();
  if (!body) {
    showFieldTooltip(input, "Please write a reply before sending.");
    return;
  }
  if (!_currentMsgReceiverId) return;

  const btn = document.getElementById("replySendBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

  try {
    const res = await apiFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiver_id: _currentMsgReceiverId,
        message_type: "general",
        body,
        parent_id: _currentMsgId
      })
    });

    if (!res || !res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to send reply");
    }

    if (input) input.value = "";
    document.getElementById("replyArea")?.classList.add("hidden");
    closeMessageDetail();
    showToast("Reply sent.");
    await loadMessages(_currentTab);
  } catch (err) {
    showToast(err.message || "Failed to send reply. Please try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Send Reply"; }
  }
}

// ─────────────────────────────────────────────
// Archive
// ─────────────────────────────────────────────
async function archiveMessage(id, closeDetail) {
  try {
    const res = await apiFetch(`/api/messages/${encodeURIComponent(id)}/archive`, { method: "PATCH" });
    if (!res || !res.ok) throw new Error("Failed");
    const data = await res.json();
    showToast(data.archived ? "Message archived." : "Message unarchived.");
    if (closeDetail) closeMessageDetail();
    await loadMessages(_currentTab);
  } catch {
    showToast("Unable to archive message. Please try again.");
  }
}

// ─────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────
async function deleteMessage(id, closeDetail) {
  try {
    const res = await apiFetch(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res || !res.ok) throw new Error("Failed");
    showToast("Message deleted.");
    if (closeDetail) closeMessageDetail();
    await loadMessages(_currentTab);
  } catch {
    showToast("Unable to delete message. Please try again.");
  }
}

// ─────────────────────────────────────────────
// Contacts
// ─────────────────────────────────────────────
async function loadContacts() {
  try {
    const res = await apiFetch("/api/messages/contacts");
    if (!res || !res.ok) return;
    const { contacts } = await res.json();
    _contacts = contacts || [];
    populateContactSelect(document.getElementById("composeTo"));
  } catch {
    // non-fatal
  }
}

function populateContactSelect(select) {
  if (!select) return;
  const current = select.value;
  const placeholder = select.querySelector("option[value='']");
  select.innerHTML = "";
  if (placeholder) select.appendChild(placeholder);
  else {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select contact…";
    select.appendChild(opt);
  }
  _contacts.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    const roleTag = c.role && c.role !== "user" ? ` (${c.role.replace("_", " ")})` : "";
    opt.textContent = `${c.name}${roleTag}`;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

// ─────────────────────────────────────────────
// Compose modal
// ─────────────────────────────────────────────
function wireComposeModal() {
  document.getElementById("composeBtn")?.addEventListener("click", openComposeModal);
  document.getElementById("composeCancelBtn")?.addEventListener("click", closeComposeModal);
  document.getElementById("composeSendBtn")?.addEventListener("click", sendComposedMessage);
  document.getElementById("composeOverlay")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeComposeModal();
  });
}

function openComposeModal(prefill) {
  const overlay = document.getElementById("composeOverlay");
  if (!overlay) return;

  // Reset
  const toEl = document.getElementById("composeTo");
  const typeEl = document.getElementById("composeType");
  const subjectEl = document.getElementById("composeSubject");
  const bodyEl = document.getElementById("composeBody");
  const errorEl = document.getElementById("composeError");

  if (toEl) { toEl.value = prefill?.to || ""; populateContactSelect(toEl); if (prefill?.to) toEl.value = prefill.to; }
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
    if (errorEl) errorEl.textContent = "Please select a recipient.";
    toEl?.focus();
    return;
  }
  if (!body) {
    if (errorEl) errorEl.textContent = "Message body is required.";
    bodyEl?.focus();
    return;
  }
  if (errorEl) errorEl.textContent = "";

  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Sending…"; }

  try {
    const res = await apiFetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiver_id: receiverId, message_type: messageType, subject: subject || undefined, body })
    });

    if (!res || !res.ok) {
      const err = await res.json().catch(() => ({}));
      if (errorEl) errorEl.textContent = err.error || "Failed to send message.";
      return;
    }

    closeComposeModal();
    showToast("Message sent.");
    if (_currentTab === "sent") await loadMessages("sent");
  } catch {
    if (errorEl) errorEl.textContent = "Network error. Please try again.";
  } finally {
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
}

// ─────────────────────────────────────────────
// Unread badge & polling
// ─────────────────────────────────────────────
async function updateUnreadBadge() {
  if (typeof getToken === "function" && !getToken()) {
    stopPoll();
    return false;
  }

  try {
    const res = await apiFetch("/api/messages/unread-count");
    if (!res) {
      stopPoll();
      return false;
    }
    if (!res.ok) return true;
    const { count } = await res.json();
    setUnreadBadge(count);
    return true;
  } catch {
    // non-fatal
    return true;
  }
}

function setUnreadBadge(count) {
  const badges = [
    document.getElementById("inboxBadge"),
    document.getElementById("sidebarUnreadBadge")
  ];
  badges.forEach((b) => {
    if (!b) return;
    if (count > 0) {
      b.textContent = count > 99 ? "99+" : String(count);
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  });

  // Update any injected nav badges (other pages)
  document.querySelectorAll(".nav-msg-badge").forEach((badge) => {
    badge.setAttribute("data-count", String(count));
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.hidden = count <= 0;
  });
}

function schedulePoll() {
  stopPoll();
  _pollTimer = setInterval(() => {
    void updateUnreadBadge().then((shouldContinue) => {
      if (shouldContinue === false) {
        stopPoll();
      }
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
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function getCurrentUserId() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.id || payload.sub || null;
  } catch {
    return null;
  }
}

function showToast(msg) {
  const toast = document.getElementById("messagesToast");
  const text = document.getElementById("messagesToastText");
  if (!toast || !text) return;
  text.textContent = msg;
  toast.classList.remove("hidden");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add("hidden"), TOAST_MS);
}
