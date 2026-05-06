/* Replace the old Select All checkbox slot with a neutral Undo control. */
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
    let style = document.getElementById('txUndoButtonStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'txUndoButtonStyle';
      document.head.appendChild(style);
    }

    // Always replace the style content. Older cached scripts injected the blue CTA style.
    style.textContent = `
      .transactions-table thead #txSelectAll { display: none !important; }
      .transactions-table thead th.col-select,
      .transactions-table tbody td:first-child {
        width: 128px !important;
        min-width: 128px !important;
        max-width: 128px !important;
        text-align: center !important;
        vertical-align: middle !important;
        padding-left: 16px !important;
        padding-right: 16px !important;
        overflow: visible !important;
      }
      .transactions-table thead th.col-date,
      .transactions-table tbody td:nth-child(2) {
        padding-left: 28px !important;
      }
      .transactions-table thead th.col-select .tx-undo-delete-button,
      #txUndoDeleteButton.tx-undo-delete-button {
        appearance: none !important;
        -webkit-appearance: none !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        width: auto !important;
        min-width: 82px !important;
        max-width: 96px !important;
        height: 28px !important;
        padding: 0 12px !important;
        border: 1px solid rgba(148, 163, 184, 0.45) !important;
        border-radius: 999px !important;
        background: #ffffff !important;
        background-image: none !important;
        color: #475569 !important;
        font-family: inherit !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        line-height: 1 !important;
        letter-spacing: 0.04em !important;
        text-transform: uppercase !important;
        cursor: pointer !important;
        box-shadow: none !important;
        filter: none !important;
        white-space: nowrap !important;
      }
      .transactions-table thead th.col-select .tx-undo-delete-button:hover,
      #txUndoDeleteButton.tx-undo-delete-button:hover {
        background: #f8fafc !important;
        background-image: none !important;
        border-color: rgba(100, 116, 139, 0.6) !important;
        color: #0f172a !important;
        box-shadow: none !important;
        filter: none !important;
      }
      #txUndoDeleteButton.tx-undo-delete-button:focus-visible {
        outline: 3px solid rgba(100, 116, 139, 0.18) !important;
        outline-offset: 2px !important;
      }
      #txUndoDeleteButton.tx-undo-delete-button:disabled {
        opacity: 0.5 !important;
        cursor: wait !important;
      }
      .tx-undo-delete-icon {
        font-size: 14px !important;
        line-height: 1 !important;
        transform: translateY(-0.5px) !important;
      }
    `;
  }

  function ensureUndoButton() {
    installStyle();
    const headerCell = document.querySelector('.transactions-table thead th.col-select');
    if (!headerCell) return;

    const selectAll = headerCell.querySelector('#txSelectAll');
    if (selectAll) selectAll.remove();

    let button = headerCell.querySelector('#txUndoDeleteButton');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'txUndoDeleteButton';
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

    button.className = 'tx-undo-delete-button';
    button.title = 'Undo last deleted transaction';
    button.setAttribute('aria-label', 'Undo last deleted transaction');
    button.innerHTML = '<span>Undo</span><span class="tx-undo-delete-icon" aria-hidden="true">↶</span>';
  }

  function start() {
    ensureUndoButton();
    new MutationObserver(ensureUndoButton).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
