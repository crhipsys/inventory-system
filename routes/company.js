'use strict';

const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { getDB, nowStr } = require('../db/database');
const auth    = require('../middleware/auth');
const { writeAuditLog } = require('../middleware/audit');

// multer 설정 — uploads/ 폴더에 저장
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `business_license${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter(req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('jpg/png/pdf 파일만 업로드 가능합니다.'));
  },
});

// GET /api/company
router.get('/', auth('viewer'), async (req, res) => {
  try {
    const db   = getDB();
    const info = await db.getAsync(
      `SELECT c.*, u.name AS updated_by_name
       FROM company_info c
       LEFT JOIN users u ON c.updated_by = u.id
       WHERE c.id = 'main'`
    );
    res.json(info || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/company  (multipart/form-data)
router.put('/', auth('admin'), upload.single('business_license_file'), async (req, res) => {
  try {
    const db  = getDB();
    const old = await db.getAsync('SELECT * FROM company_info WHERE id = ?', ['main']);

    const {
      company_name, representative, business_number,
      address, phone, fax, email,
      bank_name, account_number, account_holder, notes,
    } = req.body;

    const phoneDigits = (phone || '').replace(/\D/g, '') || null;
    const faxDigits   = (fax   || '').replace(/\D/g, '') || null;
    const bizDigits   = (business_number || '').replace(/\D/g, '') || null;
    const accDigits   = (account_number  || '').replace(/\D/g, '') || null;

    // 파일 업로드된 경우 경로 저장, 아니면 기존 유지
    const imageFile = req.file ? `/uploads/${req.file.filename}` : (old?.business_license_image || null);

    const now = nowStr();

    if (old) {
      await db.runAsync(
        `UPDATE company_info SET
          company_name=?, representative=?, business_number=?,
          business_license_image=?, address=?, phone=?, fax=?, email=?,
          bank_name=?, account_number=?, account_holder=?, notes=?,
          updated_at=?, updated_by=?
         WHERE id='main'`,
        [
          company_name?.trim() || null, representative?.trim() || null, bizDigits,
          imageFile, address?.trim() || null, phoneDigits, faxDigits, email?.trim() || null,
          bank_name?.trim() || null, accDigits, account_holder?.trim() || null, notes?.trim() || null,
          now, req.user.id,
        ]
      );
    } else {
      await db.runAsync(
        `INSERT INTO company_info
          (id, company_name, representative, business_number,
           business_license_image, address, phone, fax, email,
           bank_name, account_number, account_holder, notes, updated_at, updated_by)
         VALUES ('main',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          company_name?.trim() || null, representative?.trim() || null, bizDigits,
          imageFile, address?.trim() || null, phoneDigits, faxDigits, email?.trim() || null,
          bank_name?.trim() || null, accDigits, account_holder?.trim() || null, notes?.trim() || null,
          now, req.user.id,
        ]
      );
    }

    const updated = await db.getAsync('SELECT * FROM company_info WHERE id = ?', ['main']);
    await writeAuditLog('company_info', 'main', old ? 'update' : 'create', old, updated, req.user.id);
    res.json(updated);
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: '파일 크기는 10MB 이하여야 합니다.' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
