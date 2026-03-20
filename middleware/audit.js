'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDB, nowStr } = require('../db/database');

/**
 * 감사 로그 기록
 */
async function writeAuditLog(tableName, recordId, action, oldData, newData, performedById) {
  const db = getDB();
  try {
    // 수행자 이름 조회
    let performerName = null;
    if (performedById) {
      const u = await db.getAsync('SELECT name FROM users WHERE id = ?', [performedById]);
      performerName = u ? u.name : null;
    }

    await db.runAsync(
      `INSERT INTO audit_log
         (id, table_name, record_id, action, old_data, new_data, performed_at, performed_by, performer_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), tableName, recordId, action,
        oldData  ? JSON.stringify(oldData)  : null,
        newData  ? JSON.stringify(newData)  : null,
        nowStr(), performedById || null, performerName,
      ]
    );
  } catch (err) {
    console.error('[AuditLog] 기록 실패:', err.message);
  }
}

/**
 * 휴지통 이동
 */
async function moveToTrash(tableName, recordId, deletedById) {
  const db = getDB();
  const deletedAt    = nowStr();
  const autoDeleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 19);

  await db.runAsync(
    `INSERT INTO trash (id, table_name, record_id, deleted_at, deleted_by, auto_delete_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [uuidv4(), tableName, recordId, deletedAt, deletedById || null, autoDeleteAt]
  );
}

module.exports = { writeAuditLog, moveToTrash };
