/* Checkbox-driven transaction edit/remove actions. */
(function () {
  if (!/\/transactions(?:$|[?#/])?/i.test(location.pathname)) return;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let selected = { id: '', checkbox: null };
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

  function style() {
    if ($('#txCheckboxActionsStyle')) return;
    const s = document.createElement('style');
    s.id = 'txCheckboxActionsStyle';
    s.textContent = `
      .transactions-table th.col-actions,.transactions-table td.table-actions-cell,.transactions-table .row-action-button{display:none!important}
      .transactions-table tr.is-selected{background:rgba(79,70,229,.06)}
      .tx-row-popup{position:fixed;z-index:1000;min-width:142px;max-width:min(220px,calc(100vw - 16px));padding:8px;border-radius:14px;border:1px solid rgba(148,163,184,.28);background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.18);display:grid;gap:6px}
      .tx-row-popup[hidden]{display:none!important}
      .tx-popup-action{width:100%;border:0;border-radius:10px;padding:10px 12px;background:#f8fafc;color:#0f172a;font:inherit;font-weight:700;text-align:left;cursor:pointer}
      .tx-popup-action:hover{background:#eef2ff}.tx-popup-action:disabled{opacity:.55;cursor:wait}.tx-popup-action-danger{color:#b91c1c}
    `;
    document.head.appendChild(s);
  }

  function popup() {
    let p = $('#txRowPopup');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'txRowPopup';
    p.className = 'tx-row-popup';
    p.hidden = true;
    p.innerHTML = '<button type="button" id="txPopupEdit" class="tx-popup-action">Edit</button><button type="button" id="txPopupDelete" class="tx-popup-action tx-popup-action-danger">Delete</button>';
    document.body.appendChild(p);
    $('#txPopupEdit', p).addEventListener('click', runEdit);
    $('#txPopupDelete', p).addEventListener('click', runRemove);
    return p;
  }

  function rowFor(cb) { return cb?.closest('tr') || null; }
  function checkboxId(cb) {
    const row = rowFor(cb);
    const vals = [cb?.dataset?.id, cb?.dataset?.transactionId, cb?.value, row?.dataset?.id, row?.dataset?.transactionId, row?.id?.replace(/^txn-/, '')]
      .map(v => String(v || '').trim()).filter(Boolean);
    return vals.find(v => UUID_RE.test(v)) || '';
  }

  async function allTransactions() {
    const res = await api('/api/transactions?limit=500');
    if (!res || !res.ok) throw new Error('Unable to load transactions.');
    const body = await res.json().catch(() => null);
    return Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
  }

  async function transactionForSelection() {
    const list = await allTransactions();
    if (selected.id) return list.find(t => String(t.id) === String(selected.id)) || null;
    const rows = $$('.transactions-table tbody tr');
    const index = rows.indexOf(rowFor(selected.checkbox));
    return index >= 0 ? list[index] || null : null;
  }

  function place(cb) {
    const p = popup();
    const anchor = cb?.closest('td,th,label') || cb;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    p.hidden = false;
    const pr = p.getBoundingClientRect();
    const pad = 8, gap = 10;
    const right = r.right + gap;
    const maxLeft = innerWidth - pr.width - pad;
    const left = right <= maxLeft ? right : Math.max(pad, Math.min(r.left, maxLeft));
    const top = Math.max(pad, Math.min(r.top + r.height / 2 - pr.height / 2, innerHeight - pr.height - pad));
    p.style.left = Math.round(left) + 'px';
    p.style.top = Math.round(top) + 'px';
  }

  function clear(hide = true) {
    selected = { id: '', checkbox: null };
    $$('.transactions-table tbody input[type="checkbox"]').forEach(cb => { cb.checked = false; rowFor(cb)?.classList.remove('is-selected'); });
    if (hide) popup().hidden = true;
  }

  function setField(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value ?? '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openDrawer() {
    $('#txDrawer')?.removeAttribute('hidden');
    const b = $('#addTxTogglePage');
    if (b) { b.textContent = 'Close'; b.setAttribute('aria-expanded', 'true'); }
    const title = $('#txDrawer .drawer-title');
    if (title) title.textContent = 'Edit transaction';
  }

  function payload() {
    const type = $('#txType')?.value === 'income' ? 'income' : 'expense';
    return {
      account_id: $('#account')?.value || '', category_id: $('#category')?.value || '', amount: parseFloat($('#amount')?.value || ''), type,
      description: $('#description')?.value?.trim() || '', date: $('#date')?.value || '', note: $('#transactionNote')?.value?.trim() || '', cleared: !!$('#cleared')?.checked,
      currency: $('#transactionCurrency')?.value || '', source_amount: $('#transactionSourceAmount')?.value || '', exchange_rate: $('#transactionExchangeRate')?.value || '', exchange_date: $('#transactionExchangeDate')?.value || '', converted_amount: $('#transactionConvertedAmount')?.value || '',
      tax_treatment: $('#transactionTaxTreatment')?.value || '', indirect_tax_amount: $('#transactionIndirectTaxAmount')?.value || '', indirect_tax_recoverable: !!$('#transactionIndirectTaxRecoverable')?.checked, personal_use_pct: $('#transactionPersonalUsePct')?.value || '', review_status: $('#transactionReviewStatus')?.value || '', review_notes: $('#transactionReviewNotes')?.value?.trim() || '',
      payer_name: type === 'income' ? ($('#payerName')?.value?.trim() || '') : '', tax_form_type: type === 'income' ? ($('#taxFormType')?.value || '') : ''
    };
  }

  function hookSubmit() {
    if (submitHooked) return;
    const form = $('#transactionForm');
    if (!form) return;
    submitHooked = true;
    form.addEventListener('submit', async e => {
      if (!editId) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const res = await api('/api/transactions/' + encodeURIComponent(editId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      if (!res || !res.ok) { const err = await res?.json?.().catch(() => null); ($('#transactionFormMessage') || {}).textContent = err?.error || 'Unable to update transaction.'; return; }
      editId = '';
      location.reload();
    }, true);
  }

  async function runEdit(e) {
    e.preventDefault(); e.stopPropagation();
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const tx = await transactionForSelection();
      if (!tx?.id) throw new Error('Transaction not found.');
      editId = tx.id; hookSubmit(); openDrawer();
      setField('txType', tx.type || 'expense'); setField('date', String(tx.date || '').slice(0, 10)); setField('description', tx.description || ''); setField('account', tx.account_id || ''); setField('category', tx.category_id || ''); setField('amount', tx.amount || ''); setField('cleared', !!tx.cleared); setField('transactionNote', tx.note || '');
      setField('payerName', tx.payer_name || ''); setField('taxFormType', tx.tax_form_type || ''); setField('transactionCurrency', tx.currency || ''); setField('transactionSourceAmount', tx.source_amount || ''); setField('transactionExchangeRate', tx.exchange_rate || ''); setField('transactionExchangeDate', String(tx.exchange_date || '').slice(0, 10)); setField('transactionConvertedAmount', tx.converted_amount || ''); setField('transactionTaxTreatment', tx.tax_treatment || ''); setField('transactionPersonalUsePct', tx.personal_use_pct || ''); setField('transactionIndirectTaxAmount', tx.indirect_tax_amount || ''); setField('transactionIndirectTaxRecoverable', !!tx.indirect_tax_recoverable); setField('transactionReviewStatus', tx.review_status || ''); setField('transactionReviewNotes', tx.review_notes || '');
      clear();
    } catch (err) { alert(err.message || 'Unable to edit transaction.'); }
    finally { btn.disabled = false; }
  }

  async function runRemove(e) {
    e.preventDefault(); e.stopPropagation();
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const tx = await transactionForSelection();
      if (!tx?.id) throw new Error('Transaction not found.');
      if (!confirm('Delete this transaction?')) return;
      const res = await api('/api/transactions/' + encodeURIComponent(tx.id), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Deleted from checkbox action popup' }) });
      if (!res || !res.ok) { const err = await res?.json?.().catch(() => null); throw new Error(err?.error || 'Unable to delete transaction.'); }
      clear(); location.reload();
    } catch (err) { alert(err.message || 'Unable to delete transaction.'); }
    finally { btn.disabled = false; }
  }

  function choose(cb) {
    $$('.transactions-table tbody input[type="checkbox"]').forEach(other => { if (other !== cb) { other.checked = false; rowFor(other)?.classList.remove('is-selected'); } });
    if (!cb.checked) { clear(); return; }
    selected = { id: checkboxId(cb), checkbox: cb };
    rowFor(cb)?.classList.add('is-selected');
    requestAnimationFrame(() => place(cb));
  }

  function wire() {
    style();
    $$('.transactions-table th.col-actions').forEach(n => n.remove());
    const table = $('.transactions-table');
    if (!table || table.dataset.txCheckboxV2 === 'true') return;
    table.dataset.txCheckboxV2 = 'true';
    table.addEventListener('change', e => { const cb = e.target?.closest?.('tbody input[type="checkbox"]'); if (cb) { e.stopImmediatePropagation(); choose(cb); } }, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    wire();
    new MutationObserver(wire).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', e => { const p = $('#txRowPopup'); if (p && !p.hidden && !p.contains(e.target) && !e.target?.closest?.('tbody input[type="checkbox"]')) clear(); }, true);
    window.addEventListener('scroll', () => { if (selected.checkbox && !popup().hidden) place(selected.checkbox); }, true);
    window.addEventListener('resize', () => { if (selected.checkbox && !popup().hidden) place(selected.checkbox); });
  });
})();
