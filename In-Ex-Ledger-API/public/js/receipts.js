const RECEIPTS_TOAST_MS = 3000;

let receiptsToastTimer = null;
let receiptRecords = [];
let transactionMap = {};

if (typeof requireAuth === "function") {
  requireAuth();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (typeof enforceTrial === "function") enforceTrial();
  if (typeof renderTrialBanner === "function") renderTrialBanner("trialBanner");

  wireReceiptUpload();
  await loadTransactionMap();
  await loadReceipts();
  syncTierNotice();
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
      showReceiptsToast("Receipt uploaded");
      uploadInput.value = "";
      await loadReceipts();
    } catch (error) {
      console.error("Receipt upload failed:", error);
      showReceiptsToast(error.message || "Receipt upload failed");
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
      ...authHeader()
    },
    body: formData
  });

  if (response.status === 402) {
    syncTierNotice(true);
    throw new Error("Receipt uploads require InEx Ledger V1.");
  }

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(errorPayload?.error || "Failed to upload receipt.");
  }

  return response.json().catch(() => ({}));
}

async function loadTransactionMap() {
  transactionMap = readTransactionMapFromStorage();

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
      : [];

    if (transactions.length) {
      transactionMap = transactions.reduce((accumulator, transaction) => {
        if (transaction?.id) {
          accumulator[transaction.id] = transaction;
        }
        return accumulator;
      }, {});
    }
  } catch (error) {
    console.error("Failed to load transactions for receipts page:", error);
  }
}

function readTransactionMapFromStorage() {
  try {
    const transactions = JSON.parse(localStorage.getItem("lb_transactions") || "[]");
    return transactions.reduce((accumulator, transaction) => {
      if (transaction?.id) {
        accumulator[transaction.id] = transaction;
      }
      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

async function loadReceipts() {
  try {
    const response = await apiFetch("/api/receipts");
    if (!response) {
      return;
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      throw new Error(errorPayload?.error || "Failed to load receipts.");
    }

    const payload = await response.json().catch(() => null);
    receiptRecords = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];

    renderReceipts(receiptRecords);
  } catch (error) {
    console.error("Failed to load receipts:", error);
    receiptRecords = [];
    renderReceipts(receiptRecords);
  }
}

function renderReceipts(receipts) {
  const tableBody = document.getElementById("receiptsTableBody");
  const emptyState = document.getElementById("receiptsEmptyState");

  if (!tableBody) {
    return;
  }

  if (!receipts.length) {
    tableBody.innerHTML = "";
    if (emptyState) {
      emptyState.hidden = false;
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
        <td>
          <button type="button" class="receipt-file-button" data-receipt-download="${escapeHtml(receipt.id || "")}">${escapeHtml(receipt.filename || "Receipt")}</button>
        </td>
        <td>${escapeHtml(formatReceiptDate(receipt.created_at))}</td>
        <td>${transactionCell}</td>
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
        showReceiptsToast(error.message || "Receipt preview failed");
      }
    });
  });
}

function renderTransactionCell(transactionId) {
  if (!transactionId) {
    return "&mdash;";
  }

  const transaction = transactionMap[transactionId];
  const label = transaction?.description || transactionId;
  return `<a class="receipt-transaction-link" href="transactions.html">${escapeHtml(label)}</a>`;
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
    throw new Error("Failed to open receipt.");
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

function syncTierNotice(forceShow = false) {
  const notice = document.getElementById("receiptTierNotice");
  if (!notice) {
    return;
  }
  notice.hidden = !(forceShow || effectiveTier() !== "v1");
}

function ensureV1Tier() {
  if (effectiveTier() === "v1") {
    return true;
  }
  syncTierNotice(true);
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

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
