"use strict";

let reviewQueue = [];
let activeSupportTransaction = null;
let activeIssueTransaction = null;

function tx(key, fallback) {
  if (typeof window.t === "function") {
    const value = window.t(key);
    if (value && value !== key) return value;
  }
  return fallback || key;
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

function renderSummary(summary = {}) {
  document.getElementById("reviewTotalCount").textContent = String(summary.total || 0);
  document.getElementById("reviewActionCount").textContent = String(summary.actionNeededCount || 0);
  document.getElementById("reviewSupportCount").textContent = String(summary.needsReviewCount || 0);
  document.getElementById("reviewReceiptCount").textContent = String(summary.missingReceiptCount || 0);

  const pills = summarizeTopFlags(summary).map(([flag, count]) => `
    <span class="review-insight-pill">
      <strong>${escapeText(flag)}</strong>
      <span>${escapeText(String(count))}</span>
    </span>
  `).join("");

  document.getElementById("reviewInsightPills").innerHTML = pills || `
    <span class="review-insight-pill review-insight-pill--muted">${escapeText(tx("review_no_insights", "No open flags."))}</span>
  `;
}

function mapFilterStatus(item) {
  if (item.reviewStatus === "Action needed") return "action";
  if (item.reviewStatus === "Needs review") return "review";
  if (item.reviewStatus === "Excluded - review schedule") return "excluded";
  return "all";
}

function renderQueue() {
  const filter = document.getElementById("reviewStatusFilter")?.value || "all";
  const tbody = document.getElementById("reviewQueueBody");
  const loading = document.getElementById("reviewQueueLoading");
  const empty = document.getElementById("reviewQueueEmpty");
  const tableWrap = document.getElementById("reviewTableWrap");

  const filtered = reviewQueue.filter((item) => filter === "all" || mapFilterStatus(item) === filter);

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
    const actionHref = item.actionTarget?.href || "/transactions";
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
            ${issues.map((issue) => `<span class="review-issue-chip">${escapeText(issue)}</span>`).join("")}
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
  } catch (error) {
    console.error("Failed to load review queue:", error);
    reviewQueue = [];
    renderSummary({});
    loading.hidden = false;
    loading.textContent = tx("review_load_error", "Failed to load review queue.");
    empty.hidden = true;
    tableWrap.hidden = true;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

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
