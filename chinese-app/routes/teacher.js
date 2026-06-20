'use strict';

const express = require('express');
const router = express.Router();

const { requireTeacher } = require('../../math-app/middleware/auth');
const classes = require('../repositories/classes.repo');
const assignments = require('../repositories/assignments.repo');
const attempts = require('../repositories/attempts.repo');
const { getPool } = require('../../math-app/db/database');
const config = require('../../config');

router.use(requireTeacher);

function teacherId(req) { return req.session.studentId; }
function handle(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[chinese]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

// ------------------ Classes ------------------
router.get('/classes', async (req, res) => {
  try { res.json({ success: true, classes: await classes.listForTeacher(teacherId(req)) }); }
  catch (e) { handle(res, e); }
});

router.post('/classes', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: '請輸入班級名稱' });
    const c = await classes.create({ teacherId: teacherId(req), name });
    res.status(201).json({ success: true, class: c });
  } catch (e) { handle(res, e); }
});

router.delete('/classes/:classId', async (req, res) => {
  try {
    const ok = await classes.remove({ classId: req.params.classId, teacherId: teacherId(req) });
    if (!ok) return res.status(404).json({ success: false, message: '找不到班級' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

router.get('/classes/:classId/students', async (req, res) => {
  try {
    if (!await classes.ownsClass({ classId: req.params.classId, teacherId: teacherId(req) })) {
      return res.status(404).json({ success: false, message: '找不到班級' });
    }
    res.json({ success: true, students: await classes.listStudentsInClass(req.params.classId) });
  } catch (e) { handle(res, e); }
});

router.post('/classes/:classId/students', async (req, res) => {
  try {
    if (!await classes.ownsClass({ classId: req.params.classId, teacherId: teacherId(req) })) {
      return res.status(404).json({ success: false, message: '找不到班級' });
    }
    const ids = Array.isArray(req.body?.studentIds) ? req.body.studentIds.map(String) : [];
    if (!ids.length) return res.status(400).json({ success: false, message: '請提供 studentIds' });
    const out = await classes.addStudents({ classId: req.params.classId, studentIds: ids });
    res.json({ success: true, ...out });
  } catch (e) { handle(res, e); }
});

router.delete('/classes/:classId/students/:studentId', async (req, res) => {
  try {
    if (!await classes.ownsClass({ classId: req.params.classId, teacherId: teacherId(req) })) {
      return res.status(404).json({ success: false, message: '找不到班級' });
    }
    const ok = await classes.removeStudent({ classId: req.params.classId, studentId: req.params.studentId });
    if (!ok) return res.status(404).json({ success: false, message: '學生不在班級內' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

// Browse all BuiO students (so teacher can pick who to add to a class).
router.get('/users', async (req, res) => {
  try {
    if (config.db.mode !== 'postgres') return res.json({ success: true, users: [] });
    const role = req.query.role === 'teacher' ? 'teacher' : 'student';
    const { rows } = await getPool().query(
      `SELECT studentid AS id, name, classname, classno
         FROM users WHERE role = $1
         ORDER BY COALESCE(classname, ''), COALESCE(classno, 999), studentid`,
      [role]
    );
    res.json({ success: true, users: rows.map(r => ({
      id: r.id, name: r.name, className: r.classname || '', classNo: r.classno,
    })) });
  } catch (e) { handle(res, e); }
});

// ------------------ Assignments ------------------
router.get('/assignments', async (req, res) => {
  try { res.json({ success: true, assignments: await assignments.listForTeacher(teacherId(req)) }); }
  catch (e) { handle(res, e); }
});

router.get('/assignments/:assignmentId', async (req, res) => {
  try {
    const a = await assignments.getOne({ assignmentId: req.params.assignmentId });
    if (!a || a.teacherId !== teacherId(req)) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    res.json({ success: true, assignment: a });
  } catch (e) { handle(res, e); }
});

router.post('/assignments', async (req, res) => {
  try {
    const { classId, title, status, items } = req.body || {};
    if (!classId || !title) return res.status(400).json({ success: false, message: '缺少 classId 或 title' });
    if (!Array.isArray(items) || items.length !== 5) {
      return res.status(400).json({ success: false, message: '必須提供 5 個練習項目' });
    }
    const normalized = items.map((it, i) => ({
      traditionalText: String(it.traditionalText || '').trim(),
      jyutping: String(it.jyutping || '').trim(),
      englishMeaning: String(it.englishMeaning || '').trim(),
      orderIndex: i + 1,
    }));
    if (normalized.some(it => !it.traditionalText || !it.englishMeaning)) {
      return res.status(400).json({ success: false, message: '每個項目都需要中文與英文翻譯' });
    }
    const created = await assignments.create({
      teacherId: teacherId(req),
      classId,
      title: String(title).trim(),
      status: status === 'draft' ? 'draft' : 'published',
      items: normalized,
    });
    res.status(201).json({ success: true, assignment: created });
  } catch (e) { handle(res, e); }
});

router.patch('/assignments/:assignmentId', async (req, res) => {
  try {
    const status = req.body?.status === 'draft' ? 'draft' : 'published';
    const ok = await assignments.updateStatus({
      assignmentId: req.params.assignmentId, teacherId: teacherId(req), status,
    });
    if (!ok) return res.status(404).json({ success: false, message: '找不到作業' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

router.delete('/assignments/:assignmentId', async (req, res) => {
  try {
    const ok = await assignments.remove({ assignmentId: req.params.assignmentId, teacherId: teacherId(req) });
    if (!ok) return res.status(404).json({ success: false, message: '找不到作業' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

// ------------------ Attempts ------------------
router.get('/assignments/:assignmentId/attempts', async (req, res) => {
  try {
    const a = await assignments.getOne({ assignmentId: req.params.assignmentId });
    if (!a || a.teacherId !== teacherId(req)) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    res.json({ success: true, attempts: await attempts.listForAssignment({
      assignmentId: req.params.assignmentId, teacherId: teacherId(req),
    }) });
  } catch (e) { handle(res, e); }
});

router.get('/attempts/:attemptId', async (req, res) => {
  try {
    const detail = await attempts.getAttemptDetail({
      attemptId: req.params.attemptId, teacherId: teacherId(req),
    });
    if (!detail) return res.status(404).json({ success: false, message: '找不到嘗試' });
    res.json({ success: true, attempt: detail });
  } catch (e) { handle(res, e); }
});

router.delete('/attempts/:attemptId', async (req, res) => {
  try {
    const ok = await attempts.remove({ attemptId: req.params.attemptId, teacherId: teacherId(req) });
    if (!ok) return res.status(404).json({ success: false, message: '找不到嘗試' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

module.exports = router;
