/**
 * escape-html.js
 *
 * Shared HTML-escaping utility.  Loaded as the first script on every page so
 * that auth.js, transactions.js, and all other page scripts can call
 * escapeHtml() without owning or duplicating the implementation.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

(function wireBusinessQuickAddHardening() {
  if (document.getElementById("hide-business-quick-add-js")) return;

  const script = document.createElement("script");
  script.id = "hide-business-quick-add-js";
  script.src = "/js/hide-business-quick-add.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireAnalyticsQuickAddHardening() {
  if (document.getElementById("hide-analytics-quick-add-js")) return;

  const script = document.createElement("script");
  script.id = "hide-analytics-quick-add-js";
  script.src = "/js/hide-analytics-quick-add.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireTransactionUndoButton() {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;
  if (document.getElementById("transaction-undo-button-js")) return;

  const script = document.createElement("script");
  script.id = "transaction-undo-button-js";
  script.src = "/js/transaction-undo-button.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();

(function wireTransactionCheckboxActions() {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;
  if (document.getElementById("transaction-checkbox-actions-js")) return;

  const script = document.createElement("script");
  script.id = "transaction-checkbox-actions-js";
  script.src = "/js/transaction-checkbox-actions-v2.js?v=20260505a";
  script.defer = true;
  document.head.appendChild(script);
})();
