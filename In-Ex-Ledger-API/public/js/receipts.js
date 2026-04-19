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

document.addEventListener("DOMContentLoaded", async () => {
  await requireValidSessionOrRedirect();
  if (typeof enforceTrial === "function") enforceTrial();

  wireReceiptUpload();
  wireReceiptLinkModal();
  await loadTransactionMap();
  await loadReceipts();
  updateReceiptsDot();
});

function wireReceiptUpload() {
  const uploadButton = document.getElementById("receiptUploadButton");
  const uploadInput = document.getElementById("receiptUploadInput");

  uploadButton?.addEventListener("click", () => {
    if (!ensureV1Tier()) {
      return;
    }
    uploadInput?.click();
  });

  uploadInput?.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) {
      return;
    }

    try {
      await uploadReceipt(file);
      showReceiptsToast(tx("receipts_uploaded_success"));
      uploadInput.value = "";
      await loadReceipts();
    } catch (error) {
      console.error("Receipt upload failed:", error);
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
    const response = await apiFetch("/api/transactions");
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
  receiptsLoading = receiptRecords.length === 0;
  receiptsLoadFailed = false;
  if (receiptsLoading) {
    renderReceipts(receiptRecords);
  }
  try {
    const response = await apiFetch("/api/receipts");
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
    renderReceipts(receiptRecords);
  } catch (error) {
    console.error("Failed to load receipts:", error);
    receiptRecords = [];
    receiptsLoadFailed = true;
    renderReceipts(receiptRecords);
  } finally {
    receiptsLoading = false;
  }
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
    const transactionCell = renderTransactionCell(receipt.transaction_id);
    return `
      <tr>
        <td data-label="${escapeHtml(tx("receipts_table_filename"))}">
          <button type="button" class="receipt-file-button" data-receipt-download="${escapeHtml(receipt.id || "")}">${escapeHtml(receipt.filename || tx("receipts_fallback_name"))}</button>
        </td>
        <td data-label="${escapeHtml(tx("receipts_table_uploaded"))}">${escapeHtml(formatReceiptDate(receipt.created_at))}</td>
        <td data-label="${escapeHtml(tx("receipts_table_attached"))}">${transactionCell}</td>
        <td data-label="${escapeHtml(tx("common_actions"))}">
          <div class="receipt-row-actions">
            <button type="button" class="receipt-link-btn" data-receipt-link="${escapeHtml(receipt.id || "")}">${escapeHtml(tx("receipts_link_action"))}</button>
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

function renderTransactionCell(transactionId) {
  if (!transactionId) {
    return "&mdash;";
  }

  const transaction = transactionMap[transactionId];
  const label = transaction?.description || transactionId;
  return `<a class="receipt-transaction-link" href="transactions">${escapeHtml(label)}</a>`;
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
