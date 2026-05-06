/**
 * escape-html.js
 *
 * Shared HTML-escaping utility. Loaded as the first script on every page so
 * auth.js, transactions.js, and all other page scripts can call escapeHtml()
 * without owning or duplicating the implementation.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
