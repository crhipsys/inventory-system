'use strict';
// ══════════════════════════════════════════════
//  상품 그룹 (productGroups.js)
// ══════════════════════════════════════════════

let _pgList    = [];   // 전체 그룹 목록
let _pgEditId  = null; // 수정 중인 그룹 ID (null=신규)
let _pgItems   = [];   // 편집 중인 그룹의 상품 목록

// ── 목록 로드 ────────────────────────────────────────────────────
async function loadProductGroups() {
  try {
    const list = await API.get('/product-groups');
    _pgList = Array.isArray(list) ? list : [];
    pgRenderList();
  } catch (err) { toast(err.message, 'error'); }
}

function pgRenderList() {
  const tbody = document.getElementById('pg-tbody');
  if (!tbody) return;
  if (!_pgList.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">그룹이 없습니다. [그룹 추가]를 눌러 생성하세요.</td></tr>';
    return;
  }
  const isEditor = currentUser?.role === 'editor' || currentUser?.role === 'admin';
  tbody.innerHTML = _pgList.map(g => `
    <tr class="inv-row" style="cursor:pointer" onclick="pgShowDetail('${g.id}')">
      <td><strong>${escHtml(g.group_name)}</strong></td>
      <td>${escHtml(g.category || '—')}</td>
      <td>${escHtml(g.brand || '—')}</td>
      <td style="text-align:center">${g.item_count}</td>
      <td style="text-align:center">${Number(g.total_stock).toLocaleString('ko-KR')}</td>
      <td style="text-align:right">
        ${isEditor ? `
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();pgOpenModal('${g.id}')">수정</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="event.stopPropagation();pgDeleteGroup('${g.id}','${escHtml(g.group_name)}')">삭제</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

// ── 그룹 상세 팝업 ───────────────────────────────────────────────
window.pgShowDetail = async function(id) {
  const modal   = document.getElementById('modal-pg-detail');
  const titleEl = document.getElementById('pg-detail-title');
  const contentEl = document.getElementById('pg-detail-content');
  const ftEl    = document.getElementById('pg-detail-ft');

  modal.classList.remove('hidden');
  contentEl.innerHTML = '<p class="empty">조회 중...</p>';

  try {
    const g = await API.get(`/product-groups/${id}`);
    titleEl.textContent = g.group_name;

    const isEditor = currentUser?.role === 'editor' || currentUser?.role === 'admin';
    let totalNormal = 0, totalDefective = 0, totalDisposal = 0;
    g.items.forEach(i => {
      totalNormal    += i.normal_stock    || 0;
      totalDefective += i.defective_stock || 0;
      totalDisposal  += i.disposal_stock  || 0;
    });

    contentEl.innerHTML = `
      <table class="data-table inv-hist-tbl" style="font-size:.82rem">
        <thead><tr><th>브랜드</th><th>모델명</th><th>스펙</th><th>정상</th><th>불량</th><th>폐기</th></tr></thead>
        <tbody>
          ${g.items.length ? g.items.map(i => `<tr>
            <td>${escHtml(i.manufacturer)}</td>
            <td>${escHtml(i.model_name)}</td>
            <td>${escHtml(i.spec || '—')}</td>
            <td>${i.normal_stock    > 0 ? `<span class="inv-stock-ok">${i.normal_stock}</span>`    : '<span style="color:var(--gray-300)">—</span>'}</td>
            <td>${i.defective_stock > 0 ? `<span class="inv-cond-badge defective">${i.defective_stock}</span>` : '<span style="color:var(--gray-300)">—</span>'}</td>
            <td>${i.disposal_stock  > 0 ? `<span class="inv-cond-badge disposal">${i.disposal_stock}</span>`   : '<span style="color:var(--gray-300)">—</span>'}</td>
          </tr>`).join('') : '<tr><td colspan="6" class="empty">포함 상품 없음</td></tr>'}
        </tbody>
      </table>
      <div class="pg-detail-summary">
        합계 — 정상 <strong>${totalNormal}</strong>개 / 불량 <strong>${totalDefective}</strong>개 / 폐기 <strong>${totalDisposal}</strong>개
      </div>
    `;

    // 수정 버튼
    ftEl.innerHTML = `
      ${isEditor ? `<button class="btn btn-ghost" onclick="document.getElementById('modal-pg-detail').classList.add('hidden');pgOpenModal('${id}')">수정</button>` : ''}
      <button class="btn btn-ghost" onclick="document.getElementById('modal-pg-detail').classList.add('hidden')">닫기</button>
    `;
  } catch (err) {
    contentEl.innerHTML = `<p class="empty" style="color:var(--danger)">${err.message}</p>`;
  }
};

// ── 그룹 추가/수정 모달 열기 ─────────────────────────────────────
window.pgOpenModal = async function(id = null) {
  _pgEditId = id;
  _pgItems  = [];

  document.getElementById('pg-name').value     = '';
  document.getElementById('pg-category').value = '';
  document.getElementById('pg-brand').value    = '';
  document.getElementById('pg-item-picker').classList.add('hidden');
  document.getElementById('pg-picker-search').value = '';
  document.getElementById('pg-picker-results').innerHTML = '';
  document.getElementById('pg-modal-title').textContent = id ? '그룹 수정' : '그룹 추가';

  if (id) {
    try {
      const g = await API.get(`/product-groups/${id}`);
      document.getElementById('pg-name').value     = g.group_name;
      document.getElementById('pg-category').value = g.category || '';
      document.getElementById('pg-brand').value    = g.brand    || '';
      _pgItems = g.items.map(i => ({
        manufacturer: i.manufacturer,
        model_name:   i.model_name,
        spec:         i.spec || '',
      }));
    } catch (err) { toast(err.message, 'error'); return; }
  }

  pgRenderItemsList();
  document.getElementById('modal-pg-edit').classList.remove('hidden');
};

function pgRenderItemsList() {
  const el = document.getElementById('pg-items-list');
  if (!_pgItems.length) {
    el.innerHTML = '<p class="empty" style="font-size:.8rem;padding:.5rem 0">추가된 상품이 없습니다.</p>';
    return;
  }
  el.innerHTML = _pgItems.map((item, idx) => `
    <div class="pg-item-row">
      <span class="pg-item-mfr">${escHtml(item.manufacturer)}</span>
      <span class="pg-item-model">${escHtml(item.model_name)}</span>
      <span class="pg-item-spec">${escHtml(item.spec || '—')}</span>
      <button class="pg-item-del" onclick="pgRemoveItem(${idx})">✕</button>
    </div>
  `).join('');
}

window.pgRemoveItem = function(idx) {
  _pgItems.splice(idx, 1);
  pgRenderItemsList();
};

// ── 상품 검색 피커 ───────────────────────────────────────────────
window.pgOpenItemPicker = function() {
  const picker = document.getElementById('pg-item-picker');
  picker.classList.toggle('hidden');
  if (!picker.classList.contains('hidden')) {
    document.getElementById('pg-picker-search').focus();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pg-picker-search')?.addEventListener('input', e => {
    pgSearchItems(e.target.value.trim());
  });
});

function pgSearchItems(q) {
  const el = document.getElementById('pg-picker-results');
  if (!q) { el.innerHTML = ''; return; }

  const ql = q.toLowerCase();
  const matches = _invAll.filter(r =>
    (r.manufacturer || '').toLowerCase().includes(ql) ||
    (r.model_name   || '').toLowerCase().includes(ql) ||
    (r.spec         || '').toLowerCase().includes(ql)
  ).slice(0, 30);

  if (!matches.length) {
    el.innerHTML = '<p style="color:var(--gray-400);padding:.3rem 0">검색 결과 없음</p>';
    return;
  }

  // 기존 그룹에 이미 포함된 항목 목록 (경고 표시용)
  const allGroupItems = _pgList.flatMap(g => (g.items || []));

  el.innerHTML = matches.map(r => {
    const alreadyInGroup = allGroupItems.find(gi =>
      gi.manufacturer === r.manufacturer && gi.model_name === r.model_name &&
      (gi.spec || '') === (r.spec || '')
    );
    const warn = alreadyInGroup ? ' <span class="pg-warn-badge" title="이미 다른 그룹에 포함">⚠</span>' : '';
    return `<div class="pg-picker-row" onclick="pgPickItem('${escHtml(r.manufacturer)}','${escHtml(r.model_name)}','${escHtml(r.spec||'')}')">
      <span class="pg-picker-mfr">${escHtml(r.manufacturer)}</span>
      <span class="pg-picker-model">${escHtml(r.model_name)}</span>
      <span class="pg-picker-spec">${escHtml(r.spec || '—')}</span>${warn}
    </div>`;
  }).join('');
}

window.pgPickItem = function(manufacturer, model_name, spec) {
  const exists = _pgItems.find(i =>
    i.manufacturer === manufacturer && i.model_name === model_name && (i.spec || '') === (spec || '')
  );
  if (exists) { toast('이미 추가된 상품입니다.', 'error'); return; }

  _pgItems.push({ manufacturer, model_name, spec: spec || '' });
  pgRenderItemsList();
  document.getElementById('pg-picker-search').value = '';
  document.getElementById('pg-picker-results').innerHTML = '';
  document.getElementById('pg-item-picker').classList.add('hidden');
};

// ── 저장 ─────────────────────────────────────────────────────────
window.pgSaveGroup = async function() {
  const group_name = document.getElementById('pg-name').value.trim();
  const category   = document.getElementById('pg-category').value.trim();
  const brand      = document.getElementById('pg-brand').value.trim();

  if (!group_name) return toast('그룹명을 입력하세요.', 'error');

  try {
    const body = { group_name, category, brand, items: _pgItems };
    if (_pgEditId) {
      await API.put(`/product-groups/${_pgEditId}`, body);
    } else {
      await API.post('/product-groups', body);
    }
    toast('저장되었습니다.', 'success');
    document.getElementById('modal-pg-edit').classList.add('hidden');
    loadProductGroups();
  } catch (err) { toast(err.message, 'error'); }
};

// ── 삭제 ─────────────────────────────────────────────────────────
window.pgDeleteGroup = async function(id, name) {
  if (!confirm(`"${name}" 그룹을 삭제하시겠습니까?`)) return;
  try {
    await API.del(`/product-groups/${id}`);
    toast('삭제되었습니다.', 'success');
    loadProductGroups();
  } catch (err) { toast(err.message, 'error'); }
};
