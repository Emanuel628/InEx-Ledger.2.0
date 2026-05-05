/* Hide Business-tier Quick Add options for non-Business plans.
   Server-side route gates remain the source of truth; this keeps the UI honest. */
(function () {
  const BUSINESS_ROUTE_PATTERNS = [
    /\/vendors(?:$|[/?#])/i,
    /\/customers(?:$|[/?#])/i,
    /\/invoices(?:$|[/?#])/i,
    /\/bills(?:$|[/?#])/i,
    /\/projects(?:$|[/?#])/i,
    /\/billable-expenses(?:$|[/?#])/i
  ];

  const BUSINESS_LABEL_PATTERNS = [
    /\bvendor\b/i,
    /\bcustomer\b/i,
    /\binvoice\b/i,
    /\bbill\b/i,
    /\bproject\b/i,
    /\bbillable\b/i
  ];

  function apiFetchSafe(url) {
    if (typeof window.apiFetch === "function") {
      return window.apiFetch(url);
    }
    return fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
  }

  function isBusinessQuickAddCandidate(node) {
    const href = String(node.getAttribute?.("href") || node.dataset?.href || node.dataset?.route || "");
    const text = String(node.textContent || "");
    return BUSINESS_ROUTE_PATTERNS.some((pattern) => pattern.test(href))
      || BUSINESS_LABEL_PATTERNS.some((pattern) => pattern.test(text));
  }

  function findQuickAddScope() {
    const all = Array.from(document.querySelectorAll("aside, nav, section, div"));
    return all.find((node) => /quick\s*add/i.test(node.textContent || "")) || document;
  }

  function hideBusinessQuickAddItems() {
    const scope = findQuickAddScope();
    const candidates = scope.querySelectorAll("a, button, [role='button'], [data-action], [data-route], [data-href]");

    candidates.forEach((node) => {
      if (!isBusinessQuickAddCandidate(node)) return;
      const item = node.closest("li, .quick-add-item, .quick-add-card, .sidebar-link, .action-card, .menu-item, .nav-item, button, a") || node;
      item.hidden = true;
      item.setAttribute("aria-hidden", "true");
      item.setAttribute("data-business-quick-add-hidden", "true");
    });
  }

  async function applyQuickAddEntitlements() {
    try {
      const res = await apiFetchSafe("/api/entitlements/quick-add");
      if (!res || !res.ok) return;
      const data = await res.json();
      if (data?.business_quick_add_enabled !== true) {
        hideBusinessQuickAddItems();
      }
    } catch (_) {
      hideBusinessQuickAddItems();
    }
  }

  function watchForQuickAddChanges() {
    const observer = new MutationObserver(() => applyQuickAddEntitlements());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyQuickAddEntitlements();
    watchForQuickAddChanges();
  });
})();
