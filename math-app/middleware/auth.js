'use strict';

function requireAuth(req, res, next) {
  if (!req.session || !req.session.studentId) {
    return res.status(401).json({ success: false, message: '請先登入' });
  }
  next();
}

function requireTeacher(req, res, next) {
  if (!req.session || req.session.role !== 'teacher') {
    return res.status(403).json({ success: false, message: '權限不足，僅限教師存取' });
  }
  next();
}

module.exports = { requireAuth, requireTeacher };
