/* Transactions row actions belong to the left checkbox, not a visible Actions column. */
(function () {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;

  let selectedId = null;

  function getTable() {
    return document.querySelector(".transactions-table");
  }

  function getPopup() {
    let popup = document.getElementById("txRowPopup");
    if (popup) return popup;

    popup = document.createElement("div");
    popup.id = "txRowPopup";
    popup.className = "tx-row-popup";
    popup.hidden = true;
    popup.innerHTML = `
      <button type="button" id="txPopupEdit" class="tx-popup-action">Edit</button>
      <button type="button" id="txPopupDelete" class="tx-popup-action tx-popup-action-danger">Delete</button>
    `;
    document.body.appendChild(popup);
    wirePopupButtons(popup);
    return popup;
  }

  function wirePopupButtons(popup) {
    const editButton = popup.querySelector("#txPopupEdit");
    const deleteButton = popup.querySelector("#txPopupDelete");

    editButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (selectedId && typeof window.handleEditEntry === "function") {
        window.handleEditEntry(selectedId);
      }
      clearSelection();
    });

    deleteButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (selectedId && typeof window.openTransactionModal === "function") {
        window.openTransactionModal(selectedId);
      }
      clearSelection(false);
    });
  }

  function injectStyles() {
    if (document.getElementById("transaction-checkbox-actions-style")) return;
    const style = document.createElement("style");
    style.id = "transaction-checkbox-actions-style";
    style.textContent = `
      .transactions-table th.col-actions,
      .transactions-table td.table-actions-cell,
      .transactions-table .row-action-button {
        display: none !important;
      }

      .tx-row-popup {
        position: fixed;
        z-index: 1000;
        min-width: 142px;
        padding: 8px;
        border-radius: 14px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: #ffffff;
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
        display: grid;
        gap: 6px;
      }

      .tx-row-popup[hidden] {
        display: none !important;
      }

      .tx-popup-action {
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 10px 12px;
        background: #f8fafc;
        color: #0f172a;
        font: inherit;
        font-weight: 700;
        text-align: left;
        cursor: pointer;
      }

      .tx-popup-action:hover {
        background: #eef2ff;
      }

      .tx-popup-action-danger {
        color: #b91c1c;
      }

      .transactions-table tr.is-selected {
        background: rgba(79, 70, 229, 0.06);
      }
    `;
    document.head.appendChild(style);
  }

  function removeActionsHeaderAndCells() {
    const table = getTable();
    if (!table) return;
    table.querySelectorAll("th.col-actions, td.table-actions-cell").forEach((node) => node.remove());
  }

  function positionPopupNearCheckbox(checkbox) {
    const popup = getPopup();
    const rect = checkbox.getBoundingClientRect();
    const popupWidth = 142;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - popupWidth - 8));
    const below = rect.bottom + 8;
    const top = below + 96 > window.innerHeight ? Math.max(8, rect.top - 96) : below;

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.hidden = false;
  }

  function clearSelection(hidePopup = true) {
    selectedId = null;
    document.querySelectorAll(".transactions-table .tx-row-select").forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.closest("tr")?.classList.remove("is-selected");
    });
    if (hidePopup) {
      const popup = document.getElementById("txRowPopup");
      if (popup) popup.hidden = true;
    }
  }

  function handleCheckboxChange(checkbox) {
    const row = checkbox.closest("tr");
    const id = checkbox.dataset.id || row?.id?.replace(/^txn-/, "") || "";

    document.querySelectorAll(".transactions-table .tx-row-select").forEach((other) => {
      if (other !== checkbox) {
        other.checked = false;
        other.closest("tr")?.classList.remove("is-selected");
      }
    });

    if (!checkbox.checked || !id) {
      clearSelection();
      return;
    }

    selectedId = id;
    row?.classList.add("is-selected");
    positionPopupNearCheckbox(checkbox);
  }

  function wireCheckboxes() {
    const table = getTable();
    if (!table || table.dataset.checkboxActionsWired === "true") return;
    table.dataset.checkboxActionsWired = "true";

    table.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest?.(".tx-row-select")) return;
      if (target?.closest?.("button, a, input, select, textarea, label")) return;
      event.stopImmediatePropagation();
    }, true);

    table.addEventListener("change", (event) => {
      const checkbox = event.target?.closest?.(".tx-row-select");
      if (!checkbox) return;
      event.stopImmediatePropagation();
      handleCheckboxChange(checkbox);
    }, true);
  }

  function sync() {
    injectStyles();
    removeActionsHeaderAndCells();
    wireCheckboxes();
  }

  document.addEventListener("DOMContentLoaded", () => {
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      const popup = document.getElementById("txRowPopup");
      if (!popup || popup.hidden) return;
      if (popup.contains(event.target)) return;
      if (event.target?.closest?.(".tx-row-select")) return;
      clearSelection();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") clearSelection();
    });
  });
})();
