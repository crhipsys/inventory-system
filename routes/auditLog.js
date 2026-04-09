'use strict';

const { getDB } = require('../db/database');
const auth      = require('../middleware/auth');
const router    = require('express').Router();

// ── GET / — 감사로그 목록 ──────────────────────────────
// query: start(YYYY-MM-DD), end(YYYY-MM-DD), q(검색어)
router.get('/', auth('admin'), async (req, res) => {
  try {
    const db = getDB();
    const { start, end, q } = req.query;

    const where  = [];
    const params = [];

    if (start) { where.push("performed_at >= ?"); params.push(start + ' 00:00:00'); }
    if (end)   { where.push("performed_at <= ?"); params.push(end   + ' 23:59:59'); }

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    let rows = await db.allAsync(
      `SELECT * FROM audit_log ${clause} ORDER BY performed_at DESC LIMIT 1000`,
      params
    );

    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(r =>
        (r.performer_name || '').toLowerCase().includes(lq) ||
        (r.table_name     || '').toLowerCase().includes(lq) ||
        (r.action         || '').toLowerCase().includes(lq) ||
        (r.new_data       || '').toLowerCase().includes(lq) ||
        (r.old_data       || '').toLowerCase().includes(lq)
      );
    }

    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
