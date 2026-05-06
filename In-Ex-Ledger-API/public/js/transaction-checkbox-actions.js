/* Transactions row actions belong to the left checkbox, not a visible Actions column. */
(function () {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;

  let selectedId = null;
  let selectedCheckbox = null;

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
        width: max-content;
        min-width: 142px;
        max-width: min(220px, calc(100vw - 16px));
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

      .tx-row-popup::before {
        content: "";
        position: absolute;
        top: -6px;
        left: 14px;
        width: 10px;
        height: 10px;
        background: #ffffff;
        border-left: 1px solid rgba(148, 163, 184, 0.28);
        border-top: 1px solid rgba(148, 163, 184, 0.28);
        transform: rotate(45deg);
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

  function getAnchorRect(checkbox) {
    const input = checkbox instanceof HTMLElement ? checkbox : null;
    if (!input || !input.isConnected) return null;

    const rect = input.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return rect;

    const cell = input.closest("td, th, label") || input;
    return cell.getBoundingClientRect();
  }

  function positionPopupNearCheckbox(checkbox) {
    selectedCheckbox = checkbox || selectedCheckbox;
    const anchor = selectedCheckbox;
    const rect = getAnchorRect(anchor);
    const popup = getPopup();

    if (!rect) {
      popup.hidden = true;
      return;
    }

    popup.hidden = false;

    // Measure after showing so the browser can calculate the real popup size.
    const popupRect = popup.getBoundingClientRect();
    const gap = 10;
    const viewportPadding = 8;
    const preferredLeft = rect.left + Math.max(0, (rect.width - 16) / 2);
    const maxLeft = window.innerWidth - popupRect.width - viewportPadding;
    const left = Math.max(viewportPadding, Math.min(preferredLeft, maxLeft));

    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - popupRect.height - gap;
    const top = belowTop + popupRect.height <= window.innerHeight - viewportPadding
      ? belowTop
      : Math.max(viewportPadding, aboveTop);

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  }

  function clearSelection(hidePopup = true) {
    selectedId = null;
    selectedCheckbox = null;
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
    selectedCheckbox = checkbox;
    row?.classList.add("is-selected");
    window.requestAnimationFrame(() => positionPopupNearCheckbox(checkbox));
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

  function repositionOpenPopup() {
    const popup = document.getElementById("txRowPopup");
    if (!popup || popup.hidden || !selectedCheckbox) return;
    positionPopupNearCheckbox(selectedCheckbox);
  }

  function sync() {
    injectStyles();
    removeActionsHeaderAndCells();
    wireCheckboxes();
    repositionOpenPopup();
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
    window.addEventListener("scroll", repositionOpenPopup, true);
    window.addEventListener("resize", repositionOpenPopup);
  });
})();
