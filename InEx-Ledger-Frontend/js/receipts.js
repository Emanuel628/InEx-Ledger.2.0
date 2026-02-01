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

  // Pending future logic
  // loadReceipts();
}

/* -------------------------
   Future hooks (preliminary)
   ------------------------- */

async function loadReceipts() {
  try {
    const data = await apiFetch("/receipts");
    console.log("Receipts loaded:", data);
    // renderReceipts(data);
  } catch (err) {
    console.error("Failed to load receipts:", err);
  }
}

function renderReceipts(receipts) {
  // Will render receipt rows/cards in a future release
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
