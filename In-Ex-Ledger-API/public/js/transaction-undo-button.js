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
      .transactions-table thead th.col-select {
        text-align: center;
        vertical-align: middle;
      }
      .tx-undo-delete-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        min-width: 72px;
        height: 30px;
        padding: 0 10px;
        border: 1px solid rgba(148, 163, 184, 0.36);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.72);
        color: #475569;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        white-space: nowrap;
      }
      .tx-undo-delete-button:hover {
        background: #ffffff;
        border-color: rgba(100, 116, 139, 0.48);
        color: #0f172a;
      }
      .tx-undo-delete-button:focus-visible {
        outline: 3px solid rgba(59, 130, 246, 0.22);
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
