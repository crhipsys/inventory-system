'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDB, nowStr } = require('../db/database');
const auth   = require('../middleware/auth');
const { writeAuditLog } = require('../middleware/audit');

// ── POST /api/auth/login ─────────────────────────────────────
// 관리자: ADMIN_ID(hiprime)으로 로그인
// 일반 사용자: 전화번호로 로그인
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: '아이디/전화번호와 비밀번호를 입력하세요.' });

    const db      = getDB();
    const adminId = process.env.ADMIN_ID || 'hiprime';
    let user;

    if (identifier === adminId) {
      // 관리자 로그인 (이름으로 조회)
      user = await db.getAsync(
        'SELECT * FROM users WHERE name = ? AND is_deleted = 0',
        [adminId]
      );
    } else {
      // 일반 사용자 (전화번호로 조회, 숫자만 비교)
      const digits = identifier.replace(/\D/g, '');
      user = await db.getAsync(
        'SELECT * FROM users WHERE replace(phone, \'-\', \'\') = ? AND is_deleted = 0',
        [digits]
      );
    }

    if (!user)
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    if (user.role === 'pending')
      return res.status(403).json({ error: '관리자 승인 대기 중입니다.\n관리자에게 문의하세요.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });

    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /api/auth/register ──────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password)
      return res.status(400).json({ error: '이름, 전화번호, 비밀번호를 모두 입력하세요.' });

    // 전화번호 숫자만 추출 후 유효성 검사
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11)
      return res.status(400).json({ error: '올바른 전화번호를 입력하세요.' });

    const db = getDB();

    // 전화번호 중복 체크
    const exists = await db.getAsync(
      'SELECT id FROM users WHERE replace(phone, \'-\', \'\') = ? AND is_deleted = 0',
      [digits]
    );
    if (exists)
      return res.status(409).json({ error: '이미 가입된 전화번호입니다.' });

    const hash = await bcrypt.hash(password, 12);
    const id   = uuidv4();

    await db.runAsync(
      `INSERT INTO users (id, name, phone, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [id, name.trim(), digits, hash, nowStr()]
    );

    await writeAuditLog('users', id, 'create', null, { name, phone: digits, role: 'pending' }, null);

    res.status(201).json({ message: '가입 신청이 완료되었습니다.\n관리자 승인 후 이용 가능합니다.' });
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────────
router.get('/me', auth('viewer'), (req, res) => {
  res.json({ user: req.user });
});

// ── GET /api/auth/users ──────────────────────────────────────
// 전체 사용자 목록 (관리자만)
router.get('/users', auth('admin'), async (req, res) => {
  try {
    const db    = getDB();
    const users = await db.allAsync(
      `SELECT id, name, phone, role, created_at
       FROM users
       WHERE is_deleted = 0
       ORDER BY
         CASE role WHEN 'pending' THEN 0 ELSE 1 END,
         created_at DESC`
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── PATCH /api/auth/users/:id/role ──────────────────────────
// 권한 변경 (관리자만)
router.patch('/users/:id/role', auth('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    const allowed  = ['viewer', 'editor', 'admin'];
    if (!allowed.includes(role))
      return res.status(400).json({ error: '유효하지 않은 권한입니다.' });

    const db      = getDB();
    const target  = await db.getAsync(
      'SELECT * FROM users WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );
    if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

    // 관리자 자신의 권한은 변경 불가
    if (target.id === req.user.id)
      return res.status(400).json({ error: '자신의 권한은 변경할 수 없습니다.' });

    const oldRole = target.role;
    await db.runAsync(
      'UPDATE users SET role = ? WHERE id = ? AND is_deleted = 0',
      [role, req.params.id]
    );

    // 권한 변경 감사 로그
    await writeAuditLog(
      'users', req.params.id, 'update',
      { role: oldRole },
      { role },
      req.user.id
    );

    res.json({ message: `권한이 '${role}'(으)로 변경되었습니다.` });
  } catch (err) {
    console.error('[auth/role]', err);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── DELETE /api/auth/users/:id ───────────────────────────────
// 사용자 삭제 (관리자만)
router.delete('/users/:id', auth('admin'), async (req, res) => {
  try {
    const db     = getDB();
    const target = await db.getAsync(
      'SELECT * FROM users WHERE id = ? AND is_deleted = 0',
      [req.params.id]
    );
    if (!target) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (target.role === 'admin')
      return res.status(400).json({ error: '관리자 계정은 삭제할 수 없습니다.' });

    await db.runAsync(
      'UPDATE users SET is_deleted = 1, deleted_at = ? WHERE id = ?',
      [nowStr(), req.params.id]
    );
    await writeAuditLog('users', req.params.id, 'delete', target, null, req.user.id);
    res.json({ message: '사용자가 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

module.exports = router;
