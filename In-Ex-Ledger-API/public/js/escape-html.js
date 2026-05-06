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

(function wireTransactionCheckboxActions() {
  if (!/\/transactions(?:$|[?#/])?/i.test(window.location.pathname)) return;
  if (document.getElementById("transaction-checkbox-actions-js")) return;

  const script = document.createElement("script");
  script.id = "transaction-checkbox-actions-js";
  script.src = "/js/transaction-checkbox-actions.js?v=20260505b";
  script.defer = true;
  document.head.appendChild(script);
})();
