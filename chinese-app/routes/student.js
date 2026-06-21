'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../math-app/middleware/auth');
const assignments = require('../repositories/assignments.repo');
const attempts = require('../repositories/attempts.repo');

router.use(requireAuth);

function studentId(req) { return req.session.studentId; }
function handle(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[chinese]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

router.get('/assignments', async (req, res) => {
  try { res.json({ success: true, assignments: await assignments.listForStudent(studentId(req)) }); }
  catch (e) { handle(res, e); }
});

router.get('/assignments/:assignmentId', async (req, res) => {
  try {
    if (!await assignments.studentHasAccess({ assignmentId: req.params.assignmentId, studentId: studentId(req) })) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    const a = await assignments.getOne({ assignmentId: req.params.assignmentId });
    if (!a) return res.status(404).json({ success: false, message: '找不到作業' });
    res.json({ success: true, assignment: {
      id: a.id, title: a.title, status: a.status, targetLabel: a.targetLabel, items: a.items,
    } });
  } catch (e) { handle(res, e); }
});

router.post('/attempts/ensure', async (req, res) => {
  try {
    const assignmentId = String(req.body?.assignmentId || '');
    if (!assignmentId) return res.status(400).json({ success: false, message: '缺少 assignmentId' });
    if (!await assignments.studentHasAccess({ assignmentId, studentId: studentId(req) })) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    res.json({ success: true, attempt: await attempts.ensure({ assignmentId, studentId: studentId(req) }) });
  } catch (e) { handle(res, e); }
});

router.post('/attempts/:attemptId/items/:assignmentItemId', async (req, res) => {
  try {
    const ok = await attempts.updateItem({
      attemptId: req.params.attemptId,
      studentId: studentId(req),
      assignmentItemId: req.params.assignmentItemId,
      patch: req.body || {},
    });
    if (!ok) return res.status(404).json({ success: false, message: '找不到項目' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

router.post('/attempts/:attemptId/complete', async (req, res) => {
  try {
    const out = await attempts.complete({ attemptId: req.params.attemptId, studentId: studentId(req) });
    res.json({ success: true, ...out });
  } catch (e) { handle(res, e); }
});

module.exports = router;
