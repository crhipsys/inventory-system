'use strict';

const jwt = require('jsonwebtoken');

function authMiddleware(requiredRole = 'viewer') {
  const roleLevel = { pending: 0, viewer: 1, editor: 2, admin: 3 };

  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;

      if ((roleLevel[payload.role] ?? -1) < (roleLevel[requiredRole] ?? 0)) {
        return res.status(403).json({ error: '권한이 부족합니다.' });
      }
      next();
    } catch {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
  };
}

module.exports = authMiddleware;
