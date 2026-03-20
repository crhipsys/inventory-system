'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDB, nowStr } = require('../db/database');
const auth  = require('../middleware/auth');
const { writeAuditLog, moveToTrash } = require('../middleware/audit');

// GET /api/outbound  ── editor 이상
router.get('/', auth('editor'), async (req, res) => {
  try {
    const db   = getDB();
    const rows = await db.allAsync(
      `SELECT o.*, v.company_name AS vendor_name
       FROM outbound o LEFT JOIN vendors v ON o.vendor_id = v.id
       WHERE o.is_deleted = 0
       ORDER BY o.outbound_date DESC, o.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/outbound/:id
router.get('/:id', auth('editor'), async (req, res) => {
  try {
    const db  = getDB();
    const row = await db.getAsync(
      `SELECT o.*, v.company_name AS vendor_name
       FROM outbound o LEFT JOIN vendors v ON o.vendor_id = v.id
       WHERE o.id = ? AND o.is_deleted = 0`, [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '출고 내역을 찾을 수 없습니다.' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/outbound
router.post('/', auth('editor'), async (req, res) => {
  try {
    const { outbound_date, category, manufacturer, model_name, quantity, sale_price, vendor_id } = req.body;
    if (!manufacturer || !model_name || !quantity || !sale_price || !outbound_date)
      return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });

    const db  = getDB();
    const inv = await db.getAsync(
      'SELECT * FROM inventory WHERE manufacturer = ? AND model_name = ?',
      [manufacturer, model_name]
    );
    if (!inv || inv.current_stock < Number(quantity))
      return res.status(400).json({ error: '재고가 부족합니다.' });

    const avgPrice    = inv.avg_purchase_price;
    const totalPrice  = Number(quantity) * Number(sale_price);
    const profitUnit  = Number(sale_price) - avgPrice;
    const totalProfit = profitUnit * Number(quantity);
    const id          = uuidv4();
    const n           = nowStr();

    await db.runAsync(
      `INSERT INTO outbound
         (id, outbound_date, category, manufacturer, model_name, quantity, sale_price,
          total_price, vendor_id, avg_purchase_price, profit_per_unit, total_profit, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, outbound_date, category || null, manufacturer, model_name,
       quantity, sale_price, totalPrice, vendor_id || null,
       avgPrice, profitUnit, totalProfit, n, req.user.id]
    );

    await db.runAsync(
      `UPDATE inventory
       SET current_stock = current_stock - ?, total_outbound = total_outbound + ?, updated_at = ?
       WHERE id = ?`,
      [quantity, quantity, n, inv.id]
    );

    const created = await db.getAsync('SELECT * FROM outbound WHERE id = ?', [id]);
    await writeAuditLog('outbound', id, 'create', null, created, req.user.id);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/outbound/:id
router.put('/:id', auth('editor'), async (req, res) => {
  try {
    const db  = getDB();
    const old = await db.getAsync(
      'SELECT * FROM outbound WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!old) return res.status(404).json({ error: '출고 내역을 찾을 수 없습니다.' });

    const { outbound_date, category, manufacturer, model_name, quantity, sale_price, vendor_id } = req.body;
    const newQty    = quantity   !== undefined ? Number(quantity)   : old.quantity;
    const newPrice  = sale_price !== undefined ? Number(sale_price) : old.sale_price;
    const newTotal  = newQty * newPrice;
    const profitU   = newPrice - old.avg_purchase_price;
    const profitT   = profitU * newQty;
    const n         = nowStr();

    await db.runAsync(
      `UPDATE outbound
       SET outbound_date=?, category=?, manufacturer=?, model_name=?, quantity=?,
           sale_price=?, total_price=?, vendor_id=?, profit_per_unit=?,
           total_profit=?, updated_at=?, updated_by=?
       WHERE id=?`,
      [outbound_date ?? old.outbound_date, category ?? old.category,
       manufacturer ?? old.manufacturer, model_name ?? old.model_name,
       newQty, newPrice, newTotal, vendor_id ?? old.vendor_id,
       profitU, profitT, n, req.user.id, req.params.id]
    );

    const qtyDiff = newQty - old.quantity;
    if (qtyDiff !== 0) {
      const inv = await db.getAsync(
        'SELECT id FROM inventory WHERE manufacturer = ? AND model_name = ?',
        [old.manufacturer, old.model_name]
      );
      if (inv) {
        await db.runAsync(
          'UPDATE inventory SET current_stock = current_stock - ?, total_outbound = total_outbound + ?, updated_at = ? WHERE id = ?',
          [qtyDiff, qtyDiff, n, inv.id]
        );
      }
    }

    const updated = await db.getAsync('SELECT * FROM outbound WHERE id = ?', [req.params.id]);
    await writeAuditLog('outbound', req.params.id, 'update', old, updated, req.user.id);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/outbound/:id  ── admin만
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const db  = getDB();
    const row = await db.getAsync(
      'SELECT * FROM outbound WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '출고 내역을 찾을 수 없습니다.' });

    await db.runAsync(
      'UPDATE outbound SET is_deleted = 1, deleted_at = ? WHERE id = ?',
      [nowStr(), req.params.id]
    );
    await moveToTrash('outbound', req.params.id, req.user.id);
    await writeAuditLog('outbound', req.params.id, 'delete', row, null, req.user.id);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
