/* Analytics is view-only; it should not appear as a Quick Add option. */
(function () {
  function hide(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('data-analytics-quick-add-hidden', 'true');
    node.style.display = 'none';
  }

  function isAnalyticsNode(node) {
    if (!node) return false;
    const id = String(
      node.getAttribute?.('data-feature-id') ||
      node.getAttribute?.('data-sidebar-add') ||
      node.getAttribute?.('data-sidebar-remove') ||
      node.getAttribute?.('data-favorite-id') ||
      node.dataset?.featureId ||
      node.dataset?.sidebarAdd ||
      node.dataset?.sidebarRemove ||
      node.dataset?.favoriteId ||
      ''
    ).trim().toLowerCase();

    if (id === 'analytics') return true;

    const href = String(node.getAttribute?.('href') || '').toLowerCase();
    if (/\/analytics(?:$|[/?#])/.test(href)) return true;

    return String(node.textContent || '').trim().toLowerCase() === 'analytics';
  }

  function removeAnalyticsQuickAdd() {
    document.querySelectorAll('.app-sidebar--dynamic, .app-sidebar').forEach((sidebar) => {
      sidebar.querySelectorAll('[data-feature-id], [data-sidebar-add], [data-sidebar-remove], [data-favorite-id], a[href], button').forEach((node) => {
        if (!isAnalyticsNode(node)) return;
        hide(node.closest('.dynamic-sidebar-library-item, .dynamic-sidebar-favorite, .sidebar-link, .nav-item, li, a, button') || node);
      });
    });
  }

  function start() {
    removeAnalyticsQuickAdd();
    new MutationObserver(removeAnalyticsQuickAdd).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
