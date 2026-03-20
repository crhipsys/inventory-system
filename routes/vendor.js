'use strict';

const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDB, nowStr } = require('../db/database');
const auth  = require('../middleware/auth');
const { writeAuditLog, moveToTrash } = require('../middleware/audit');

// ── GET /api/vendors ── editor 이상
router.get('/', auth('editor'), async (req, res) => {
  try {
    const rows = await getDB().allAsync(
      `SELECT v.*,
         u1.name AS created_by_name,
         u2.name AS updated_by_name
       FROM vendors v
       LEFT JOIN users u1 ON v.created_by  = u1.id
       LEFT JOIN users u2 ON v.updated_by  = u2.id
       WHERE v.is_deleted = 0
       ORDER BY v.company_name`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/vendors/:id
router.get('/:id', auth('editor'), async (req, res) => {
  try {
    const row = await getDB().getAsync(
      `SELECT v.*,
         u1.name AS created_by_name,
         u2.name AS updated_by_name
       FROM vendors v
       LEFT JOIN users u1 ON v.created_by = u1.id
       LEFT JOIN users u2 ON v.updated_by = u2.id
       WHERE v.id = ? AND v.is_deleted = 0`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });
    res.json(row);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /api/vendors
router.post('/', auth('editor'), async (req, res) => {
  try {
    const {
      company_name, business_number, phone,
      registered_address, delivery_address, same_address,
      notes, remarks,
    } = req.body;

    if (!company_name?.trim())
      return res.status(400).json({ error: '상호명은 필수입니다.' });

    const bizDigits   = (business_number || '').replace(/\D/g, '');
    const phoneDigits = (phone || '').replace(/\D/g, '');

    if (bizDigits && bizDigits.length !== 10)
      return res.status(400).json({ error: '사업자번호는 숫자 10자리여야 합니다.' });
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11))
      return res.status(400).json({ error: '전화번호는 숫자 10~11자리여야 합니다.' });

    const db  = getDB();
    const id  = uuidv4();
    const n   = nowStr();
    const del = same_address ? (registered_address || null) : (delivery_address || null);

    await db.runAsync(
      `INSERT INTO vendors
         (id, company_name, business_number, phone,
          registered_address, delivery_address, same_address,
          notes, remarks, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, company_name.trim(),
       bizDigits   || null,
       phoneDigits || null,
       registered_address?.trim() || null,
       del?.trim() || null,
       same_address ? 1 : 0,
       notes?.trim()   || null,
       remarks?.trim() || null,
       n, req.user.id]
    );

    const created = await db.getAsync('SELECT * FROM vendors WHERE id = ?', [id]);
    await writeAuditLog('vendors', id, 'create', null, created, req.user.id);
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUT /api/vendors/:id
router.put('/:id', auth('editor'), async (req, res) => {
  try {
    const db  = getDB();
    const old = await db.getAsync(
      'SELECT * FROM vendors WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!old) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });

    const {
      company_name, business_number, phone,
      registered_address, delivery_address, same_address,
      notes, remarks,
    } = req.body;

    if (company_name !== undefined && !company_name?.trim())
      return res.status(400).json({ error: '상호명은 필수입니다.' });

    const bizDigits   = business_number !== undefined
      ? (business_number || '').replace(/\D/g, '') : null;
    const phoneDigits = phone !== undefined
      ? (phone || '').replace(/\D/g, '') : null;

    if (bizDigits !== null && bizDigits && bizDigits.length !== 10)
      return res.status(400).json({ error: '사업자번호는 숫자 10자리여야 합니다.' });
    if (phoneDigits !== null && phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11))
      return res.status(400).json({ error: '전화번호는 숫자 10~11자리여야 합니다.' });

    const n       = nowStr();
    const newSame = same_address !== undefined ? (same_address ? 1 : 0) : old.same_address;
    const newReg  = registered_address !== undefined ? registered_address?.trim() || null : old.registered_address;
    const newDel  = newSame
      ? newReg
      : (delivery_address !== undefined ? delivery_address?.trim() || null : old.delivery_address);

    await db.runAsync(
      `UPDATE vendors
       SET company_name=?, business_number=?, phone=?,
           registered_address=?, delivery_address=?, same_address=?,
           notes=?, remarks=?, updated_at=?, updated_by=?
       WHERE id=?`,
      [
        company_name !== undefined ? company_name.trim() : old.company_name,
        bizDigits   !== null ? (bizDigits   || null) : old.business_number,
        phoneDigits !== null ? (phoneDigits || null) : old.phone,
        newReg, newDel, newSame,
        notes   !== undefined ? (notes?.trim()   || null) : old.notes,
        remarks !== undefined ? (remarks?.trim() || null) : old.remarks,
        n, req.user.id, req.params.id,
      ]
    );

    const updated = await db.getAsync('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    await writeAuditLog('vendors', req.params.id, 'update', old, updated, req.user.id);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE /api/vendors/:id  (admin only)
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const db  = getDB();
    const row = await db.getAsync(
      'SELECT * FROM vendors WHERE id = ? AND is_deleted = 0', [req.params.id]
    );
    if (!row) return res.status(404).json({ error: '거래처를 찾을 수 없습니다.' });

    await db.runAsync(
      'UPDATE vendors SET is_deleted = 1, deleted_at = ? WHERE id = ?',
      [nowStr(), req.params.id]
    );
    await moveToTrash('vendors', req.params.id, req.user.id);
    await writeAuditLog('vendors', req.params.id, 'delete', row, null, req.user.id);
    res.json({ message: '거래처가 삭제되었습니다.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
