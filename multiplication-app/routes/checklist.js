'use strict';

const express = require('express');
const router = express.Router();
const checklist = require('../repositories/multiplication.repo');
const { requireTeacher } = require('../../math-app/middleware/auth');

router.use(requireTeacher);

router.get('/', async (req, res, next) => {
  try {
    const [overview, recent] = await Promise.all([
      checklist.listOverview(req.query.group || ''),
      checklist.listRecent(req.query.group || ''),
    ]);
    res.json({ success: true, ...overview, recent });
  } catch (error) {
    next(error);
  }
});

router.post('/attempts', async (req, res, next) => {
  try {
    const studentId = String(req.body?.studentId || '').trim();
    const tableNumber = Number(req.body?.tableNumber);
    const result = req.body?.result;
    if (!studentId || !['success', 'failure'].includes(result)) {
      return res.status(400).json({ success: false, message: '請提供學生及成功／失敗結果' });
    }
    const attempt = await checklist.recordAttempt({
      studentId,
      tableNumber,
      isSuccess: result === 'success',
      teacherId: req.session.studentId,
    });
    res.status(201).json({ success: true, attempt });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
