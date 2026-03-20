'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDB, nowStr } = require('../db/database');
const auth  = require('../middleware/auth');
const { writeAuditLog, moveToTrash } = require('../middleware/audit');

// GET /api/returns  ── editor 이상
router.get('/', auth('editor'), async (req, res) => {
  try {
    const db   = getDB();
    const rows = await db.allAsync(
      `SELECT r.*, v.company_name AS vendor_name
       FROM returns r LEFT JOIN vendors v ON r.vendor_id = v.id
       WHERE r.is_deleted = 0
       ORDER BY r.return_date DESC, r.created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/returns/:id
router.get('/:id', auth('editor'), async (req, res) => {
  try {
    const db  = getDB();
    const row = await db.getAsync(
      `SELECT r.*, v.company_name AS vendor_name
       FROM returns r LEFT JOIN vendors v ON r.vendor_id = v.id
       WHERE r.id = ? AND r.is_deleted = 0`, [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '반품 내역을 찾을 수 없습니다.' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/returns
router.post('/', auth('editor'), async (req, res) => {
  try {
    const { return_date, vendor_id, category, manufacturer, model_name, quantity, reason, notes } = req.body;
    if (!manufacturer || !model_name || !quantity || !return_date)
      return res.status(400).json({ error: '필수 항목을 모두 입력하세요.' });

    const db  = getDB();
    const id  = uuidv4();
    const n   = nowStr();

    await db.runAsync(
      `INSERT INTO returns
         (id, return_date, vendor_id, category, manufacturer, model_name,
          quantity, reason, status, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [id, return_date, vendor_id || null, category || null,
       manufacturer, model_name, quantity, reason || 'other', notes || null, n, req.user.id]
    );

    const inv = await db.getAsync(
      'SELECT id FROM inventory WHERE manufacturer = ? AND model_name = ?',
      [manufacturer, model_name]
    );
    if (inv) {
      await db.runAsync(
        'UPDATE inventory SET pending_test = pending_test + ?, updated_at = ? WHERE id = ?',
        [quantity, n, inv.id]
      );
    }

    const created = await db.getAsync('SELECT * FROM returns WHERE id = ?', [id]);
    await writeAuditLog('returns', id, 'create', null, created, req.user.id);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/returns/:id/status
router.patch('/:id/status', auth('editor'), async (req, res) => {
  try {
    const db  = getDB();
    const old = await db.getAsync(
      'SELECT * FROM returns WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!old) return res.status(404).json({ error: '반품 내역을 찾을 수 없습니다.' });

    const { status } = req.body;
    if (!['pending', 'testing', 'normal', 'defective'].includes(status))
      return res.status(400).json({ error: '유효하지 않은 상태입니다.' });

    const n = nowStr();
    await db.runAsync(
      `UPDATE returns
       SET status=?, test_result_date=?, test_result_by=?, updated_at=?, updated_by=?
       WHERE id=?`,
      [status, n, req.user.id, n, req.user.id, req.params.id]
    );

    if ((status === 'normal' || status === 'defective') && old.status !== status) {
      const inv = await db.getAsync(
        'SELECT id FROM inventory WHERE manufacturer = ? AND model_name = ?',
        [old.manufacturer, old.model_name]
      );
      if (inv) {
        if (status === 'normal') {
          await db.runAsync(
            `UPDATE inventory
             SET pending_test = pending_test - ?, normal_returns = normal_returns + ?,
                 current_stock = current_stock + ?, updated_at = ?
             WHERE id = ?`,
            [old.quantity, old.quantity, old.quantity, n, inv.id]
          );
        } else {
          await db.runAsync(
            `UPDATE inventory
             SET pending_test = pending_test - ?, defective_stock = defective_stock + ?,
                 updated_at = ?
             WHERE id = ?`,
            [old.quantity, old.quantity, n, inv.id]
          );
        }
      }
    }

    const updated = await db.getAsync('SELECT * FROM returns WHERE id = ?', [req.params.id]);
    await writeAuditLog('returns', req.params.id, 'update', old, updated, req.user.id);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/returns/:id  ── admin만
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const db  = getDB();
    const row = await db.getAsync(
      'SELECT * FROM returns WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '반품 내역을 찾을 수 없습니다.' });

    await db.runAsync(
      'UPDATE returns SET is_deleted = 1, deleted_at = ? WHERE id = ?',
      [nowStr(), req.params.id]
    );
    await moveToTrash('returns', req.params.id, req.user.id);
    await writeAuditLog('returns', req.params.id, 'delete', row, null, req.user.id);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
