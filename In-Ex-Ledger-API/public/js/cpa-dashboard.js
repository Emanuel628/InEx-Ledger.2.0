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

  const populateOwnerSelect = () => {
    ownerSelect.innerHTML = "";
    portfolios.forEach((portfolio, index) => {
      const option = document.createElement("option");
      option.value = portfolio.owner_user_id;
      option.textContent = portfolio.owner_display_name || portfolio.owner_full_name || portfolio.owner_email || `Client ${index + 1}`;
      ownerSelect.appendChild(option);
    });
  };

  const populateBusinessSelect = () => {
    const activePortfolio = portfolios.find((portfolio) => portfolio.owner_user_id === ownerSelect.value) || portfolios[0];
    businessSelect.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = activePortfolio.grant_scope === "all" ? "All granted businesses" : "Granted business";
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

    const [summaryResponse, transactionsResponse, receiptsResponse, exportsResponse] = await Promise.all([
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/summary${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/transactions${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/receipts${query}`),
      apiFetch(`/api/cpa-access/portfolio/${encodeURIComponent(ownerUserId)}/exports${query}`)
    ]);

    const summaryPayload = summaryResponse && summaryResponse.ok ? await summaryResponse.json().catch(() => null) : null;
    const transactionsPayload = transactionsResponse && transactionsResponse.ok ? await transactionsResponse.json().catch(() => null) : null;
    const receiptsPayload = receiptsResponse && receiptsResponse.ok ? await receiptsResponse.json().catch(() => null) : null;
    const exportsPayload = exportsResponse && exportsResponse.ok ? await exportsResponse.json().catch(() => null) : null;

    renderSummary(summaryPayload?.summary || {}, summaryPayload?.grant_scope || "business");
    renderTransactions(Array.isArray(transactionsPayload?.data) ? transactionsPayload.data : []);
    renderReceipts(Array.isArray(receiptsPayload?.receipts) ? receiptsPayload.receipts : []);
    renderExports(Array.isArray(exportsPayload?.exports) ? exportsPayload.exports : []);
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

  await loadWorkspace();
}

function renderSummary(summary, grantScope) {
  const income = document.getElementById("cpaIncomeValue");
  const expenses = document.getElementById("cpaExpensesValue");
  const net = document.getElementById("cpaNetValue");
  const transactionCount = document.getElementById("cpaTransactionCountValue");
  const receiptCount = document.getElementById("cpaReceiptCountValue");
  const mileageCount = document.getElementById("cpaMileageCountValue");
  const exportCount = document.getElementById("cpaExportCountValue");
  const scopeValue = document.getElementById("cpaScopeValue");

  if (income) income.textContent = formatCpaMoney(summary.total_income || 0);
  if (expenses) expenses.textContent = formatCpaMoney(summary.total_expenses || 0);
  if (net) net.textContent = formatCpaMoney(summary.net_profit || 0);
  if (transactionCount) transactionCount.textContent = String(summary.transaction_count || 0);
  if (receiptCount) receiptCount.textContent = String(summary.receipt_count || 0);
  if (mileageCount) mileageCount.textContent = String(summary.mileage_count || 0);
  if (exportCount) exportCount.textContent = String(summary.export_count || 0);
  if (scopeValue) scopeValue.textContent = grantScope === "all" ? "All granted businesses" : "One granted business";
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

  body.innerHTML = transactions.slice(0, 12).map((transaction) => `
    <tr>
      <td>${escapeCpaHtml(formatCpaDate(transaction.date))}</td>
      <td>${escapeCpaHtml(transaction.business_name || "-")}</td>
      <td>${escapeCpaHtml(transaction.description || "-")}</td>
      <td>${escapeCpaHtml(transaction.category_name || "-")}</td>
      <td><span class="cpa-status ${transaction.cleared ? "cleared" : "pending"}">${transaction.cleared ? "Cleared" : "Pending"}</span></td>
      <td>${escapeCpaHtml(formatCpaMoney(Math.abs(Number(transaction.amount) || 0), transaction.type === "income"))}</td>
    </tr>
  `).join("");
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
    <div class="cpa-list-item">
      <p class="cpa-list-title">${escapeCpaHtml(receipt.filename || "Receipt")}</p>
      <p class="cpa-list-meta">${escapeCpaHtml(receipt.business_name || "-")} · ${escapeCpaHtml(formatCpaDate(receipt.created_at))}</p>
    </div>
  `).join("");
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

  list.innerHTML = exportsList.slice(0, 8).map((entry) => `
    <div class="cpa-list-item">
      <p class="cpa-list-title">${escapeCpaHtml((entry.export_type || "export").toUpperCase())} · ${escapeCpaHtml(entry.business_name || "-")}</p>
      <p class="cpa-list-meta">${escapeCpaHtml(formatCpaDate(entry.start_date))} to ${escapeCpaHtml(formatCpaDate(entry.end_date))} · ${escapeCpaHtml(formatCpaDate(entry.created_at))}</p>
    </div>
  `).join("");
}

function formatCpaMoney(amount, positive = null) {
  const value = Number(amount) || 0;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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

function escapeCpaHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
