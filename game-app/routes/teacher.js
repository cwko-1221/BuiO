'use strict';

const express = require('express');
const router = express.Router();

const { requireTeacher } = require('../../math-app/middleware/auth');
const sets = require('../repositories/questionSets.repo');
const demoSet = require('../lib/demoSet');

router.use(requireTeacher);

function teacherId(req) { return req.session.studentId; }
function handle(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[game]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

// Validate & normalise the questions payload from the set editor.
function parseQuestions(body) {
  const raw = Array.isArray(body?.questions) ? body.questions : [];
  const questions = raw.map(q => {
    const question = String(q?.question || '').trim();
    const choices = (Array.isArray(q?.choices) ? q.choices : [])
      .map(c => String(c || '').trim())
      .filter(Boolean);
    const correctIndex = Number(q?.correctIndex);
    return { question, choices, correctIndex };
  }).filter(q => q.question);

  for (const q of questions) {
    if (q.choices.length < 2 || q.choices.length > 4) {
      const err = new Error(`「${q.question.slice(0, 20)}」需要 2-4 個選項。`);
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.choices.length) {
      const err = new Error(`「${q.question.slice(0, 20)}」未設定正確答案。`);
      err.statusCode = 400;
      throw err;
    }
  }
  if (!questions.length) {
    const err = new Error('至少需要一條題目。');
    err.statusCode = 400;
    throw err;
  }
  return questions;
}

// List sets (demo set is always present, DB sets only in postgres mode)
router.get('/sets', async (req, res) => {
  try {
    const demo = { id: demoSet.id, title: demoSet.title, questionCount: demoSet.questions.length, builtin: true };
    if (!sets.pgAvailable()) {
      return res.json({ success: true, sets: [demo], dbAvailable: false });
    }
    const rows = await sets.listSets(teacherId(req));
    res.json({ success: true, sets: [demo, ...rows], dbAvailable: true });
  } catch (e) { handle(res, e); }
});

router.get('/sets/:setId', async (req, res) => {
  try {
    if (req.params.setId === demoSet.id) {
      return res.json({ success: true, set: demoSet });
    }
    const set = await sets.getSetWithQuestions(req.params.setId);
    if (!set || set.createdBy !== teacherId(req)) {
      return res.status(404).json({ success: false, message: '題庫不存在。' });
    }
    res.json({ success: true, set });
  } catch (e) { handle(res, e); }
});

router.post('/sets', async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: '缺少題庫名稱。' });
    const questions = parseQuestions(req.body);
    const setId = await sets.createSet({ teacherId: teacherId(req), title, questions });
    res.status(201).json({ success: true, setId });
  } catch (e) { handle(res, e); }
});

router.put('/sets/:setId', async (req, res) => {
  try {
    if (req.params.setId === demoSet.id) {
      return res.status(400).json({ success: false, message: '示範題庫無法修改。' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: '缺少題庫名稱。' });
    const questions = parseQuestions(req.body);
    await sets.replaceSetQuestions({ setId: req.params.setId, teacherId: teacherId(req), title, questions });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

router.delete('/sets/:setId', async (req, res) => {
  try {
    if (req.params.setId === demoSet.id) {
      return res.status(400).json({ success: false, message: '示範題庫無法刪除。' });
    }
    const ok = await sets.deleteSet(req.params.setId, teacherId(req));
    if (!ok) return res.status(404).json({ success: false, message: '題庫不存在。' });
    res.json({ success: true });
  } catch (e) { handle(res, e); }
});

module.exports = router;
