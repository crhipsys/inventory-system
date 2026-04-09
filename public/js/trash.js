'use strict';

// ══════════════════════════════════════════════
//  휴지통 관리
// ══════════════════════════════════════════════

let _trashItems = [];

function trEsc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function trFmtDate(str) {
  if (!str) return '-';
  return str.slice(0, 16).replace('T', ' ');
}

function trDaysLeft(autoDeleteAt) {
  if (!autoDeleteAt) return '';
  const diff = new Date(autoDeleteAt) - new Date();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0)  return '<span style="color:var(--danger);font-weight:700">만료됨</span>';
  if (days <= 7)  return `<span style="color:var(--danger)">${days}일 남음</span>`;
  if (days <= 14) return `<span style="color:#f08c00">${days}일 남음</span>`;
  return `<span style="color:var(--gray-500)">${days}일 남음</span>`;
}

async function loadTrash() {
  try {
    _trashItems = await API.get('/trash');
    renderTrashTable(_trashItems);
  } catch (err) {
    document.getElementById('trash-tbody').innerHTML =
      `<tr><td colspan="6" class="empty">${trEsc(err.message)}</td></tr>`;
  }
}

function renderTrashTable(items) {
  const tbody = document.getElementById('trash-tbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">휴지통이 비어있습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(t => `
    <tr>
      <td><span class="trash-type-badge">${trEsc(t.table_label)}</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${trEsc(t.display_name)}</td>
      <td>${trEsc(t.deleted_by_name || '-')}</td>
      <td class="cell-date">${trFmtDate(t.deleted_at)}</td>
      <td>${trDaysLeft(t.auto_delete_at)}<br><span style="font-size:.78rem;color:var(--gray-400)">${trFmtDate(t.auto_delete_at)}</span></td>
      <td class="cell-action" style="white-space:nowrap">
        <button class="btn btn-xs btn-ghost" onclick="trashRestore('${trEsc(t.id)}')">복구</button>
        <button class="btn btn-xs btn-ghost" style="color:var(--danger)" onclick="trashDelete('${trEsc(t.id)}','${trEsc(t.display_name)}')">영구삭제</button>
      </td>
    </tr>
  `).join('');
}

async function trashRestore(id) {
  if (!confirm('이 항목을 복구하시겠습니까?')) return;
  try {
    await API.post(`/trash/${id}/restore`, {});
    toast('복구되었습니다.', 'success');
    await loadTrash();
  } catch (err) { toast(err.message, 'error'); }
}

async function trashDelete(id, name) {
  if (!confirm(`"${name}" 을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
  try {
    await API.delete(`/trash/${id}`);
    toast('영구 삭제되었습니다.', 'success');
    await loadTrash();
  } catch (err) { toast(err.message, 'error'); }
}

// 검색 필터
document.getElementById('trash-search')?.addEventListener('input', function () {
  const q = this.value.toLowerCase();
  if (!q) { renderTrashTable(_trashItems); return; }
  renderTrashTable(_trashItems.filter(t =>
    (t.table_label   || '').toLowerCase().includes(q) ||
    (t.display_name  || '').toLowerCase().includes(q) ||
    (t.deleted_by_name || '').toLowerCase().includes(q)
  ));
});
