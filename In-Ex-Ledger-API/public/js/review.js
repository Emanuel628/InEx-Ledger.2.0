"use strict";

let reviewQueue = [];
let activeSupportTransaction = null;
let activeIssueTransaction = null;
let reviewQuickFilter = "all";
const REVIEW_FILTER_PRESETS = Object.freeze([
  { key: "hard", label: "Hard blockers" },
  { key: "warning", label: "Warnings" },
  { key: "needs_category", label: "Needs category" },
  { key: "needs_receipt_support", label: "Missing receipt" },
  { key: "needs_mileage_log", label: "Mileage support" },
  { key: "needs_business_purpose", label: "Business purpose" }
]);

function tx(key, fallback) {
  if (typeof window.t === "function") {
    const value = window.t(key);
    if (value && value !== key) return value;
  }
  return fallback || key;
}

function initReviewFilterFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const requestedIssue = String(params.get("issue") || "").trim().toLowerCase();
  if (!requestedIssue || requestedIssue === "all") {
    return;
  }
  reviewQuickFilter = requestedIssue;
}

function formatMoney(amount, currency) {
  const numeric = Number(amount || 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "USD").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(numeric);
  } catch (_) {
    return `${String(currency || "USD").toUpperCase()} ${numeric.toFixed(2)}`;
  }
}

function escapeText(value) {
  if (typeof window.escapeHtml === "function") {
    return window.escapeHtml(String(value || ""));
  }
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function summarizeTopFlags(summary) {
  return Object.entries(summary?.byFlag || {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
}

function summarizeIssues(queue = []) {
  const stats = {
    hard: 0,
    warning: 0,
    byCode: {}
  };

  queue.forEach((item) => {
    (item.issueEntries || []).forEach((entry) => {
      if (entry.severity === "hard") stats.hard += 1;
      else stats.warning += 1;
      stats.byCode[entry.issueCode] = (stats.byCode[entry.issueCode] || 0) + 1;
    });
  });

  return stats;
}

function renderSummary(summary = {}) {
  document.getElementById("reviewTotalCount").textContent = String(summary.total || 0);
  document.getElementById("reviewActionCount").textContent = String(summary.actionNeededCount || 0);
  document.getElementById("reviewSupportCount").textContent = String(summary.needsReviewCount || 0);
  document.getElementById("reviewReceiptCount").textContent = String(summary.missingReceiptCount || 0);
  const issueSummary = summarizeIssues(reviewQueue);
  document.getElementById("reviewHardCount").textContent = String(issueSummary.hard || 0);
  document.getElementById("reviewWarningCount").textContent = String(issueSummary.warning || 0);

  const pills = summarizeTopFlags(summary).map(([flag, count]) => `
    <span class="review-insight-pill">
      <strong>${escapeText(flag)}</strong>
      <span>${escapeText(String(count))}</span>
    </span>
  `).join("");

  document.getElementById("reviewInsightPills").innerHTML = pills || `
    <span class="review-insight-pill review-insight-pill--muted">${escapeText(tx("review_no_insights", "No open flags."))}</span>
  `;

  renderReviewFocusCard();
  renderQuickFilters(issueSummary);
}

function mapFilterStatus(item) {
  if (item.reviewStatus === "Action needed") return "action";
  if (item.reviewStatus === "Needs review") return "review";
  if (item.reviewStatus === "Excluded - review schedule") return "excluded";
  return "all";
}

function matchesQuickFilter(item, filter) {
  if (filter === "all") return true;
  const entries = item.issueEntries || [];
  if (filter === "hard") return entries.some((entry) => entry.severity === "hard");
  if (filter === "warning") return entries.some((entry) => entry.severity !== "hard");
  return entries.some((entry) => entry.issueCode === filter);
}

function getReviewFocusItem() {
  return reviewQueue.find((item) => (item.issueEntries || []).some((entry) => entry.severity === "hard"))
    || reviewQueue[0]
    || null;
}

function buildTransactionTargetHref(item) {
  if (!item?.id) return "/transactions";

  const rawHref = String(item.actionTarget?.href || "/transactions").trim() || "/transactions";

  try {
    const url = new URL(rawHref, window.location.origin);
    const pathname = url.pathname.replace(/\/html\/transactions\.html$/i, "/transactions");

    if (pathname === "/transactions" || pathname.endsWith("/transactions")) {
      url.pathname = "/transactions";
      url.searchParams.set("open", item.id);
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch (_) {
    // Fall through to safe default.
  }

  return `/transactions?open=${encodeURIComponent(item.id)}`;
}

function openQueueTarget(item) {
  if (!item) return;
  const href = item.actionTarget?.href || "/transactions";
  if (href === "/transactions") {
    const params = new URLSearchParams();
    params.set("highlight", item.id);
    params.set("open", "review");
    window.location.href = `${href}?${params.toString()}`;
    return;
  }
  window.location.href = href;
}

function renderReviewFocusCard() {
  const card = document.getElementById("reviewFocusCard");
  const button = document.getElementById("reviewFixNextButton");
  if (!card || !button) return;

  const item = getReviewFocusItem();
  if (!item) {
    card.hidden = true;
    button.disabled = true;
    return;
  }

  const topIssue = (item.issueEntries || [])[0] || null;
  const severity = topIssue?.severity === "hard" ? "Hard blocker" : "Warning";
  card.hidden = false;
  card.innerHTML = `
    <div class="review-focus-card-copy">
      <span class="review-focus-badge ${topIssue?.severity === "hard" ? "is-hard" : "is-warning"}">${escapeText(severity)}</span>
      <h3>${escapeText(item.description || "(No description)")}</h3>
      <p>${escapeText(item.date || "")} · ${escapeText(item.categoryName || "Uncategorized")} · ${escapeText(formatMoney(item.amount, item.currency))}</p>
      <p class="review-focus-note">${escapeText(topIssue?.label || item.supportSummary || "Needs cleanup")}</p>
    </div>
    <div class="review-focus-card-actions">
      <button type="button" class="review-secondary-btn" data-review-focus-open>Open item</button>
    </div>
  `;
  card.querySelector("[data-review-focus-open]")?.addEventListener("click", () => openQueueTarget(item));
  button.disabled = false;
  button.onclick = () => openQueueTarget(item);
}

function renderQuickFilters(issueSummary) {
  const container = document.getElementById("reviewQuickFilters");
  if (!container) return;

  container.innerHTML = REVIEW_FILTER_PRESETS.map((preset) => {
    const count = preset.key === "hard"
      ? issueSummary.hard || 0
      : preset.key === "warning"
        ? issueSummary.warning || 0
        : (issueSummary.byCode?.[preset.key] || 0);
    return `
      <button
        type="button"
        class="review-quick-filter${reviewQuickFilter === preset.key ? " is-active" : ""}${preset.key === "hard" ? " is-hard" : ""}"
        data-review-quick-filter="${escapeText(preset.key)}"
        ${count === 0 ? "disabled" : ""}
      >
        <span>${escapeText(preset.label)}</span>
        <strong>${escapeText(String(count))}</strong>
      </button>
    `;
  }).join("");

  container.querySelectorAll("[data-review-quick-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-review-quick-filter") || "all";
      reviewQuickFilter = reviewQuickFilter === next ? "all" : next;
      renderQueue();
      renderQuickFilters(issueSummary);
    });
  });
}

function renderQueue() {
  const filter = document.getElementById("reviewStatusFilter")?.value || "all";
  const tbody = document.getElementById("reviewQueueBody");
  const loading = document.getElementById("reviewQueueLoading");
  const empty = document.getElementById("reviewQueueEmpty");
  const tableWrap = document.getElementById("reviewTableWrap");

  const filtered = reviewQueue.filter((item) => {
    if (filter !== "all" && mapFilterStatus(item) !== filter) {
      return false;
    }
    return matchesQuickFilter(item, reviewQuickFilter);
  });

  loading.hidden = true;
  empty.hidden = filtered.length > 0;
  tableWrap.hidden = filtered.length === 0;

  if (!filtered.length) {
    tbody.innerHTML = "";
    return;
  }

  tbody.innerHTML = filtered.map((item) => {
    const issues = Array.isArray(item.issueLabels) && item.issueLabels.length
      ? item.issueLabels
      : [tx("review_issue_fallback", "Needs review")];
    const actionHref = item.actionTarget?.href === "/transactions"
      ? `/transactions?highlight=${encodeURIComponent(item.id)}&open=review`
      : (item.actionTarget?.href || "/transactions");
    const actionLabel = item.actionTarget?.label || tx("review_action_open", "Open");
    const amount = formatMoney(item.amount, item.currency);
    const supportParts = [];
    if (item.supportStatus) supportParts.push(item.supportStatus);
    if (item.receiptAttached) {
      supportParts.push(tx("review_support_receipt_attached", "Receipt attached"));
    } else if ((item.receiptCount || 0) === 0) {
      supportParts.push(tx("review_support_no_receipt", "No receipt linked"));
    }
    return `
      <tr>
        <td>
          <div class="review-transaction-cell">
            <div class="review-transaction-main">${escapeText(item.description || "(No description)")}</div>
            <div class="review-transaction-meta">
              <span>${escapeText(item.date || "")}</span>
              <span>${escapeText(amount)}</span>
              <span>${escapeText(item.categoryName || "")}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="review-status-badge review-status-badge--${escapeText(mapFilterStatus(item))}">
            ${escapeText(item.reviewStatus)}
          </span>
        </td>
        <td>
          <div class="review-issue-list">
            ${((item.issueEntries || []).length
              ? item.issueEntries.map((issue) => `<span class="review-issue-chip ${issue.severity === "hard" ? "is-hard" : "is-warning"}">${escapeText(issue.label)}</span>`).join("")
              : issues.map((issue) => `<span class="review-issue-chip">${escapeText(issue)}</span>`).join(""))}
          </div>
        </td>
        <td>
          <div class="review-support-cell">
            <div>${escapeText(item.supportSummary || item.supportStatus || "")}</div>
            <div class="review-support-subtle">${escapeText(supportParts.join(" · "))}</div>
          </div>
        </td>
        <td>
          <div class="review-row-actions">
            <a class="review-row-action" href="${escapeText(actionHref)}">${escapeText(actionLabel)}</a>
            <button type="button" class="review-row-support-btn" data-support-transaction="${escapeText(item.id)}">${escapeText(tx("review_add_support", "Add support"))}</button>
            <button type="button" class="review-row-support-btn" data-issue-transaction="${escapeText(item.id)}">${escapeText(tx("review_manage_issue", "Manage issue"))}</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.querySelectorAll("[data-support-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      const transactionId = button.getAttribute("data-support-transaction");
      const item = reviewQueue.find((entry) => entry.id === transactionId);
      if (item) {
        void openSupportModal(item);
      }
    });
  });
  tbody.querySelectorAll("[data-issue-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      const transactionId = button.getAttribute("data-issue-transaction");
      const item = reviewQueue.find((entry) => entry.id === transactionId);
      if (item) {
        void openIssueModal(item);
      }
    });
  });
}

function renderExistingArtifacts(artifacts) {
  const container = document.getElementById("supportArtifactExisting");
  if (!container) return;
  if (!Array.isArray(artifacts) || !artifacts.length) {
    container.innerHTML = `
      <div class="review-existing-empty">${escapeText(tx("review_support_none", "No support artifacts on this transaction yet."))}</div>
    `;
    return;
  }

  container.innerHTML = artifacts.map((artifact) => {
    const filename = artifact.filename || artifact.artifact_type || tx("review_support_item", "Support item");
    const detail = [artifact.artifact_type, artifact.review_status].filter(Boolean).join(" · ");
    const hasFile = Boolean(artifact.mime_type);
    return `
      <div class="review-existing-item">
        <div>
          <strong>${escapeText(filename)}</strong>
          <div class="review-support-subtle">${escapeText(detail)}</div>
          ${artifact.notes ? `<div class="review-support-subtle">${escapeText(artifact.notes)}</div>` : ""}
        </div>
        ${hasFile ? `<a class="review-row-action" href="/api/support-artifacts/${escapeText(artifact.id)}" target="_blank" rel="noreferrer">${escapeText(tx("review_support_open", "Open"))}</a>` : ""}
      </div>
    `;
  }).join("");
}

function syncSupportModalType() {
  const type = document.getElementById("supportArtifactType")?.value || "review_note";
  const fileField = document.getElementById("supportArtifactFileField");
  const fileInput = document.getElementById("supportArtifactFile");
  const fileRequired = type !== "review_note";
  if (fileField) {
    fileField.hidden = !fileRequired;
  }
  if (fileInput) {
    fileInput.required = fileRequired;
    if (!fileRequired) {
      fileInput.value = "";
    }
  }
}

function closeSupportModal() {
  activeSupportTransaction = null;
  const modal = document.getElementById("supportArtifactModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  const form = document.getElementById("supportArtifactForm");
  form?.reset();
  syncSupportModalType();
}

function renderIssueList(issues) {
  const container = document.getElementById("reviewIssueExisting");
  if (!container) return;
  if (!Array.isArray(issues) || !issues.length) {
    container.innerHTML = `<div class="review-existing-empty">${escapeText(tx("review_issue_none", "No saved reviewer decisions on this transaction yet."))}</div>`;
    return;
  }
  container.innerHTML = issues.map((issue) => `
    <div class="review-existing-item">
      <div>
        <strong>${escapeText(issue.issue_code || "")}</strong>
        <div class="review-support-subtle">${escapeText(`${issue.issue_severity || "warning"} · ${issue.issue_status || "open"}`)}</div>
        ${issue.review_notes ? `<div class="review-support-subtle">${escapeText(issue.review_notes)}</div>` : ""}
      </div>
      <div class="review-row-actions">
        ${issue.issue_status !== "resolved" ? `<button type="button" class="review-row-support-btn" data-issue-action="resolved" data-issue-id="${escapeText(issue.id)}">${escapeText(tx("review_issue_resolve", "Resolve"))}</button>` : ""}
        ${issue.issue_status !== "waived" ? `<button type="button" class="review-row-support-btn" data-issue-action="waived" data-issue-id="${escapeText(issue.id)}">${escapeText(tx("review_issue_waive", "Waive"))}</button>` : ""}
        ${issue.issue_status !== "open" ? `<button type="button" class="review-row-support-btn" data-issue-action="open" data-issue-id="${escapeText(issue.id)}">${escapeText(tx("review_issue_reopen", "Reopen"))}</button>` : ""}
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-issue-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const issueId = button.getAttribute("data-issue-id");
      const issueStatus = button.getAttribute("data-issue-action");
      await updateIssue(issueId, { issue_status: issueStatus });
      if (activeIssueTransaction) {
        await openIssueModal(activeIssueTransaction);
      }
      await loadReviewQueue();
    });
  });
}

function closeIssueModal() {
  activeIssueTransaction = null;
  document.getElementById("reviewIssueModal")?.classList.add("hidden");
  document.getElementById("reviewIssueForm")?.reset();
}

async function openIssueModal(item) {
  activeIssueTransaction = item;
  document.getElementById("reviewIssueContext").textContent = `${item.description || "(No description)"} · ${item.date || ""}`;
  document.getElementById("reviewIssueTransactionId").value = item.id;
  document.getElementById("reviewIssueCode").value = item.issueEntries?.[0]?.issueCode || "reviewer_note";
  document.getElementById("reviewIssueSeverity").value = item.issueEntries?.[0]?.severity || "warning";
  document.getElementById("reviewIssueNotes").value = "";
  document.getElementById("reviewIssueModal")?.classList.remove("hidden");

  try {
    const response = await apiFetch(`/api/review/issues/${encodeURIComponent(item.id)}`);
    if (!response || !response.ok) {
      throw new Error(tx("review_issue_load_error", "Failed to load reviewer issue state."));
    }
    const issues = await response.json().catch(() => []);
    renderIssueList(issues);
  } catch (error) {
    console.error("Failed to load review issues:", error);
    renderIssueList([]);
  }
}

async function openSupportModal(item) {
  activeSupportTransaction = item;
  const modal = document.getElementById("supportArtifactModal");
  const context = document.getElementById("supportArtifactContext");
  const transactionIdInput = document.getElementById("supportArtifactTransactionId");
  if (!modal || !context || !transactionIdInput) return;

  context.textContent = `${item.description || "(No description)"} · ${item.date || ""}`;
  transactionIdInput.value = item.id;
  modal.classList.remove("hidden");
  syncSupportModalType();

  try {
    const response = await apiFetch(`/api/support-artifacts?transaction_id=${encodeURIComponent(item.id)}`);
    if (!response || !response.ok) {
      throw new Error(tx("review_support_load_error", "Failed to load support artifacts."));
    }
    const artifacts = await response.json().catch(() => []);
    renderExistingArtifacts(artifacts);
  } catch (error) {
    console.error("Failed to load support artifacts:", error);
    renderExistingArtifacts([]);
  }
}

async function saveSupportArtifact(event) {
  event.preventDefault();

  const transactionId = document.getElementById("supportArtifactTransactionId")?.value || "";
  const artifactType = document.getElementById("supportArtifactType")?.value || "review_note";
  const notes = document.getElementById("supportArtifactNotes")?.value.trim() || "";
  const fileInput = document.getElementById("supportArtifactFile");
  const submitButton = document.getElementById("supportArtifactSubmit");

  if (!transactionId) return;

  submitButton.disabled = true;
  submitButton.textContent = tx("review_support_saving", "Saving...");

  try {
    let response;
    if (artifactType === "review_note") {
      response = await apiFetch("/api/support-artifacts/review-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transactionId, notes })
      });
    } else {
      const file = fileInput?.files?.[0] || null;
      if (!file) {
        throw new Error(tx("review_support_file_required", "Choose a support file first."));
      }
      const formData = new FormData();
      formData.append("transaction_id", transactionId);
      formData.append("artifact_type", artifactType);
      formData.append("notes", notes);
      formData.append("artifact", file);
      response = await apiFetch("/api/support-artifacts/upload", {
        method: "POST",
        body: formData
      });
    }

    if (!response || !response.ok) {
      const payload = await response?.json().catch(() => null);
      throw new Error(payload?.error || tx("review_support_save_error", "Failed to save support."));
    }

    await loadReviewQueue();
    if (activeSupportTransaction) {
      const refreshedItem = reviewQueue.find((entry) => entry.id === activeSupportTransaction.id) || activeSupportTransaction;
      await openSupportModal(refreshedItem);
    }
  } catch (error) {
    console.error("Failed to save support artifact:", error);
    window.alert(error.message || tx("review_support_save_error", "Failed to save support."));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = tx("review_support_submit", "Save support");
  }
}

async function updateIssue(issueId, payload) {
  const response = await apiFetch(`/api/review/issues/${encodeURIComponent(issueId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response || !response.ok) {
    const body = await response?.json().catch(() => null);
    throw new Error(body?.error || tx("review_issue_save_error", "Failed to save review issue."));
  }
  return response.json();
}

async function saveReviewIssue(event) {
  event.preventDefault();
  const transactionId = document.getElementById("reviewIssueTransactionId")?.value || "";
  const issueCode = document.getElementById("reviewIssueCode")?.value || "";
  const issueSeverity = document.getElementById("reviewIssueSeverity")?.value || "warning";
  const reviewNotes = document.getElementById("reviewIssueNotes")?.value.trim() || "";
  const submitButton = document.getElementById("reviewIssueSubmit");
  submitButton.disabled = true;
  submitButton.textContent = tx("review_issue_saving", "Saving...");
  try {
    const response = await apiFetch("/api/review/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: transactionId,
        issue_code: issueCode,
        issue_severity: issueSeverity,
        issue_status: "open",
        review_notes: reviewNotes
      })
    });
    if (!response || !response.ok) {
      const body = await response?.json().catch(() => null);
      throw new Error(body?.error || tx("review_issue_save_error", "Failed to save review issue."));
    }
    await loadReviewQueue();
    if (activeIssueTransaction) {
      const refreshed = reviewQueue.find((entry) => entry.id === activeIssueTransaction.id) || activeIssueTransaction;
      await openIssueModal(refreshed);
    }
  } catch (error) {
    console.error("Failed to save review issue:", error);
    window.alert(error.message || tx("review_issue_save_error", "Failed to save review issue."));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = tx("review_issue_submit", "Save issue");
  }
}

async function loadReviewQueue() {
  const loading = document.getElementById("reviewQueueLoading");
  const empty = document.getElementById("reviewQueueEmpty");
  const tableWrap = document.getElementById("reviewTableWrap");

  loading.hidden = false;
  loading.textContent = tx("common_loading", "Loading...");
  empty.hidden = true;
  tableWrap.hidden = true;

  try {
    const response = await apiFetch(`/api/review/queue?_ts=${Date.now()}`);
    if (!response || !response.ok) {
      throw new Error(tx("review_load_error", "Failed to load review queue."));
    }
    const payload = await response.json().catch(() => ({}));
    reviewQueue = Array.isArray(payload.queue) ? payload.queue : [];
    renderSummary(payload.summary || {});
    renderQueue();
    void maybeHandleDeepLinkedReviewAction();
  } catch (error) {
    console.error("Failed to load review queue:", error);
    reviewQueue = [];
    reviewQuickFilter = "all";
    renderSummary({});
    loading.hidden = false;
    loading.textContent = tx("review_load_error", "Failed to load review queue.");
    empty.hidden = true;
    tableWrap.hidden = true;
  }
}

async function maybeHandleDeepLinkedReviewAction() {
  const params = new URLSearchParams(window.location.search);
  const transactionId = String(params.get("transaction") || "").trim();
  const modal = String(params.get("modal") || "").trim().toLowerCase();
  if (!transactionId || !modal) {
    return;
  }

  const item = reviewQueue.find((entry) => String(entry.id) === transactionId);
  if (!item) {
    return;
  }

  if (modal === "support") {
    await openSupportModal(item);
  } else if (modal === "issue") {
    await openIssueModal(item);
  } else {
    return;
  }

  const clean = new URL(window.location.href);
  clean.searchParams.delete("transaction");
  clean.searchParams.delete("modal");
  window.history.replaceState({}, "", clean.toString());
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();
  initReviewFilterFromQuery();

  document.getElementById("reviewRefreshButton")?.addEventListener("click", () => {
    void loadReviewQueue();
  });
  document.getElementById("reviewStatusFilter")?.addEventListener("change", renderQueue);
  document.getElementById("supportArtifactType")?.addEventListener("change", syncSupportModalType);
  document.getElementById("supportArtifactForm")?.addEventListener("submit", saveSupportArtifact);
  document.querySelectorAll("[data-support-modal-close]").forEach((node) => {
    node.addEventListener("click", closeSupportModal);
  });
  document.getElementById("reviewIssueForm")?.addEventListener("submit", saveReviewIssue);
  document.querySelectorAll("[data-issue-modal-close]").forEach((node) => {
    node.addEventListener("click", closeIssueModal);
  });

  await loadReviewQueue();
});
