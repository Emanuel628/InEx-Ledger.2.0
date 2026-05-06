/* Replace the old Select All checkbox slot with a quiet Undo control. */
(function () {
  if (!/\/transactions(?:$|[?#/])?/i.test(location.pathname)) return;

  function api(url, options = {}) {
    if (typeof window.apiFetch === 'function') return window.apiFetch(url, options);
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }

  function installStyle() {
    if (document.getElementById('txUndoButtonStyle')) return;
    const style = document.createElement('style');
    style.id = 'txUndoButtonStyle';
    style.textContent = `
      .transactions-table thead #txSelectAll { display: none !important; }
      .transactions-table thead th.col-select,
      .transactions-table tbody td:first-child {
        width: 116px !important;
        min-width: 116px !important;
        max-width: 116px !important;
        text-align: center;
        vertical-align: middle;
        padding-left: 14px !important;
        padding-right: 14px !important;
      }
      .transactions-table thead th.col-date,
      .transactions-table tbody td:nth-child(2) {
        padding-left: 22px !important;
      }
      .tx-undo-delete-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 78px;
        height: 28px;
        padding: 0 11px;
        border: 1px solid rgba(148, 163, 184, 0.42);
        border-radius: 999px;
        background: #ffffff !important;
        color: #475569 !important;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: none;
        white-space: nowrap;
      }
      .tx-undo-delete-button:hover {
        background: #f8fafc !important;
        border-color: rgba(100, 116, 139, 0.55);
        color: #0f172a !important;
      }
      .tx-undo-delete-button:focus-visible {
        outline: 3px solid rgba(100, 116, 139, 0.18);
        outline-offset: 2px;
      }
      .tx-undo-delete-button:disabled {
        opacity: 0.5;
        cursor: wait;
      }
      .tx-undo-delete-icon {
        font-size: 14px;
        line-height: 1;
        transform: translateY(-0.5px);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUndoButton() {
    installStyle();
    const headerCell = document.querySelector('.transactions-table thead th.col-select');
    if (!headerCell) return;
    const selectAll = headerCell.querySelector('#txSelectAll');
    if (selectAll) selectAll.remove();
    if (headerCell.querySelector('#txUndoDeleteButton')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'txUndoDeleteButton';
    button.className = 'tx-undo-delete-button';
    button.title = 'Undo last deleted transaction';
    button.setAttribute('aria-label', 'Undo last deleted transaction');
    button.innerHTML = '<span>Undo</span><span class="tx-undo-delete-icon" aria-hidden="true">↶</span>';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const res = await api('/api/transactions/undo-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        if (!res || !res.ok) {
          const err = res ? await res.json().catch(() => null) : null;
          throw new Error(err?.error || 'No deleted transaction to restore.');
        }
        location.reload();
      } catch (error) {
        alert(error.message || 'Unable to restore transaction.');
      } finally {
        button.disabled = false;
      }
    });
    headerCell.appendChild(button);
  }

  function start() {
    ensureUndoButton();
    new MutationObserver(ensureUndoButton).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
