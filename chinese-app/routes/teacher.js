'use strict';

const express = require('express');
const router = express.Router();

const multer = require('multer');
const { requireTeacher } = require('../../math-app/middleware/auth');
const { getJyutping } = require('to-jyutping');
const assignments = require('../repositories/assignments.repo');
const attempts = require('../repositories/attempts.repo');
const bank = require('../repositories/questionBank.repo');
const storage = require('../lib/storage');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function autoJyutping(text) {
  try { return String(getJyutping(text) || '').replace(/\s+/g, ' ').trim(); }
  catch { return ''; }
}

router.use(requireTeacher);

function teacherId(req) { return req.session.studentId; }
function handle(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[chinese]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

// Upload image for an assignment item — returns the public URL the teacher
// stores on the item before submitting the assignment.
router.post('/upload-image', upload.single('file'), async (req, res) => {
  try {
    if (!storage.isStorageConfigured()) {
      return res.status(501).json({ success: false, message: 'Supabase Storage 尚未設定。' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: '缺少 file' });
    if (!String(req.file.mimetype || '').startsWith('image/')) {
      return res.status(400).json({ success: false, message: '只接受圖片檔' });
    }
    const out = await storage.uploadItemImage({
      teacherId: teacherId(req),
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    res.json({ success: true, ...out });
  } catch (e) { handle(res, e); }
});

// ------------------ Question bank ------------------
router.get('/bank/categories', async (req, res) => {
  try { res.json({ success: true, categories: await bank.listCategories() }); }
  catch (e) { handle(res, e); }
});

router.post('/assignments/from-bank', async (req, res) => {
  try {
    const { targetClassname, targetGroup, title, status, category, count } = req.body || {};
    if (!targetClassname || !targetGroup || !title || !category) {
      return res.status(400).json({ success: false, message: '缺少 targetClassname / targetGroup / title / category' });
    }
    const n = Math.min(5, Math.max(1, Number(count) || 5));
    const picked = await bank.randomItems(category, n);
    if (picked.length < n) {
      return res.status(400).json({ success: false, message: `題庫「${category}」少於 ${n} 題` });
    }
    const items = picked.map((p, i) => ({
      traditionalText: p.traditionalText,
      jyutping: autoJyutping(p.traditionalText),
      englishMeaning: p.englishMeaning,
      imageUrl: bank.emojiToImageUrl(p.emoji),
      orderIndex: i + 1,
    }));
    const created = await assignments.create({
      teacherId: teacherId(req),
      targetClassname: String(targetClassname).trim(),
      targetGroup: String(targetGroup).trim(),
      title: String(title).trim(),
      status: status === 'draft' ? 'draft' : 'published',
      items,
    });
    res.status(201).json({ success: true, assignment: created, items });
  } catch (e) { handle(res, e); }
});

// Dropdown source: every (classname, chinesegroup) that has students.
router.get('/groups', async (req, res) => {
  try { res.json({ success: true, groups: await assignments.listGroupSummary() }); }
  catch (e) { handle(res, e); }
});

// ------------------ Assignments ------------------
router.get('/assignments', async (req, res) => {
  try { res.json({ success: true, assignments: await assignments.listForTeacher(teacherId(req)) }); }
  catch (e) { handle(res, e); }
});

router.get('/assignments/:assignmentId', async (req, res) => {
  try {
    if (!await assignments.teacherOwns({ assignmentId: req.params.assignmentId, teacherId: teacherId(req) })) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    res.json({ success: true, assignment: await assignments.getOne({ assignmentId: req.params.assignmentId }) });
  } catch (e) { handle(res, e); }
});

router.post('/assignments', async (req, res) => {
  try {
    const { targetClassname, targetGroup, title, status, items } = req.body || {};
    if (!targetClassname || !targetGroup || !title) {
      return res.status(400).json({ success: false, message: '缺少 targetClassname / targetGroup / title' });
    }
    if (!Array.isArray(items) || items.length !== 5) {
      return res.status(400).json({ success: false, message: '必須提供 5 個練習項目' });
    }
    const normalized = items.map((it, i) => {
      const text = String(it.traditionalText || '').trim();
      const explicit = String(it.jyutping || '').trim();
      return {
        traditionalText: text,
        jyutping: explicit || autoJyutping(text),
        englishMeaning: String(it.englishMeaning || '').trim(),
        imageUrl: it.imageUrl ? String(it.imageUrl) : null,
        orderIndex: i + 1,
      };
    });
    if (normalized.some(it => !it.traditionalText || !it.englishMeaning)) {
      return res.status(400).json({ success: false, message: '每個項目都需要中文與英文翻譯' });
    }
    const created = await assignments.create({
      teacherId: teacherId(req),
      targetClassname: String(targetClassname).trim(),
      targetGroup: String(targetGroup).trim(),
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
    if (!await assignments.teacherOwns({ assignmentId: req.params.assignmentId, teacherId: teacherId(req) })) {
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
