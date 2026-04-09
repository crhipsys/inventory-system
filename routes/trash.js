'use strict';

const { getDB, nowStr } = require('../db/database');
const auth   = require('../middleware/auth');
const router = require('express').Router();

const TABLE_LABELS = {
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
};

// 테이블별 표시명 추출
async function getDisplayName(db, tableName, recordId) {
  try {
    const row = await db.getAsync(`SELECT * FROM ${tableName} WHERE id = ?`, [recordId]);
    if (!row) return '(삭제된 레코드)';
    if (tableName === 'purchase_vendors')
      return row.company_name || row.individual_name || recordId;
    if (tableName === 'sales_vendors')
      return row.company_name || recordId;
    if (tableName === 'inbound_orders' || tableName === 'outbound_orders')
      return `${row.order_date || ''} ${row.vendor_name || ''}`.trim() || recordId;
    if (tableName === 'inbound')
      return `${row.manufacturer || ''} ${row.model_name || ''}`.trim() || recordId;
    if (tableName === 'inventory')
      return `${row.manufacturer || ''} ${row.model_name || ''}`.trim() || recordId;
    if (tableName === 'users')
      return row.name || row.username || recordId;
    return recordId;
  } catch { return recordId; }
}

// ── GET / — 휴지통 목록 ──────────────────────────────
router.get('/', auth('admin'), async (req, res) => {
  try {
    const db   = getDB();
    const rows = await db.allAsync(
      `SELECT t.*, u.name AS deleted_by_name
       FROM trash t
       LEFT JOIN users u ON t.deleted_by = u.id
       ORDER BY t.deleted_at DESC`
    );

    const items = await Promise.all(rows.map(async r => ({
      ...r,
      table_label:  TABLE_LABELS[r.table_name] || r.table_name,
      display_name: await getDisplayName(db, r.table_name, r.record_id),
    })));

    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /:id/restore — 복구 ─────────────────────────
router.post('/:id/restore', auth('admin'), async (req, res) => {
  try {
    const db = getDB();
    const t  = await db.getAsync('SELECT * FROM trash WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ error: '휴지통 항목을 찾을 수 없습니다.' });

    await db.runAsync(
      `UPDATE ${t.table_name} SET is_deleted=0, deleted_at=NULL WHERE id=?`,
      [t.record_id]
    );
    await db.runAsync('DELETE FROM trash WHERE id=?', [req.params.id]);

    res.json({ message: '복구되었습니다.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /:id — 영구삭제 ───────────────────────────
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const db = getDB();
    const t  = await db.getAsync('SELECT * FROM trash WHERE id = ?', [req.params.id]);
    if (!t) return res.status(404).json({ error: '휴지통 항목을 찾을 수 없습니다.' });

    await db.runAsync(`DELETE FROM ${t.table_name} WHERE id=?`, [t.record_id]);
    await db.runAsync('DELETE FROM trash WHERE id=?', [req.params.id]);

    res.json({ message: '영구 삭제되었습니다.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
