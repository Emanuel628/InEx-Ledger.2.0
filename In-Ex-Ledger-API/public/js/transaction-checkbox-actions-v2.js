/* Stable checkbox-driven transaction edit/delete popup. */
(function () {
  if (!/\/transactions(?:$|[?#/])?/i.test(location.pathname)) return;
  if (window.__TX_CHECKBOX_ACTIONS_V3__) return;
  window.__TX_CHECKBOX_ACTIONS_V3__ = true;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let selected = { id: '', checkbox: null, row: null };
  let editId = '';
  let submitHooked = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function api(url, options = {}) {
    if (typeof window.apiFetch === 'function') return window.apiFetch(url, options);
    const token = sessionStorage.getItem('token') || localStorage.getItem('token') || '';
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
  }

  function installStyle() {
    if ($('#txCheckboxActionsStyle')) return;
    const style = document.createElement('style');
    style.id = 'txCheckboxActionsStyle';
    style.textContent = `
      .transactions-table th.col-actions,.transactions-table td.table-actions-cell,.transactions-table .row-action-button{display:none!important}
      .transactions-table tr.is-selected{background:rgba(79,70,229,.06)}
      .transactions-table td.tx-checkbox-cell{position:relative!important;overflow:visible!important;z-index:8}
      .tx-row-popup{position:absolute;left:calc(100% + 10px);top:50%;transform:translateY(-50%);z-index:9999;min-width:142px;max-width:220px;padding:8px;border-radius:14px;border:1px solid rgba(148,163,184,.28);background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.18);display:grid;gap:6px}
      .tx-row-popup[hidden]{display:none!important}
      .tx-popup-action{width:100%;border:0;border-radius:10px;padding:10px 12px;background:#f8fafc;color:#0f172a;font:inherit;font-weight:700;text-align:left;cursor:pointer;white-space:nowrap}
      .tx-popup-action:hover{background:#eef2ff}.tx-popup-action:disabled{opacity:.55;cursor:wait}.tx-popup-action-danger{color:#b91c1c}
      @media(max-width:767px){.tx-row-popup{left:34px;top:50%;}}
    `;
    document.head.appendChild(style);
  }

  function getPopup() {
    let popup = $('#txRowPopup');
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'txRowPopup';
    popup.className = 'tx-row-popup';
    popup.hidden = true;
    popup.innerHTML = '<button type="button" id="txPopupEdit" class="tx-popup-action">Edit</button><button type="button" id="txPopupDelete" class="tx-popup-action tx-popup-action-danger">Delete</button>';
    $('#txPopupEdit', popup).addEventListener('click', runEdit);
    $('#txPopupDelete', popup).addEventListener('click', runDelete);
    return popup;
  }

  function rowFor(checkbox) { return checkbox?.closest('tr') || null; }
  function cellFor(checkbox) { return checkbox?.closest('td,th') || null; }

  function checkboxId(checkbox) {
    const row = rowFor(checkbox);
    const values = [
      checkbox?.dataset?.id,
      checkbox?.dataset?.transactionId,
      checkbox?.value,
      row?.dataset?.id,
      row?.dataset?.transactionId,
      row?.id?.replace(/^txn-/, '')
    ].map(v => String(v || '').trim()).filter(Boolean);
    return values.find(v => UUID_RE.test(v)) || '';
  }

  async function loadTransactions() {
    const res = await api('/api/transactions?limit=500');
    if (!res || !res.ok) throw new Error('Unable to load transactions.');
    const body = await res.json().catch(() => null);
    return Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
  }

  async function selectedTransaction() {
    const list = await loadTransactions();
    if (selected.id) {
      const byId = list.find(tx => String(tx.id) === String(selected.id));
      if (byId) return byId;
    }
    const rows = $$('.transactions-table tbody tr');
    const index = rows.indexOf(selected.row);
    return index >= 0 ? list[index] || null : null;
  }

  function attachPopupTo(checkbox) {
    const cell = cellFor(checkbox);
    if (!cell) return;
    cell.classList.add('tx-checkbox-cell');
    const popup = getPopup();
    if (popup.parentElement !== cell) cell.appendChild(popup);
    popup.hidden = false;
  }

  function clearSelection(hide = true) {
    selected = { id: '', checkbox: null, row: null };
    $$('.transactions-table tbody input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      rowFor(cb)?.classList.remove('is-selected');
    });
    if (hide) getPopup().hidden = true;
  }

  function selectCheckbox(checkbox) {
    if (!checkbox) return;
    const row = rowFor(checkbox);
    $$('.transactions-table tbody input[type="checkbox"]').forEach(other => {
      if (other !== checkbox) {
        other.checked = false;
        rowFor(other)?.classList.remove('is-selected');
      }
    });

    if (!checkbox.checked) {
      clearSelection();
      return;
    }

    selected = { id: checkboxId(checkbox), checkbox, row };
    row?.classList.add('is-selected');
    attachPopupTo(checkbox);
  }

  function setField(id, value) {
    const field = document.getElementById(id);
    if (!field) return;
    if (field.type === 'checkbox') field.checked = !!value;
    else field.value = value ?? '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openDrawerForEdit() {
    $('#txDrawer')?.removeAttribute('hidden');
    const pageToggle = $('#addTxTogglePage');
    if (pageToggle) {
      pageToggle.textContent = 'Close';
      pageToggle.setAttribute('aria-expanded', 'true');
    }
    const title = $('#txDrawer .drawer-title');
    if (title) title.textContent = 'Edit transaction';
  }

  function editPayload() {
    const type = $('#txType')?.value === 'income' ? 'income' : 'expense';
    return {
      account_id: $('#account')?.value || '',
      category_id: $('#category')?.value || '',
      amount: parseFloat($('#amount')?.value || ''),
      type,
      description: $('#description')?.value?.trim() || '',
      date: $('#date')?.value || '',
      note: $('#transactionNote')?.value?.trim() || '',
      cleared: !!$('#cleared')?.checked,
      currency: $('#transactionCurrency')?.value || '',
      source_amount: $('#transactionSourceAmount')?.value || '',
      exchange_rate: $('#transactionExchangeRate')?.value || '',
      exchange_date: $('#transactionExchangeDate')?.value || '',
      converted_amount: $('#transactionConvertedAmount')?.value || '',
      tax_treatment: $('#transactionTaxTreatment')?.value || '',
      indirect_tax_amount: $('#transactionIndirectTaxAmount')?.value || '',
      indirect_tax_recoverable: !!$('#transactionIndirectTaxRecoverable')?.checked,
      personal_use_pct: $('#transactionPersonalUsePct')?.value || '',
      review_status: $('#transactionReviewStatus')?.value || '',
      review_notes: $('#transactionReviewNotes')?.value?.trim() || '',
      payer_name: type === 'income' ? ($('#payerName')?.value?.trim() || '') : '',
      tax_form_type: type === 'income' ? ($('#taxFormType')?.value || '') : ''
    };
  }

  function hookEditSubmit() {
    if (submitHooked) return;
    const form = $('#transactionForm');
    if (!form) return;
    submitHooked = true;
    form.addEventListener('submit', async (event) => {
      if (!editId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const res = await api('/api/transactions/' + encodeURIComponent(editId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editPayload())
      });
      if (!res || !res.ok) {
        const err = await res?.json?.().catch(() => null);
        const msg = $('#transactionFormMessage');
        if (msg) msg.textContent = err?.error || 'Unable to update transaction.';
        return;
      }
      editId = '';
      location.reload();
    }, true);
  }

  function populateEdit(tx) {
    editId = tx.id;
    hookEditSubmit();
    openDrawerForEdit();
    setField('txType', tx.type || 'expense');
    setField('date', String(tx.date || '').slice(0, 10));
    setField('description', tx.description || '');
    setField('account', tx.account_id || '');
    setField('category', tx.category_id || '');
    setField('amount', tx.amount || '');
    setField('cleared', !!tx.cleared);
    setField('transactionNote', tx.note || '');
    setField('payerName', tx.payer_name || '');
    setField('taxFormType', tx.tax_form_type || '');
    setField('transactionCurrency', tx.currency || '');
    setField('transactionSourceAmount', tx.source_amount || '');
    setField('transactionExchangeRate', tx.exchange_rate || '');
    setField('transactionExchangeDate', String(tx.exchange_date || '').slice(0, 10));
    setField('transactionConvertedAmount', tx.converted_amount || '');
    setField('transactionTaxTreatment', tx.tax_treatment || '');
    setField('transactionPersonalUsePct', tx.personal_use_pct || '');
    setField('transactionIndirectTaxAmount', tx.indirect_tax_amount || '');
    setField('transactionIndirectTaxRecoverable', !!tx.indirect_tax_recoverable);
    setField('transactionReviewStatus', tx.review_status || '');
    setField('transactionReviewNotes', tx.review_notes || '');
  }

  async function runEdit(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const tx = await selectedTransaction();
      if (!tx?.id) throw new Error('Transaction not found.');
      populateEdit(tx);
      clearSelection();
    } catch (error) {
      alert(error.message || 'Unable to edit transaction.');
    } finally {
      button.disabled = false;
    }
  }

  async function runDelete(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const tx = await selectedTransaction();
      if (!tx?.id) throw new Error('Transaction not found.');
      if (!confirm('Delete this transaction?')) return;
      const res = await api('/api/transactions/' + encodeURIComponent(tx.id), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Deleted from checkbox action popup' })
      });
      if (!res || !res.ok) {
        const err = await res?.json?.().catch(() => null);
        throw new Error(err?.error || 'Unable to delete transaction.');
      }
      clearSelection();
      location.reload();
    } catch (error) {
      alert(error.message || 'Unable to delete transaction.');
    } finally {
      button.disabled = false;
    }
  }

  function wireTable() {
    installStyle();
    $$('.transactions-table th.col-actions').forEach(node => node.remove());
    const table = $('.transactions-table');
    if (!table || table.dataset.txCheckboxActionsStable === 'true') return;
    table.dataset.txCheckboxActionsStable = 'true';

    table.addEventListener('click', (event) => {
      const checkbox = event.target?.closest?.('tbody input[type="checkbox"]');
      if (!checkbox) return;
      setTimeout(() => selectCheckbox(checkbox), 0);
    }, true);

    table.addEventListener('change', (event) => {
      const checkbox = event.target?.closest?.('tbody input[type="checkbox"]');
      if (!checkbox) return;
      event.stopImmediatePropagation();
      selectCheckbox(checkbox);
    }, true);
  }

  function start() {
    wireTable();
    new MutationObserver(wireTable).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', (event) => {
      const popup = $('#txRowPopup');
      if (!popup || popup.hidden) return;
      if (popup.contains(event.target)) return;
      if (event.target?.closest?.('tbody input[type="checkbox"]')) return;
      clearSelection();
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
