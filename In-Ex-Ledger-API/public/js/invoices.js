/* invoices.js — Pro-plan invoicing for InEx Ledger */

let invoiceList = [];
let activeInvoiceId = null;
let pendingDeleteId = null;
let invoiceStatusFilter = "";

let invoiceDefaultCurrency = "CAD";

function currencyForRegion(region) {
  const normalized = String(region || "").trim().toUpperCase();
  return normalized === "US" ? "USD" : "CAD";
}

async function loadInvoiceDefaults() {
  try {
    const res = await apiFetch("/api/me");
    if (!res || !res.ok) return;

    const profile = await res.json();
    const region =
      profile?.active_business?.region ||
      profile?.onboarding?.data?.region ||
      profile?.country ||
      "CA";

    invoiceDefaultCurrency = currencyForRegion(region);
  } catch (_) {
    invoiceDefaultCurrency = "CAD";
  }
}

const STATUS_LABELS = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Void" };
const STATUS_CLASSES = { draft: "badge-draft", sent: "badge-sent", paid: "badge-paid", void: "badge-void" };

function fmtMoney(amount, currency) {
  const n = Number(amount) || 0;
  const locale = (typeof navigator !== "undefined" && navigator.language) || "en-CA";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "CAD",
    minimumFractionDigits: 2
  }).format(n);
}

function fmtDate(value) {
  if (!value) return "—";

  const raw = String(value);
  const dateOnly = raw.includes("T") ? raw.slice(0, 10) : raw;
  const d = new Date(`${dateOnly}T00:00:00`);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function isOverdue(invoice) {
  if (!invoice.due_date || invoice.status === "paid" || invoice.status === "void") return false;
  return new Date(invoice.due_date) < new Date();
}

/* ── Load & render ─────────────────────────────────────── */

async function loadInvoices() {
  try {
    const url = invoiceStatusFilter
      ? `/api/invoices-v1?status=${encodeURIComponent(invoiceStatusFilter)}`
      : "/api/invoices-v1";
    const res = await apiFetch(url);
    if (!res || !res.ok) throw new Error("Failed");
    invoiceList = await res.json();
    renderInvoiceTable();
    renderInvoiceStats();
  } catch (err) {
    document.getElementById("invoiceTableBody").innerHTML =
      '<tr><td colspan="7" class="placeholder">Unable to load invoices. Please try again.</td></tr>';
  }
}

function renderInvoiceStats() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const outstanding = invoiceList
    .filter((inv) => inv.status === "sent")
    .reduce((s, inv) => s + Number(inv.total_amount), 0);

  const paid30 = invoiceList
    .filter((inv) => inv.status === "paid" && new Date(inv.updated_at) >= thirtyDaysAgo)
    .reduce((s, inv) => s + Number(inv.total_amount), 0);

  const drafts = invoiceList.filter((inv) => inv.status === "draft").length;
  const overdue = invoiceList.filter(isOverdue).length;
  const sampleCurrency = invoiceList[0]?.currency || "CAD";

  document.getElementById("statOutstanding").textContent = fmtMoney(outstanding, sampleCurrency);
  document.getElementById("statPaid30").textContent = fmtMoney(paid30, sampleCurrency);
  document.getElementById("statDrafts").textContent = String(drafts);
  document.getElementById("statTotal").textContent = String(invoiceList.length);
  const overdueEl = document.getElementById("statOverdue");
  if (overdueEl) {
    overdueEl.textContent = overdue > 0 ? `${overdue} overdue` : "";
    overdueEl.className = overdue > 0 ? "stat-delta stat-delta--warn" : "stat-delta";
  }
}

function renderInvoiceTable() {
  const tbody = document.getElementById("invoiceTableBody");
  if (!invoiceList.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="placeholder">No invoices yet. Click <strong>+ New invoice</strong> to create one.</td></tr>';
    return;
  }

  tbody.innerHTML = invoiceList.map((inv) => {
    const overdue = isOverdue(inv);
    const statusClass = STATUS_CLASSES[inv.status] || "";
    const overdueTag = overdue ? '<span class="badge badge-overdue">Overdue</span>' : "";
    return `<tr data-id="${escapeHtml(inv.id)}">
      <td class="inv-number">${escapeHtml(inv.invoice_number)}</td>
      <td>${escapeHtml(inv.customer_name)}</td>
      <td>${escapeHtml(fmtDate(inv.issue_date))}</td>
      <td>${escapeHtml(fmtDate(inv.due_date))}${overdueTag}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(STATUS_LABELS[inv.status] || inv.status)}</span></td>
      <td class="col-amount">${escapeHtml(fmtMoney(inv.total_amount, inv.currency))}</td>
      <td class="col-actions">
      ${invoiceStatusFilter === "deleted"
        ? `<button class="tx-action-btn action-restore" data-action="restore" data-id="${escapeHtml(inv.id)}" title="Restore">Restore</button>`: `
      <button class="tx-action-btn" data-action="edit" data-id="${escapeHtml(inv.id)}" title="Edit">Edit</button>
      ${inv.status === "draft" ? `<button class="tx-action-btn action-email" data-action="email" data-id="${escapeHtml(inv.id)}" title="Email invoice">Email</button>` : ""}
      ${inv.status === "sent" ? `<button class="tx-action-btn action-pay" data-action="pay" data-id="${escapeHtml(inv.id)}" title="Mark paid">Mark paid</button>` : ""}
      <button class="tx-action-btn action-delete" data-action="delete" data-id="${escapeHtml(inv.id)}" title="Delete">Delete</button>
    `}
</td>
    </tr>`;
  }).join("");
}

/* ── Invoice Panel (create/edit) ───────────────────────── */

function openInvoicePanel(invoiceId) {
  const panel = document.getElementById("invoicePanel");
  const title = document.getElementById("invoicePanelTitle");
  const errorEl = document.getElementById("invoiceFormError");

  activeInvoiceId = invoiceId || null;
  title.textContent = invoiceId ? "Edit Invoice" : "New Invoice";
  errorEl.hidden = true;

  if (invoiceId) {
    const inv = invoiceList.find((i) => i.id === invoiceId);
    if (inv) populateInvoiceForm(inv);
  } else {
    resetInvoiceForm();
  }

  panel.hidden = false;
  panel.querySelector("#invClientName")?.focus();
}

function closeInvoicePanel() {
  document.getElementById("invoicePanel").hidden = true;
  activeInvoiceId = null;
}

function resetInvoiceForm() {
  document.getElementById("invClientName").value = "";
  document.getElementById("invClientEmail").value = "";
  document.getElementById("invIssueDate").value = new Date().toISOString().slice(0, 10);
  const due = new Date();
  due.setDate(due.getDate() + 30);
  document.getElementById("invDueDate").value = due.toISOString().slice(0, 10);
  document.getElementById("invCurrency").value = "CAD";
  document.getElementById("invTaxRate").value = "0";
  document.getElementById("invNotes").value = "";
  document.getElementById("lineItemRows").innerHTML = "";
  addLineItemRow({ description: "", quantity: 1, unit_price: "" });
  recalcTotals();
}

function populateInvoiceForm(inv) {
  document.getElementById("invClientName").value = inv.customer_name || "";
  document.getElementById("invClientEmail").value = inv.customer_email || "";
  document.getElementById("invIssueDate").value = inv.issue_date || "";
  document.getElementById("invDueDate").value = inv.due_date || "";
  document.getElementById("invCurrency").value = inv.currency || "CAD";
  document.getElementById("invTaxRate").value = Number((Number(inv.tax_rate || 0) * 100).toFixed(3));
  document.getElementById("invNotes").value = inv.notes || "";

  const rowsEl = document.getElementById("lineItemRows");
  rowsEl.innerHTML = "";
  const items = Array.isArray(inv.line_items) ? inv.line_items : [];
  if (items.length) {
    items.forEach((item) => addLineItemRow(item));
  } else {
    addLineItemRow({ description: "", quantity: 1, unit_price: "" });
  }
  recalcTotals();
}

function addLineItemRow(item) {
  const container = document.getElementById("lineItemRows");
  const row = document.createElement("div");
  row.className = "invoice-line-row";
  row.innerHTML = `
    <input type="text" class="form-control line-desc" placeholder="Description" value="${escapeHtml(item.description || "")}" />
    <input type="number" class="form-control line-qty" placeholder="1" min="0.01" step="0.01" value="${escapeHtml(String(item.quantity ?? 1))}" />
    <input type="number" class="form-control line-rate" placeholder="0.00" min="0" step="0.01" value="${escapeHtml(String(item.unit_price ?? ""))}" />
    <span class="line-amt">$0.00</span>
    <button type="button" class="line-remove" aria-label="Remove line">×</button>
  `;
  row.querySelector(".line-remove").addEventListener("click", () => {
    row.remove();
    recalcTotals();
  });
  row.querySelector(".line-qty").addEventListener("input", recalcTotals);
  row.querySelector(".line-rate").addEventListener("input", recalcTotals);
  container.appendChild(row);
  recalcTotals();
}

function recalcTotals() {
  const rows = document.querySelectorAll(".invoice-line-row");
  const currency = document.getElementById("invCurrency")?.value || "CAD";
  const taxRatePct = Number(document.getElementById("invTaxRate")?.value || 0);
  const taxRate = taxRatePct / 100;

  let subtotal = 0;
  rows.forEach((row) => {
    const qty = Number(row.querySelector(".line-qty")?.value || 0);
    const rate = Number(row.querySelector(".line-rate")?.value || 0);
    const amt = Number((qty * rate).toFixed(2));
    subtotal += amt;
    const amtEl = row.querySelector(".line-amt");
    if (amtEl) amtEl.textContent = fmtMoney(amt, currency);
  });

  const taxAmount = Number((subtotal * taxRate).toFixed(2));
  const total = subtotal + taxAmount;

  document.getElementById("invSubtotal").textContent = fmtMoney(subtotal, currency);
  document.getElementById("invTaxLabel").textContent = `Tax (${taxRatePct}%)`;
  document.getElementById("invTaxAmount").textContent = fmtMoney(taxAmount, currency);
  document.getElementById("invTotal").textContent = fmtMoney(total, currency);
}

function collectInvoicePayload(status) {
  const lineRows = document.querySelectorAll(".invoice-line-row");
  const lineItems = Array.from(lineRows).map((row) => ({
    description: row.querySelector(".line-desc")?.value?.trim() || "",
    quantity: Number(row.querySelector(".line-qty")?.value || 1),
    unit_price: Number(row.querySelector(".line-rate")?.value || 0)
  })).filter((i) => i.description || i.unit_price > 0);

  const taxRatePct = Number(document.getElementById("invTaxRate")?.value || 0);

  return {
    customer_name: document.getElementById("invClientName")?.value?.trim() || "",
    customer_email: document.getElementById("invClientEmail")?.value?.trim() || "",
    issue_date: document.getElementById("invIssueDate")?.value || "",
    due_date: document.getElementById("invDueDate")?.value || "",
    currency: document.getElementById("invCurrency")?.value || "CAD",
    tax_rate: taxRatePct / 100,
    line_items: lineItems,
    notes: document.getElementById("invNotes")?.value?.trim() || "",
    status: status || "draft"
  };
}

async function saveInvoice(status) {
  const errorEl = document.getElementById("invoiceFormError");
  errorEl.hidden = true;

  const payload = collectInvoicePayload(status);

  const submitBtn = document.getElementById("invoiceSubmit");
  const draftBtn = document.getElementById("invoiceSaveDraft");
  submitBtn.disabled = true;
  draftBtn.disabled = true;

  try {
    const url = activeInvoiceId ? `/api/invoices-v1/${activeInvoiceId}` : "/api/invoices-v1";
    const method = activeInvoiceId ? "PUT" : "POST";
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      errorEl.textContent = data.error || "Failed to save invoice.";
      errorEl.hidden = false;
      return;
    }

    if (status === "sent") {
  await sendInvoiceAfterSave(data);
    }

    closeInvoicePanel();
    await loadInvoices();
    
  } catch (err) {
  errorEl.textContent = err.message || "An unexpected error occurred. Please try again.";
  errorEl.hidden = false;
  
  } finally {
    submitBtn.disabled = false;
    draftBtn.disabled = false;
  }
}

async function sendInvoiceAfterSave(invoice) {
  const invoiceId = invoice?.id;
  const recipient = String(invoice?.customer_email || "").trim();

  if (!invoiceId) {
    throw new Error("Invoice was saved, but no invoice ID was returned.");
  }

  if (!recipient || !recipient.includes("@")) {
    throw new Error("Invoice was saved, but no valid customer email was found.");
  }

  const res = await apiFetch(`/api/invoices-v1/${encodeURIComponent(invoiceId)}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient_email: recipient
    })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "Invoice was saved, but the email failed to send.");
  }

  return data;
}

async function updateInvoiceStatus(id, status) {
  try {
    const res = await apiFetch(`/api/invoices-v1/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Failed to update status.");
      return;
    }
    await loadInvoices();
  } catch (err) {
    alert("An unexpected error occurred.");
  }
}

async function deleteInvoice(id) {
  try {
    const res = await apiFetch(`/api/invoices-v1/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      alert(d.error || "Failed to delete invoice.");
      return;
    }
    await loadInvoices();
  } catch (err) {
    alert("An unexpected error occurred.");
  }
}

async function restoreInvoice(id) {
  try {
    const res = await apiFetch(`/api/invoices-v1/${id}/restore`, {
      method: "PATCH"
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Failed to restore invoice.");
      return;
    }

    await loadInvoices();
  } catch (err) {
    alert("An unexpected error occurred.");
  }
}

/* ── Event wiring ──────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  // Status filter from URL
  const params = new URLSearchParams(window.location.search);
  invoiceStatusFilter = params.get("status") || "";
  const filterSelect = document.getElementById("invoiceStatusFilter");
  if (filterSelect && invoiceStatusFilter) filterSelect.value = invoiceStatusFilter;

  document.querySelectorAll(".app-sidebar .sidebar-link").forEach((link) => {
  link.classList.remove("is-active");
});

const sidebarMap = {
  "": "sidebarAll",
  draft: "sidebarDraft",
  sent: "sidebarSent",
  paid: "sidebarPaid",
  deleted: "sidebarDeleted"
};

const activeSidebarId = sidebarMap[invoiceStatusFilter] || "sidebarAll";
document.getElementById(activeSidebarId)?.classList.add("is-active");
  await loadInvoices();

  // Auto-open the New Invoice panel when arriving via ?new=1 (e.g. from the
  // Quick Add sidebar on the Transactions page).
  if (params.get("new") === "1") {
    openInvoicePanel(null);
  }

  document.getElementById("newInvoiceBtn")?.addEventListener("click", () => openInvoicePanel(null));
  document.getElementById("invoicePanelClose")?.addEventListener("click", closeInvoicePanel);

  document.getElementById("addLineItemBtn")?.addEventListener("click", () => {
    addLineItemRow({ description: "", quantity: 1, unit_price: "" });
  });

  document.getElementById("invTaxRate")?.addEventListener("input", recalcTotals);
  document.getElementById("invCurrency")?.addEventListener("change", recalcTotals);

  document.getElementById("invoiceSaveDraft")?.addEventListener("click", () => saveInvoice("draft"));

  document.getElementById("invoiceForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    saveInvoice("sent");
  });

  // Table action delegation
  document.getElementById("invoiceTableBody")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "edit") {
  openInvoicePanel(id);
} else if (action === "email") {
  openEmailModal(id);
} else if (action === "pay") {
  if (confirm("Mark this invoice as paid?")) await updateInvoiceStatus(id, "paid");
} else if (action === "restore") {
  if (confirm("Restore this invoice?")) await restoreInvoice(id);
} else if (action === "delete") {
  pendingDeleteId = id;

    const inv = invoiceList.find((invoice) => invoice.id === id);
    const wasSent = inv && inv.status !== "draft";
    
    const title = document.querySelector("#invoiceDeleteModal h3");
    const copy = document.querySelector("#invoiceDeleteModal p");

    if (title) {
      title.textContent = wasSent
        ? "Delete sent invoice?"
        : "Delete this draft invoice?";
    }

    if (copy) {
      copy.textContent = wasSent
        ? "This invoice has already been sent or recorded. Deleting it may remove history connected to customer communication and payment tracking. Are you sure you want to delete it?"
        : "This draft invoice has not been sent yet. This cannot be undone.";
    }

    document.getElementById("invoiceDeleteModal").classList.remove("hidden");
  }
});

  document.getElementById("invoiceDeleteCancel")?.addEventListener("click", () => {
    document.getElementById("invoiceDeleteModal").classList.add("hidden");
    pendingDeleteId = null;
  });

  document.getElementById("invoiceDeleteConfirm")?.addEventListener("click", async () => {
    document.getElementById("invoiceDeleteModal").classList.add("hidden");
    if (pendingDeleteId) {
      await deleteInvoice(pendingDeleteId);
      pendingDeleteId = null;
      }
  });

  document.getElementById("invoiceStatusFilter")?.addEventListener("change", async (e) => {
    invoiceStatusFilter = e.target.value;
    await loadInvoices();
  });

  // Email-invoice modal wiring
  document.getElementById("invoiceEmailCancel")?.addEventListener("click", () => {
    document.getElementById("invoiceEmailModal")?.classList.add("hidden");
  });
  document.getElementById("invoiceEmailModal")?.addEventListener("click", (e) => {
    if (e.target.id === "invoiceEmailModal") {
      document.getElementById("invoiceEmailModal").classList.add("hidden");
    }
  });
  document.getElementById("invoiceEmailSend")?.addEventListener("click", async () => {
    await submitInvoiceEmail();
  });
});

/* ── Email invoice modal ─────────────────────────────────── */

let pendingEmailInvoiceId = null;

function openEmailModal(invoiceId) {
  const modal = document.getElementById("invoiceEmailModal");
  if (!modal) return;
  const inv = invoiceList.find((i) => i.id === invoiceId);
  if (!inv) return;
  pendingEmailInvoiceId = invoiceId;
  document.getElementById("invoiceEmailNumber").textContent = inv.invoice_number || "";
  document.getElementById("invoiceEmailCustomer").textContent = inv.customer_name || "";
  document.getElementById("invoiceEmailTo").value = inv.customer_email || "";
  document.getElementById("invoiceEmailMessage").value = "";
  document.getElementById("invoiceEmailError").hidden = true;
  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("invoiceEmailTo")?.focus(), 0);
}

async function submitInvoiceEmail() {
  const id = pendingEmailInvoiceId;
  if (!id) return;
  const recipient = String(document.getElementById("invoiceEmailTo").value || "").trim();
  const customMessage = String(document.getElementById("invoiceEmailMessage").value || "").trim();
  const errorEl = document.getElementById("invoiceEmailError");
  const sendBtn = document.getElementById("invoiceEmailSend");
  errorEl.hidden = true;

  if (!recipient || !recipient.includes("@")) {
    errorEl.textContent = "Please enter a valid recipient email address.";
    errorEl.hidden = false;
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";
  try {
    const res = await apiFetch(`/api/invoices-v1/${id}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_email: recipient, message: customMessage || undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorEl.textContent = data.error || "Failed to send invoice.";
      errorEl.hidden = false;
      return;
    }
    document.getElementById("invoiceEmailModal").classList.add("hidden");
    pendingEmailInvoiceId = null;
    await loadInvoices();
  } catch (err) {
    errorEl.textContent = "An unexpected error occurred.";
    errorEl.hidden = false;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send email";
  }
}
