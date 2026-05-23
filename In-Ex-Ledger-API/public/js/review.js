"use strict";

let reviewQueue = [];

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
          <a class="review-row-action" href="${escapeText(actionHref)}">${escapeText(actionLabel)}</a>
        </td>
      </tr>
    `;
  }).join("");
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

  await loadReviewQueue();
});
