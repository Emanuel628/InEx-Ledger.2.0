/* =========================================================
   Receipts Page JS
   ========================================================= */

requireAuth();

/* -------------------------
   Page boot
   ------------------------- */

init();

function init() {
  console.log("Receipts page loaded.");

  handleTierNotice();

  loadReceipts();
}

/* -------------------------
   Future hooks (preliminary)
   ------------------------- */

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
    const receipts = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.receipts)
      ? payload.receipts
      : [];
    renderReceipts(receipts);
  } catch (err) {
    console.error("Failed to load receipts:", err);
  }
}

function renderReceipts(receipts) {
  const tbody = document.querySelector(".receipts-history-card tbody");
  const emptyState = document.querySelector(".empty-receipts-state");

  if (!tbody) return;

  tbody.innerHTML = "";

  if (!receipts || receipts.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  receipts.forEach((r) => {
    const tr = document.createElement("tr");
    const name = r.filename || "Download receipt";
    tr.innerHTML = `
      <td>
        <button
          type="button"
          class="receipt-download"
          data-id="${r.id}"
          data-name="${name}"
          data-mime="${r.mime_type || "application/octet-stream"}"
        >
          ${name}
        </button>
      </td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}</td>
      <td>${r.transaction_id || "-"}</td>
    `;
    tbody.appendChild(tr);
  });

  wireReceiptDownloadButtons();
}

function wireReceiptDownloadButtons() {
  const buttons = document.querySelectorAll(".receipt-download");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.dataset.id;
      const filename = button.dataset.name || "receipt";
      const mimeType = button.dataset.mime || "application/octet-stream";

      try {
        await downloadReceipt(receiptId, filename, mimeType);
      } catch (err) {
        console.error("Receipt download failed:", err);
      }
    });
  });
}

async function downloadReceipt(receiptId, filename, mimeType) {
  if (!receiptId) {
    throw new Error("Missing receipt id");
  }

  const response = await fetch(buildApiUrl(`/api/receipts/${receiptId}`), {
    method: "GET",
    credentials: "include",
    headers: {
      ...authHeader()
    }
  });

  if (!response.ok) {
    throw new Error("Failed to download receipt.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ensureV1Tier() {
  if (effectiveTier() !== "v1") {
    showTierNotice();
    return false;
  }

  return true;
}

function handleTierNotice() {
  const tier = effectiveTier();
  const notice = document.getElementById("receiptTierNotice");
  const form = document.querySelector("form");

  if (tier === "v1") {
    if (notice) notice.style.display = "none";
    return;
  }

  if (notice) {
    notice.style.display = "block";
  }
  if (form) {
    form.classList.add("tier-locked");
  }
}

function showTierNotice() {
  const notice = document.getElementById("receiptTierNotice");
  if (notice) {
    notice.style.display = "block";
  }
}

function wireReceiptActions() {
  const uploadButton = document.querySelector("[data-receipt-upload]");
  const deleteButtons = document.querySelectorAll("[data-receipt-delete]");
  const attachButtons = document.querySelectorAll("[data-receipt-attach]");

  if (uploadButton) {
    uploadButton.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Tier()) return;
      console.log("Uploading receipt...");
    });
  }

  deleteButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Tier()) return;
      console.log("Deleting receipt...");
    });
  });

  attachButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!ensureV1Tier()) return;
      console.log("Attaching receipt...");
    });
  });
}

wireReceiptActions();

function wireReceiptModal() {
  const modal = document.getElementById("uploadReceiptModal");
  const openButton = document.getElementById("openUploadReceiptModal");
  const closeTriggers = modal?.querySelectorAll("[data-modal-close]");

  const openModal = () => {
    modal?.classList.remove("hidden");
  };

  const closeModal = () => {
    modal?.classList.add("hidden");
  };

  if (openButton) {
    openButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!ensureV1Tier()) return;
      openModal();
    });
  }

  closeTriggers?.forEach((trigger) =>
    trigger.addEventListener("click", closeModal)
  );

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

wireReceiptModal();
