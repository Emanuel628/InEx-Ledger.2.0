/* Replace the old Select All checkbox slot with an Undo button. */
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
      .tx-undo-delete-button {
        width: 30px;
        height: 30px;
        display: inline-grid;
        place-items: center;
        border: 0;
        border-radius: 999px;
        background: #1f5f8b;
        color: #fff;
        font-size: 17px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(31, 95, 139, 0.22);
      }
      .tx-undo-delete-button:hover { filter: brightness(1.04); }
      .tx-undo-delete-button:disabled { opacity: 0.5; cursor: wait; }
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
    button.textContent = '↶';
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
