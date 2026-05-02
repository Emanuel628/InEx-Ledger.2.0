const RECEIPTS_TOAST_MS = 3000;

let receiptsToastTimer = null;
let receiptRecords = [];
let transactionMap = {};
let activeReceiptLinkId = null;
let receiptsLoading = false;
let receiptsLoadFailed = false;

function tx(key) {
  return typeof window.t === "function" ? window.t(key) : key;
}

function missingReceiptMessage() {
  return "This older receipt file is no longer available for preview. Re-upload it to restore viewing.";
}

function buildReceiptsNoCachePath(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_ts=${Date.now()}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  wireReceiptUpload();
  wireReceiptDropZone();
  wireReceiptLinkModal();
  await loadTransactionMap();
  await loadReceipts();
  updateReceiptsDot();
});

function wireUploadInput(inputEl) {
  inputEl?.addEventListener("change", async () => {
    const file = inputEl.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadReceipt(file);
      showReceiptsToast(tx("receipts_uploaded_success"));
      inputEl.value = "";
      if (uploaded?.id) {
        prependUploadedReceipt(uploaded);
      }
      updateReceiptsDot();
    } catch (error) {
      console.error("Receipt upload failed:", error);
      showReceiptsToast(error.message || tx("receipts_error_upload"));
    }
  });
}

function wireReceiptUpload() {
  const uploadButton = document.getElementById("receiptUploadButton");
  const uploadInput = document.getElementById("receiptUploadInput");
  const uploadButtonBottom = document.getElementById("receiptUploadButtonBottom");
  const uploadInputBottom = document.getElementById("receiptUploadInputBottom");

  uploadButton?.addEventListener("click", () => {
    if (!ensureV1Tier()) return;
    uploadInput?.click();
  });
  uploadButtonBottom?.addEventListener("click", () => {
    if (!ensureV1Tier()) return;
    uploadInputBottom?.click();
  });

  wireUploadInput(uploadInput);
  wireUploadInput(uploadInputBottom);
}

function wireReceiptDropZone() {
  const zone = document.getElementById("receiptDropZone");
  const browseBtn = document.getElementById("receiptDropBrowse");
  const uploadInput = document.getElementById("receiptUploadInput");
  if (!zone) return;

  browseBtn?.addEventListener("click", () => {
    if (!ensureV1Tier()) return;
    uploadInput?.click();
  });

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("is-dragover");
  });
  zone.addEventListener("drop", async (e) => {
    e.preventDefault();
    zone.classList.remove("is-dragover");
    if (!ensureV1Tier()) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadReceipt(file);
      showReceiptsToast(tx("receipts_uploaded_success"));
      if (uploaded?.id) {
        prependUploadedReceipt(uploaded);
      }
      updateReceiptsDot();
    } catch (error) {
      showReceiptsToast(error.message || tx("receipts_error_upload"));
    }
  });
}

async function uploadReceipt(file) {
  const formData = new FormData();
  formData.append("receipt", file);

  const response = await fetch(buildApiUrl("/api/receipts"), {
    method: "POST",
    credentials: "include",
    headers: {
      ...authHeader(),
      ...(typeof csrfHeader === "function" ? csrfHeader("POST") : {})
    },
    body: formData
  });

  if (response.status === 402) {
    throw new Error(tx("receipts_error_v1_required"));
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.error || tx("receipts_error_upload"));
  }

  return response.json().catch(() => ({}));
}

async function loadTransactionMap() {
  transactionMap = {};

  try {
    const response = await apiFetch(buildReceiptsNoCachePath("/api/transactions"));
    if (!response || !response.ok) {
      return;
    }

    const payload = await response.json().catch(() => null);
    const transactions = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.transactions)
      ? payload.transactions
      : Array.isArray(payload?.data)
      ? payload.data
      : [];

    transactionMap = transactions.reduce((accumulator, transaction) => {
      if (transaction?.id) {
        accumulator[transaction.id] = transaction;
      }
      return accumulator;
    }, {});
  } catch (error) {
    console.error("Failed to load transactions for receipts page:", error);
  }
}

async function loadReceipts() {
  setReceiptRefreshBusy(true);
  receiptsLoading = receiptRecords.length === 0;
  receiptsLoadFailed = false;
  if (receiptsLoading) {
    renderReceipts(receiptRecords);
  }
  try {
    const response = await apiFetch(buildReceiptsNoCachePath("/api/receipts"));
    if (!response) {
      receiptRecords = [];
      receiptsLoadFailed = true;
      renderReceipts(receiptRecords);
      return;
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || tx("receipts_error_load"));
    }

    const payload = await response.json().catch(() => null);
    const remoteReceipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];

    receiptRecords = remoteReceipts;
    receiptsLoadFailed = false;
    receiptsLoading = false;
    renderReceipts(receiptRecords);
  } catch (error) {
    console.error("Failed to load receipts:", error);
    receiptRecords = [];
    receiptsLoadFailed = true;
    receiptsLoading = false;
    renderReceipts(receiptRecords);
  } finally {
    receiptsLoading = false;
    setReceiptRefreshBusy(false);
  }
}

function prependUploadedReceipt(uploadedReceipt) {
  if (!uploadedReceipt?.id) {
    return;
  }

  const normalized = {
    id: uploadedReceipt.id,
    filename: uploadedReceipt.filename || tx("receipts_fallback_name"),
    mime_type: uploadedReceipt.mime_type || "",
    transaction_id: uploadedReceipt.transaction_id || null,
    created_at: uploadedReceipt.created_at || new Date().toISOString()
  };

  receiptRecords = [normalized, ...receiptRecords.filter((receipt) => receipt?.id !== normalized.id)];
  receiptsLoadFailed = false;
  receiptsLoading = false;
  renderReceipts(receiptRecords);
  void loadTransactionMap();
}

function setReceiptRefreshBusy(isBusy) {
  const refreshButton = document.getElementById("receiptRefreshButton");
  if (!refreshButton) {
    return;
  }
  refreshButton.disabled = !!isBusy;
  refreshButton.textContent = isBusy ? "Refreshing..." : "Refresh";
}

function renderReceipts(receipts) {
  const tableBody = document.getElementById("receiptsTableBody");
  const emptyState = document.getElementById("receiptsEmptyState");

  if (!tableBody) {
    return;
  }

  if (receiptsLoading) {
    tableBody.innerHTML = "";
    if (emptyState) {
      emptyState.hidden = false;
      updateReceiptsEmptyState(
        emptyState,
        tx("receipts_loading_title"),
        tx("receipts_loading_body")
      );
    }
    return;
  }

  if (receiptsLoadFailed) {
    tableBody.innerHTML = "";
    if (emptyState) {
      emptyState.hidden = false;
      updateReceiptsEmptyState(
        emptyState,
        tx("receipts_load_error_title"),
        tx("receipts_load_error_body")
      );
    }
    return;
  }

  if (!receipts.length) {
    tableBody.innerHTML = "";
    if (emptyState) {
      emptyState.hidden = false;
      updateReceiptsEmptyState(
        emptyState,
        tx("receipts_empty_title"),
        tx("receipts_empty_body")
      );
    }
    return;
  }

  if (emptyState) {
    emptyState.hidden = true;
  }

  tableBody.innerHTML = receipts.map((receipt) => {
    const transactionCell = renderTransactionCell(receipt.transaction_id, receipt.id);
    const canViewReceipt = receipt?.is_viewable !== false;
    return `
      <tr>
        <td data-label="${escapeHtml(tx("receipts_table_filename"))}">
          ${canViewReceipt
            ? `<button type="button" class="receipt-file-button" data-receipt-download="${escapeHtml(receipt.id || "")}">${escapeHtml(receipt.filename || tx("receipts_fallback_name"))}</button>`
            : `<button type="button" class="receipt-file-button receipt-file-button--missing" data-receipt-missing="${escapeHtml(receipt.id || "")}">${escapeHtml(receipt.filename || tx("receipts_fallback_name"))}</button>`}
        </td>
        <td data-label="${escapeHtml(tx("receipts_table_uploaded"))}">${escapeHtml(formatReceiptDate(receipt.created_at))}</td>
        <td data-label="${escapeHtml(tx("receipts_table_attached"))}">${transactionCell}</td>
        <td data-label="${escapeHtml(tx("common_actions"))}">
          <div class="receipt-row-actions">
            <button type="button" class="receipt-link-btn" data-receipt-link="${escapeHtml(receipt.id || "")}">${escapeHtml(tx("receipts_link_action"))}</button>
            ${!receipt.mime_type || receipt.mime_type !== "application/pdf"
              ? `<button type="button" class="receipt-scan-btn" data-receipt-scan="${escapeHtml(receipt.id || "")}" title="Extract data from this receipt">Scan</button>`
              : ""}
            <button type="button" class="receipt-delete-btn" data-receipt-delete="${escapeHtml(receipt.id || "")}">${escapeHtml(tx("common_delete"))}</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  tableBody.querySelectorAll("[data-receipt-download]").forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.getAttribute("data-receipt-download") || "";
      const receipt = receiptRecords.find((record) => record.id === receiptId);
      if (!receipt) {
        return;
      }

      try {
        await openReceiptPreview(receipt.id, receipt.filename || "receipt");
      } catch (error) {
        console.error("Receipt preview failed:", error);
        showReceiptsToast(error.message || tx("receipts_error_preview"));
      }
    });
  });

  tableBody.querySelectorAll("[data-receipt-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.getAttribute("data-receipt-view") || "";
      const receipt = receiptRecords.find((record) => record.id === receiptId);
      if (!receipt) return;
      try {
        await openReceiptPreview(receipt.id, receipt.filename || "receipt");
      } catch (error) {
        showReceiptsToast(error.message || tx("receipts_error_preview"));
      }
    });
  });

  tableBody.querySelectorAll("[data-receipt-missing]").forEach((button) => {
    button.addEventListener("click", () => {
      showReceiptsToast(missingReceiptMessage());
    });
  });

  tableBody.querySelectorAll("[data-receipt-link]").forEach((button) => {
    button.addEventListener("click", () => {
      const receiptId = button.getAttribute("data-receipt-link") || "";
      openReceiptLinkModal(receiptId);
    });
  });

  tableBody.querySelectorAll("[data-receipt-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.getAttribute("data-receipt-delete") || "";
      await deleteReceiptRecord(receiptId);
    });
  });

  tableBody.querySelectorAll("[data-receipt-scan]").forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.getAttribute("data-receipt-scan") || "";
      await openOcrPanel(receiptId);
    });
  });
}

function updateReceiptsEmptyState(node, title, body) {
  const titleNode = node.querySelector("h3");
  const bodyNode = node.querySelector("p");
  if (titleNode) {
    titleNode.textContent = title;
  }
  if (bodyNode) {
    bodyNode.textContent = body;
  }
}

function renderTransactionCell(transactionId, receiptId) {
  if (!transactionId) {
    return "&mdash;";
  }

  const transaction = transactionMap[transactionId];
  const label = transaction?.description || transactionId;
  const receipt = receiptRecords.find((record) => record.id === receiptId);
  if (receipt?.is_viewable === false) {
    return `<button type="button" class="receipt-transaction-link receipt-transaction-link--missing" data-receipt-missing="${escapeHtml(receiptId || "")}">${escapeHtml(label)}</button>`;
  }
  return `<button type="button" class="receipt-transaction-link" data-receipt-view="${escapeHtml(receiptId || "")}">${escapeHtml(label)}</button>`;
}

function wireReceiptLinkModal() {
  const cancelButton = document.getElementById("receiptLinkCancel");
  const saveButton = document.getElementById("receiptLinkSave");

  cancelButton?.addEventListener("click", closeReceiptLinkModal);
  saveButton?.addEventListener("click", async () => {
    const select = document.getElementById("receiptLinkSelect");
    await saveReceiptLink(activeReceiptLinkId, select?.value || "");
  });
}

function openReceiptLinkModal(receiptId) {
  const modal = document.getElementById("receiptLinkModal");
  const select = document.getElementById("receiptLinkSelect");
  const receipt = receiptRecords.find((record) => record.id === receiptId);
  if (!modal || !select || !receipt) {
    return;
  }

  activeReceiptLinkId = receiptId;
  const transactions = Object.values(transactionMap)
    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  select.innerHTML = `<option value="">${escapeHtml(tx("receipts_not_attached"))}</option>`;
  transactions.forEach((transaction) => {
    if (!transaction?.id) {
      return;
    }
    const option = document.createElement("option");
    option.value = transaction.id;
    option.textContent = `${transaction.date || ""} - ${transaction.description || transaction.id}`;
    select.appendChild(option);
  });
  select.value = receipt.transaction_id || "";
  modal.classList.remove("hidden");
}

function closeReceiptLinkModal() {
  const modal = document.getElementById("receiptLinkModal");
  if (modal) {
    modal.classList.add("hidden");
  }
  activeReceiptLinkId = null;
}

async function saveReceiptLink(receiptId, transactionId) {
  if (!receiptId) {
    return;
  }

  const receipt = receiptRecords.find((record) => record.id === receiptId);
  if (!receipt) {
    return;
  }

  const response = await apiFetch(`/api/receipts/${receiptId}/attach`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transaction_id: transactionId || null
    })
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    showReceiptsToast(errorPayload?.error || tx("receipts_error_link"));
    return;
  }

  closeReceiptLinkModal();
  await loadTransactionMap();
  await loadReceipts();
  showReceiptsToast(transactionId ? tx("receipts_linked") : tx("receipts_unlinked"));
}

async function deleteReceiptRecord(receiptId) {
  if (!receiptId) {
    return;
  }

  const receipt = receiptRecords.find((record) => record.id === receiptId);
  if (!receipt) {
    return;
  }

  const receiptName = receipt.filename || tx("receipts_this_receipt");
  if (!window.confirm(`${tx("receipts_confirm_delete_prefix")} "${receiptName}"? ${tx("receipts_confirm_delete_suffix")}`)) {
    return;
  }

  const response = await apiFetch(`/api/receipts/${receiptId}`, {
    method: "DELETE"
  });

  if (!response || !response.ok) {
    const errorPayload = response ? await response.json().catch(() => null) : null;
    showReceiptsToast(errorPayload?.error || tx("receipts_error_delete"));
    return;
  }

  await loadTransactionMap();
  await loadReceipts();
  showReceiptsToast(tx("receipts_deleted"));
}

async function openReceiptPreview(receiptId, filename) {
  const response = await fetch(buildApiUrl(`/api/receipts/${receiptId}`), {
    method: "GET",
    credentials: "include",
    headers: {
      ...authHeader()
    }
  });

  if (response.status === 404) {
    receiptRecords = receiptRecords.filter((record) => record?.id !== receiptId);
    renderReceipts(receiptRecords);
    void loadReceipts();
    throw new Error(tx("receipts_error_open"));
  }

  if (!response.ok) {
    throw new Error(tx("receipts_error_open"));
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const previewWindow = window.open(url, "_blank", "noopener,noreferrer");

  if (!previewWindow) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function ensureV1Tier() {
  if (effectiveTier() === "v1") {
    return true;
  }
  showReceiptsToast(tx("receipts_error_v1_required"));
  return false;
}

function updateReceiptsDot() {
  const dot = document.getElementById("receiptsDot");
  if (!dot) {
    return;
  }
  dot.hidden = !receiptRecords.some((receipt) => !receipt.transaction_id);
}

function formatReceiptDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function showReceiptsToast(message) {
  const toast = document.getElementById("receiptsToast");
  const messageNode = document.getElementById("receiptsToastMessage");
  if (!toast || !messageNode) {
    return;
  }

  messageNode.textContent = message;
  toast.classList.remove("hidden");
  if (receiptsToastTimer) {
    clearTimeout(receiptsToastTimer);
  }
  receiptsToastTimer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, RECEIPTS_TOAST_MS);
}

/* =========================================================
   Receipt OCR — "Scan" button
   ========================================================= */

let ocrModal = null;

function getOrCreateOcrModal() {
  if (ocrModal) return ocrModal;

  const el = document.createElement("div");
  el.id = "receiptOcrModal";
  el.className = "transaction-modal hidden";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "ocrModalTitle");
  el.innerHTML = `
    <div class="transaction-modal-content ocr-modal-content">
      <h3 id="ocrModalTitle" class="ocr-modal-title">Receipt Scan</h3>
      <div id="ocrModalBody" class="ocr-modal-body">
        <div class="analytics-loading">Scanning receipt…</div>
      </div>
      <div class="modal-actions" id="ocrModalActions" hidden>
        <button type="button" id="ocrCreateTxBtn" class="drawer-submit">Create transaction</button>
        <button type="button" id="ocrCloseBtn" class="modal-cancel">Close</button>
      </div>
      <div class="modal-actions" id="ocrCloseOnly">
        <button type="button" id="ocrCloseBtnOnly" class="modal-cancel">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    if (e.target === el) el.classList.add("hidden");
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") el.classList.add("hidden");
  });
  el.querySelector("#ocrCloseBtn")?.addEventListener("click", () => el.classList.add("hidden"));
  el.querySelector("#ocrCloseBtnOnly")?.addEventListener("click", () => el.classList.add("hidden"));

  ocrModal = el;
  return el;
}

async function openOcrPanel(receiptId) {
  const modal = getOrCreateOcrModal();
  const body = modal.querySelector("#ocrModalBody");
  const actions = modal.querySelector("#ocrModalActions");
  const closeOnly = modal.querySelector("#ocrCloseOnly");
  const createBtn = modal.querySelector("#ocrCreateTxBtn");

  body.innerHTML = '<div class="analytics-loading">Scanning receipt…</div>';
  actions.hidden = true;
  closeOnly.hidden = false;
  modal.classList.remove("hidden");

  try {
    const res = await apiFetch(`/api/receipts/${receiptId}/extract`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      body.innerHTML = `<p class="error-text">${escapeHtml(data.error || "Scan failed.")}</p>`;
      return;
    }

    if (!data.available) {
      body.innerHTML = `<p class="ocr-unavailable">${escapeHtml(data.reason || "OCR is not available.")}</p>`;
      return;
    }

    const ext = data.extracted;
    if (!ext) {
      body.innerHTML = `<p class="ocr-unavailable">Could not extract readable data from this receipt.</p>`;
      return;
    }

    const rows = [
      ext.merchant ? `<div class="ocr-field"><span class="ocr-label">Merchant</span><span class="ocr-val">${escapeHtml(ext.merchant)}</span></div>` : "",
      ext.date ? `<div class="ocr-field"><span class="ocr-label">Date</span><span class="ocr-val">${escapeHtml(ext.date)}</span></div>` : "",
      ext.total !== null && ext.total !== undefined ? `<div class="ocr-field"><span class="ocr-label">Total</span><span class="ocr-val">${escapeHtml(String(ext.total))} ${escapeHtml(ext.currency || "")}</span></div>` : "",
      ext.tax !== null && ext.tax !== undefined ? `<div class="ocr-field"><span class="ocr-label">Tax</span><span class="ocr-val">${escapeHtml(String(ext.tax))}</span></div>` : "",
      ext.description ? `<div class="ocr-field"><span class="ocr-label">Description</span><span class="ocr-val">${escapeHtml(ext.description)}</span></div>` : ""
    ].filter(Boolean).join("");

    body.innerHTML = rows || "<p>No data extracted.</p>";
    actions.hidden = false;
    closeOnly.hidden = true;

    // Remove previous listener to avoid stacking
    const newBtn = createBtn.cloneNode(true);
    createBtn.parentNode.replaceChild(newBtn, createBtn);
    newBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      prefillTransactionFromOcr(ext);
    });
  } catch (err) {
    body.innerHTML = `<p class="error-text">An error occurred while scanning. Please try again.</p>`;
  }
}

function prefillTransactionFromOcr(extracted) {
  // Navigate to transactions and fire a custom event so transactions.js can pick it up
  const params = new URLSearchParams();
  if (extracted.description) params.set("ocr_desc", extracted.description);
  if (extracted.merchant) params.set("ocr_merchant", extracted.merchant);
  if (extracted.total !== null && extracted.total !== undefined) params.set("ocr_amount", String(extracted.total));
  if (extracted.date) params.set("ocr_date", extracted.date);
  if (extracted.currency) params.set("ocr_currency", extracted.currency);
  window.location.href = `transactions?${params.toString()}`;
}
