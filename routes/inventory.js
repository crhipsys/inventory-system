'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const auth  = require('../middleware/auth');
const { writeAuditLog } = require('../middleware/audit');

// GET /api/inventory
router.get('/', auth('viewer'), async (req, res) => {
  const db   = getDB();
  const rows = await db.allAsync(
    `SELECT inv.*, v.company_name as last_vendor_name
     FROM inventory inv
     LEFT JOIN vendors v ON inv.last_vendor_id = v.id
     ORDER BY inv.manufacturer, inv.model_name`
  );
  res.json(rows);
});

// GET /api/inventory/:id
router.get('/:id', auth('viewer'), async (req, res) => {
  const db  = getDB();
  const row = await db.getAsync(
    `SELECT inv.*, v.company_name as last_vendor_name
     FROM inventory inv
     LEFT JOIN vendors v ON inv.last_vendor_id = v.id
     WHERE inv.id = ?`, [req.params.id]
  );
  if (!row) return res.status(404).json({ error: '재고 항목을 찾을 수 없습니다.' });
  res.json(row);
});

// GET /api/inventory/:id/avg-history  (평균매입가 이력)
router.get('/:manufacturer/:model/avg-history', auth('viewer'), async (req, res) => {
  const db   = getDB();
  const rows = await db.allAsync(
    `SELECT * FROM avg_price_history
     WHERE manufacturer = ? AND model_name = ?
     ORDER BY changed_at DESC`,
    [req.params.manufacturer, req.params.model]
  );
  res.json(rows);
});

// POST /api/inventory/adjustments  (재고조정)
router.post('/adjustments', auth('editor'), async (req, res) => {
  const { adjustment_date, manufacturer, model_name, adjustment_type, quantity, temp_price, confirmed_price, reason, notes } = req.body;
  if (!manufacturer || !model_name || !quantity || !adjustment_type)
    return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });

  const db  = getDB();
  const id  = uuidv4();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db.runAsync(
    `INSERT INTO inventory_adjustments
     (id, adjustment_date, manufacturer, model_name, adjustment_type, quantity,
      temp_price, confirmed_price, reason, notes, status, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'temp', ?, ?)`,
    [id, adjustment_date || now.slice(0, 10), manufacturer, model_name, adjustment_type,
     quantity, temp_price || null, confirmed_price || null, reason || null, notes || null, now, req.user.id]
  );

  // 재고 수량 반영
  const inv = await db.getAsync(
    'SELECT * FROM inventory WHERE manufacturer = ? AND model_name = ?',
    [manufacturer, model_name]
  );
  if (inv) {
    const delta = (adjustment_type === 'shortage') ? -Math.abs(quantity) : Math.abs(quantity);
    await db.runAsync(
      'UPDATE inventory SET current_stock = current_stock + ?, updated_at = ? WHERE id = ?',
      [delta, now, inv.id]
    );
  }

  const created = await db.getAsync('SELECT * FROM inventory_adjustments WHERE id = ?', [id]);
  await writeAuditLog('inventory_adjustments', id, 'create', null, created, req.user.id);
  res.status(201).json(created);
});

// GET /api/inventory/adjustments
router.get('/adjustments/list', auth('viewer'), async (req, res) => {
  const db   = getDB();
  const rows = await db.allAsync(
    'SELECT * FROM inventory_adjustments WHERE is_deleted = 0 ORDER BY adjustment_date DESC, created_at DESC'
  );
  res.json(rows);
});

module.exports = router;
