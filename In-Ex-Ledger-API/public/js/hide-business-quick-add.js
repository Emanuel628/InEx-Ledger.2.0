/* Business Quick Add items are not production-ready yet.
   Remove them from the dynamic sidebar UI for all plans until the feature set is ready. */
(function () {
  const BUSINESS_IDS = new Set([
    'customers',
    'invoices',
    'bills',
    'vendors',
    'projects',
    'billable-expenses',
    'billable_expenses'
  ]);

  const BUSINESS_LABELS = new Set([
    'business',
    'customers',
    'invoices',
    'bills',
    'vendors',
    'projects',
    'billable expenses'
  ]);

  function text(node) {
    return String(node?.textContent || '').trim().toLowerCase();
  }

  function hide(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('data-business-quick-add-hidden', 'true');
    node.style.display = 'none';
  }

  function isBusinessFeatureNode(node) {
    if (!node) return false;
    const featureId = String(
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

    if (BUSINESS_IDS.has(featureId)) return true;

    const href = String(node.getAttribute?.('href') || '').toLowerCase();
    if (/\/(customers|invoices|bills|vendors|projects|billable-expenses)(?:$|[/?#])/.test(href)) {
      return true;
    }

    const label = text(node).replace(/\s+/g, ' ');
    return BUSINESS_LABELS.has(label);
  }

  function removeBusinessQuickAddItems() {
    document.querySelectorAll('.app-sidebar--dynamic, .app-sidebar').forEach((sidebar) => {
      // Remove entire Business section in the library.
      sidebar.querySelectorAll('.dynamic-sidebar-library-group').forEach((group) => {
        const groupLabel = text(group.querySelector('.sidebar-section-label'));
        if (groupLabel === 'business') {
          hide(group);
        }
      });

      // Remove any Business items that appear as favorites or standalone rows.
      sidebar.querySelectorAll('[data-feature-id], [data-sidebar-add], [data-sidebar-remove], [data-favorite-id], a[href], button').forEach((node) => {
        if (!isBusinessFeatureNode(node)) return;
        hide(
          node.closest('.dynamic-sidebar-library-item, .dynamic-sidebar-favorite, .sidebar-link, .nav-item, li, a, button') || node
        );
      });
    });
  }

  function start() {
    removeBusinessQuickAddItems();
    const observer = new MutationObserver(removeBusinessQuickAddItems);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
