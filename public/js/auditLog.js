'use strict';

// ══════════════════════════════════════════════
//  감사로그
// ══════════════════════════════════════════════

let _alRows = [];
let _alFp   = [];   // flatpickr 인스턴스 [start, end]

const AL_TABLE_LABELS = {
  inventory:        '재고',
  inbound:          '입고품목',
  inbound_orders:   '입고주문',
  outbound_items:   '출고품목',
  outbound_orders:  '출고주문',
  return_orders:    '반품주문',
  return_items:     '반품품목',
  exchange_items:   '교환품목',
  purchase_vendors: '매입거래처',
  sales_vendors:    '출고거래처',
  users:            '사용자',
  company:          '회사정보',
};

const AL_ACTION_LABELS = { create: '등록', update: '수정', delete: '삭제' };
const AL_ACTION_CLS    = { create: 'al-act-create', update: 'al-act-update', delete: 'al-act-delete' };

function alEsc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function alFmtDate(str) {
  if (!str) return '-';
  return str.slice(0, 16).replace('T', ' ');
}

function alExtractContent(row) {
  try {
    const data = JSON.parse(row.new_data || row.old_data || '{}');
    if (data.model_name)    return `${data.manufacturer || ''} ${data.model_name}`.trim();
    if (data.company_name)  return data.company_name;
    if (data.individual_name) return data.individual_name;
    if (data.vendor_name)   return data.vendor_name;
    if (data.name)          return data.name;
    if (data.username)      return data.username;
  } catch (_) {}
  return '';
}

async function loadAuditLog() {
  alInitDatePickers();

  const start = document.getElementById('al-date-start')?.value || '';
  const end   = document.getElementById('al-date-end')?.value   || '';
  const q     = document.getElementById('al-search')?.value.trim() || '';

  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end)   params.set('end',   end);
  if (q)     params.set('q',     q);

  try {
    _alRows = await API.get(`/audit-log?${params}`);
    alRenderTable();
  } catch (err) {
    document.getElementById('al-tbody').innerHTML =
      `<tr><td colspan="6" class="empty">${alEsc(err.message)}</td></tr>`;
  }
}

function alRenderTable() {
  const tbody = document.getElementById('al-tbody');
  const q     = document.getElementById('al-search')?.value.toLowerCase() || '';

  const rows = q ? _alRows.filter(r =>
    (r.performer_name || '').toLowerCase().includes(q) ||
    (AL_TABLE_LABELS[r.table_name] || r.table_name || '').toLowerCase().includes(q) ||
    (AL_ACTION_LABELS[r.action] || r.action || '').toLowerCase().includes(q) ||
    alExtractContent(r).toLowerCase().includes(q)
  ) : _alRows;

  document.getElementById('al-count').textContent =
    `총 ${rows.length.toLocaleString()}건`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">조회된 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((r, i) => {
    const label   = AL_TABLE_LABELS[r.table_name] || r.table_name;
    const action  = AL_ACTION_LABELS[r.action]    || r.action;
    const actCls  = AL_ACTION_CLS[r.action]        || '';
    const content = alExtractContent(r);
    return `
      <tr>
        <td class="cell-date" style="white-space:nowrap">${alEsc(alFmtDate(r.performed_at))}</td>
        <td>${alEsc(r.performer_name || '-')}</td>
        <td><span class="al-table-badge">${alEsc(label)}</span></td>
        <td><span class="al-action ${actCls}">${alEsc(action)}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${alEsc(content)}</td>
        <td><button class="btn btn-xs btn-ghost" onclick="alShowDetail(${i})">상세</button></td>
      </tr>
    `;
  }).join('');
}

function alShowDetail(idx) {
  const r = (document.getElementById('al-search')?.value
    ? _alRows.filter(row =>
        (row.performer_name || '').toLowerCase().includes(document.getElementById('al-search').value.toLowerCase()) ||
        (AL_TABLE_LABELS[row.table_name] || '').toLowerCase().includes(document.getElementById('al-search').value.toLowerCase()) ||
        alExtractContent(row).toLowerCase().includes(document.getElementById('al-search').value.toLowerCase())
      )
    : _alRows)[idx];
  if (!r) return;

  const fmt = json => {
    try { return JSON.stringify(JSON.parse(json), null, 2); }
    catch { return json || '(없음)'; }
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '1200';
  overlay.innerHTML = `
    <div class="modal" style="max-width:720px;width:95vw">
      <div class="modal-hd">
        <h3>감사로그 상세</h3>
        <button class="btn-close" id="al-detail-close">✕</button>
      </div>
      <div class="modal-bd" style="overflow:auto;max-height:70vh">
        <table class="tbl" style="margin-bottom:.75rem">
          <tbody>
            <tr><th style="width:100px">일시</th><td>${alEsc(r.performed_at)}</td></tr>
            <tr><th>수행자</th><td>${alEsc(r.performer_name || '-')}</td></tr>
            <tr><th>메뉴</th><td>${alEsc(AL_TABLE_LABELS[r.table_name] || r.table_name)}</td></tr>
            <tr><th>작업</th><td>${alEsc(AL_ACTION_LABELS[r.action] || r.action)}</td></tr>
            <tr><th>레코드 ID</th><td style="font-size:.78rem;word-break:break-all">${alEsc(r.record_id)}</td></tr>
          </tbody>
        </table>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
          <div>
            <div style="font-size:.82rem;font-weight:700;color:var(--gray-600);margin-bottom:.3rem">변경 전</div>
            <pre class="al-pre">${alEsc(fmt(r.old_data))}</pre>
          </div>
          <div>
            <div style="font-size:.82rem;font-weight:700;color:var(--gray-600);margin-bottom:.3rem">변경 후</div>
            <pre class="al-pre">${alEsc(fmt(r.new_data))}</pre>
          </div>
        </div>
      </div>
      <div class="modal-ft">
        <button class="btn btn-ghost" id="al-detail-close2">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#al-detail-close').onclick  = () => overlay.remove();
  overlay.querySelector('#al-detail-close2').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function alInitDatePickers() {
  if (_alFp.length) return;
  const startEl = document.getElementById('al-date-start');
  const endEl   = document.getElementById('al-date-end');
  if (!startEl || !endEl || typeof flatpickr === 'undefined') return;

  _alFp[0] = flatpickr(startEl, { locale: 'ko', dateFormat: 'Y-m-d', allowInput: true });
  _alFp[1] = flatpickr(endEl,   { locale: 'ko', dateFormat: 'Y-m-d', allowInput: true });
}

// 이벤트 바인딩 (DOM 로드 후)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-al-search')?.addEventListener('click', loadAuditLog);
  document.getElementById('btn-al-reset')?.addEventListener('click', () => {
    _alFp.forEach(fp => fp?.clear?.());
    document.getElementById('al-search').value = '';
    loadAuditLog();
  });
  document.getElementById('al-search')?.addEventListener('input', alRenderTable);
});
