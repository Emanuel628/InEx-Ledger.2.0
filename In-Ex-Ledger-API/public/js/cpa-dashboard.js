document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  await initCpaDashboard();
});

async function initCpaDashboard() {
  const ownerSelect = document.getElementById("cpaOwnerSelect");
  const businessSelect = document.getElementById("cpaBusinessSelect");
  const emptyState = document.getElementById("cpaEmptyState");
  const workspace = document.getElementById("cpaWorkspace");

  if (!ownerSelect || !businessSelect || !emptyState || !workspace) {
    return;
  }

  const meResponse = await apiFetch("/api/me");
  if (!meResponse || !meResponse.ok) {
    emptyState.classList.remove("hidden");
    return;
  }

  const me = await meResponse.json().catch(() => null);
  const portfolios = Array.isArray(me?.assigned_cpa_portfolios) ? me.assigned_cpa_portfolios : [];
  if (!portfolios.length) {
    emptyState.classList.remove("hidden");
    workspace.classList.add("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  workspace.classList.remove("hidden");

  const getActivePortfolio = () =>
    portfolios.find((portfolio) => portfolio.owner_user_id === ownerSelect.value) || portfolios[0];

  const populateOwnerSelect = () => {
    ownerSelect.innerHTML = "";
    portfolios.forEach((portfolio, index) => {
      const option = document.createElement("option");
      option.value = portfolio.owner_user_id;
      option.textContent =
        portfolio.owner_display_name ||
        portfolio.owner_full_name ||
        portfolio.owner_email ||
        `Client ${index + 1}`;
      ownerSelect.appendChild(option);
    });
  };

  const populateBusinessSelect = () => {
    const activePortfolio = getActivePortfolio();
    businessSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent =
      activePortfolio.grant_scope === "all" ? "All granted businesses" : "Granted business";
    businessSelect.appendChild(allOption);

    activePortfolio.businesses.forEach((business) => {
      const option = document.createElement("option");
      option.value = business.id;
      option.textContent = business.name || "Business";
      businessSelect.appendChild(option);
    });
  };

  const loadWorkspace = async () => {
    const ownerUserId = ownerSelect.value;
    const query = businessSelect.value ? `?business_id=${encodeURIComponent(businessSelect.value)}` : "";

    const [summaryResponse, transactionsResponse, receiptsResponse, mileageResponse, exportsResponse, auditResponse] = await Promise.all([
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/summary${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/transactions${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/receipts${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/mileage${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/exports${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/audit${query}`)
    ]);

    const summaryPayload = summaryResponse && summaryResponse.ok ? await summaryResponse.json().catch(() => null) : null;
    const transactionsPayload = transactionsResponse && transactionsResponse.ok ? await transactionsResponse.json().catch(() => null) : null;
    const receiptsPayload = receiptsResponse && receiptsResponse.ok ? await receiptsResponse.json().catch(() => null) : null;
    const mileagePayload = mileageResponse && mileageResponse.ok ? await mileageResponse.json().catch(() => null) : null;
    const exportsPayload = exportsResponse && exportsResponse.ok ? await exportsResponse.json().catch(() => null) : null;
    const auditPayload = auditResponse && auditResponse.ok ? await auditResponse.json().catch(() => null) : null;

    const businessSummaries = Array.isArray(summaryPayload?.business_summaries) ? summaryPayload.business_summaries : [];
    renderSummary(summaryPayload?.summary || {}, summaryPayload?.grant_scope || "business", businessSummaries);
    renderBusinessContext(businessSummaries, businessSelect.value);
    renderTransactions(Array.isArray(transactionsPayload?.data) ? transactionsPayload.data : []);
    renderReceipts(Array.isArray(receiptsPayload?.receipts) ? receiptsPayload.receipts : []);
    renderMileage(Array.isArray(mileagePayload?.data) ? mileagePayload.data : []);
    renderExports(Array.isArray(exportsPayload?.exports) ? exportsPayload.exports : []);
    renderAuditLog(Array.isArray(auditPayload?.logs) ? auditPayload.logs : []);
  };

  populateOwnerSelect();
  populateBusinessSelect();

  ownerSelect.addEventListener("change", async () => {
    populateBusinessSelect();
    await loadWorkspace();
  });

  businessSelect.addEventListener("change", async () => {
    await loadWorkspace();
  });

  document.addEventListener("click", async (event) => {
    const trigger = event.target instanceof HTMLElement
      ? event.target.closest("[data-cpa-export-download], [data-cpa-receipt-download]")
      : null;
    if (!(trigger instanceof HTMLButtonElement)) {
      return;
    }

    const ownerUserId = ownerSelect.value;
    if (!ownerUserId) {
      return;
    }

    const query = businessSelect.value ? `?business_id=${encodeURIComponent(businessSelect.value)}` : "";
    trigger.disabled = true;
    trigger.textContent = "Downloading...";
    try {
      const exportId = trigger.getAttribute("data-cpa-export-download") || "";
      const receiptId = trigger.getAttribute("data-cpa-receipt-download") || "";
      const downloadUrl = exportId
        ? `/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/exports/${encodeURIComponent(exportId)}/redacted${query}`
        : `/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/receipts/${encodeURIComponent(receiptId)}${query}`;
      if (!exportId && !receiptId) {
        throw new Error("Download target missing");
      }

      const response = await apiFetch(downloadUrl);
      if (!response || !response.ok) {
        throw new Error("Download failed");
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      const fallbackName = exportId
        ? `inex-ledger-cpa-export-${exportId}.pdf`
        : `inex-ledger-cpa-receipt-${receiptId}`;
      anchor.download = getDownloadFilename(response, fallbackName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("[CPA] Download failed", error);
      trigger.textContent = "Retry download";
      trigger.disabled = false;
      return;
    }
    trigger.textContent = trigger.hasAttribute("data-cpa-export-download")
      ? "Download redacted PDF"
      : "Download receipt";
    trigger.disabled = false;
  });

  await loadWorkspace();
}

function renderSummary(summary, grantScope, businessSummaries) {
  const income = document.getElementById("cpaIncomeValue");
  const expenses = document.getElementById("cpaExpensesValue");
  const net = document.getElementById("cpaNetValue");
  const transactionCount = document.getElementById("cpaTransactionCountValue");
  const receiptCount = document.getElementById("cpaReceiptCountValue");
  const mileageCount = document.getElementById("cpaMileageCountValue");
  const exportCount = document.getElementById("cpaExportCountValue");
  const scopeValue = document.getElementById("cpaScopeValue");
  const mixedScope = summary.mixed_currency_scope === true;
  const currency = summary.currency || (businessSummaries[0]?.currency || "USD");

  if (income) {
    income.textContent = mixedScope ? "Mixed scope" : formatCpaMoney(summary.total_income || 0, null, currency);
    income.title = mixedScope ? "This scope spans multiple currencies. Review the business context cards below." : "";
  }
  if (expenses) {
    expenses.textContent = mixedScope ? "Mixed scope" : formatCpaMoney(summary.total_expenses || 0, null, currency);
    expenses.title = mixedScope ? "This scope spans multiple currencies. Review the business context cards below." : "";
  }
  if (net) {
    net.textContent = mixedScope ? "Mixed scope" : formatCpaMoney(summary.net_profit || 0, null, currency);
    net.title = mixedScope ? "This scope spans multiple currencies. Review the business context cards below." : "";
  }
  if (transactionCount) transactionCount.textContent = String(summary.transaction_count || 0);
  if (receiptCount) receiptCount.textContent = String(summary.receipt_count || 0);
  if (mileageCount) mileageCount.textContent = String(summary.mileage_count || 0);
  if (exportCount) exportCount.textContent = String(summary.export_count || 0);
  if (scopeValue) {
    scopeValue.textContent = grantScope === "all" ? "All granted businesses" : "One granted business";
    if (mixedScope) {
      scopeValue.textContent += " • mixed currencies";
    }
  }
}

function renderBusinessContext(businessSummaries, selectedBusinessId) {
  const list = document.getElementById("cpaBusinessContextList");
  if (!list) {
    return;
  }

  if (!businessSummaries.length) {
    list.innerHTML = '<div class="cpa-list-empty">No business context found.</div>';
    return;
  }

  list.innerHTML = businessSummaries.map((summary) => {
    const selectedBadge = selectedBusinessId && selectedBusinessId === summary.business_id
      ? '<span class="cpa-context-pill selected">Selected</span>'
      : "";
    const province = summary.province ? ` • ${escapeCpaHtml(summary.province)}` : "";
    return `
      <article class="cpa-context-card">
        <div class="cpa-context-head">
          <div>
            <h3>${escapeCpaHtml(summary.business_name || "Business")}</h3>
            <p>${escapeCpaHtml(summary.tax_form_label || "-")} • ${escapeCpaHtml(summary.currency || "USD")}${province}</p>
          </div>
          ${selectedBadge}
        </div>
        <div class="cpa-context-grid">
          <div>
            <span>Income</span>
            <strong>${escapeCpaHtml(formatCpaMoney(summary.total_income || 0, null, summary.currency || "USD"))}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong>${escapeCpaHtml(formatCpaMoney(summary.total_expenses || 0, null, summary.currency || "USD"))}</strong>
          </div>
          <div>
            <span>Net</span>
            <strong>${escapeCpaHtml(formatCpaMoney(summary.net_profit || 0, null, summary.currency || "USD"))}</strong>
          </div>
          <div>
            <span>Transactions</span>
            <strong>${escapeCpaHtml(String(summary.transaction_count || 0))}</strong>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderTransactions(transactions) {
  const body = document.getElementById("cpaTransactionsBody");
  if (!body) {
    return;
  }

  if (!transactions.length) {
    body.innerHTML = '<tr><td colspan="6">No transactions found.</td></tr>';
    return;
  }

  body.innerHTML = transactions.slice(0, 12).map((transaction) => {
    const currency = inferCurrencyFromRegion(transaction.business_region);
    return `
      <tr>
        <td>${escapeCpaHtml(formatCpaDate(transaction.date))}</td>
        <td>${escapeCpaHtml(transaction.business_name || "-")}</td>
        <td>${escapeCpaHtml(transaction.description || "-")}</td>
        <td>${escapeCpaHtml(transaction.category_name || "-")}</td>
        <td><span class="cpa-status ${transaction.cleared ? "cleared" : "pending"}">${transaction.cleared ? "Cleared" : "Pending"}</span></td>
        <td>${escapeCpaHtml(formatCpaMoney(Math.abs(Number(transaction.amount) || 0), transaction.type === "income", currency))}</td>
      </tr>
    `;
  }).join("");
}

function renderReceipts(receipts) {
  const list = document.getElementById("cpaReceiptsList");
  if (!list) {
    return;
  }

  if (!receipts.length) {
    list.innerHTML = '<div class="cpa-list-empty">No receipts found.</div>';
    return;
  }

  list.innerHTML = receipts.slice(0, 8).map((receipt) => `
    <div class="cpa-list-item cpa-list-item-action">
      <div class="cpa-list-copy">
        <p class="cpa-list-title">${escapeCpaHtml(receipt.filename || "Receipt")}</p>
        <p class="cpa-list-meta">${escapeCpaHtml(receipt.business_name || "-")} • ${escapeCpaHtml(formatCpaDate(receipt.created_at))}</p>
      </div>
      <div class="cpa-list-actions">
        <button
          type="button"
          class="cpa-download-button secondary"
          data-cpa-receipt-download="${escapeCpaHtml(receipt.id || "")}"
        >
          Download receipt
        </button>
      </div>
    </div>
  `).join("");
}

function renderMileage(mileageRecords) {
  const list = document.getElementById("cpaMileageList");
  if (!list) {
    return;
  }

  if (!mileageRecords.length) {
    list.innerHTML = '<div class="cpa-list-empty">No mileage records found.</div>';
    return;
  }

  list.innerHTML = mileageRecords.slice(0, 8).map((entry) => {
    const distance = Number(entry.km) > 0
      ? `${Number(entry.km).toFixed(1)} km`
      : `${Number(entry.miles || 0).toFixed(1)} mi`;
    return `
      <div class="cpa-list-item">
        <p class="cpa-list-title">${escapeCpaHtml(entry.purpose || "Business trip")}</p>
        <p class="cpa-list-meta">${escapeCpaHtml(entry.business_name || "-")} • ${escapeCpaHtml(formatCpaDate(entry.trip_date))}</p>
        <p class="cpa-list-meta">${escapeCpaHtml(entry.destination || "No destination noted")} • ${escapeCpaHtml(distance)}</p>
      </div>
    `;
  }).join("");
}
function renderExports(exportsList) {
  const list = document.getElementById("cpaExportsList");
  if (!list) {
    return;
  }

  if (!exportsList.length) {
    list.innerHTML = '<div class="cpa-list-empty">No exports found.</div>';
    return;
  }

  list.innerHTML = exportsList.slice(0, 8).map((entry) => {
    const currency = entry.currency || inferCurrencyFromRegion(entry.business_region);
    const taxLabel = inferTaxFormLabel(entry.business_region);
    return `
      <div class="cpa-list-item cpa-list-item-action">
        <div class="cpa-list-copy">
          <p class="cpa-list-title">${escapeCpaHtml((entry.export_type || "export").toUpperCase())} • ${escapeCpaHtml(entry.business_name || "-")}</p>
          <p class="cpa-list-meta">${escapeCpaHtml(taxLabel)} • ${escapeCpaHtml(currency)} • ${escapeCpaHtml(formatCpaDate(entry.start_date))} to ${escapeCpaHtml(formatCpaDate(entry.end_date))}</p>
          <p class="cpa-list-meta">${escapeCpaHtml(formatCpaDate(entry.created_at))}</p>
        </div>
        <button
          type="button"
          class="cpa-download-button"
          data-cpa-export-download="${escapeCpaHtml(entry.id || "")}"
        >
          Download redacted PDF
        </button>
      </div>
    `;
  }).join("");
}

function renderAuditLog(logs) {
  const list = document.getElementById("cpaAuditList");
  if (!list) {
    return;
  }

  if (!logs.length) {
    list.innerHTML = '<div class="cpa-list-empty">No audit events found.</div>';
    return;
  }

  list.innerHTML = logs.slice(0, 10).map((entry) => `
    <div class="cpa-list-item">
      <p class="cpa-list-title">${escapeCpaHtml(formatAuditAction(entry.action))}</p>
      <p class="cpa-list-meta">${escapeCpaHtml(entry.business_name || "Portfolio-wide")} • ${escapeCpaHtml(formatCpaDateTime(entry.created_at))}</p>
      <p class="cpa-list-meta">${escapeCpaHtml(entry.actor_email || "System")}</p>
    </div>
  `).join("");
}

function formatCpaMoney(amount, positive = null, currency = "USD") {
  const value = Number(amount) || 0;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2
  }).format(value);

  if (positive === true) {
    return `+${formatted}`;
  }
  if (positive === false) {
    return `-${formatted}`;
  }
  return formatted;
}

function formatCpaDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCpaDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function inferCurrencyFromRegion(region) {
  return String(region || "").toUpperCase() === "CA" ? "CAD" : "USD";
}

function inferTaxFormLabel(region) {
  return String(region || "").toUpperCase() === "CA" ? "Canada T2125" : "U.S. Schedule C";
}

function formatAuditAction(action) {
  const labels = {
    grant_auto_accepted: "Grant auto-accepted",
    grant_created_active: "Grant created",
    grant_created_pending: "Invite created",
    grant_revoked: "Grant revoked",
    portfolio_summary_viewed: "Summary reviewed",
    portfolio_transactions_viewed: "Transactions reviewed",
    portfolio_receipts_viewed: "Receipts reviewed",
    portfolio_mileage_viewed: "Mileage reviewed",
    portfolio_exports_viewed: "Exports reviewed",
    portfolio_audit_viewed: "Audit feed viewed",
    portfolio_export_downloaded: "Redacted export downloaded",
    portfolio_receipt_downloaded: "Receipt downloaded"
  };
  return labels[action] || String(action || "activity").replace(/_/g, " ");
}

function getDownloadFilename(response, fallback) {
  const header = response.headers.get("content-disposition") || "";
  const utfMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }
  const simpleMatch = header.match(/filename="?([^";]+)"?/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }
  return fallback;
}

function escapeCpaHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}



