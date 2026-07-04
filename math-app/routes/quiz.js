'use strict';

const express = require('express');
const router = express.Router();

const logs = require('../repositories/logs.repo');
const stats = require('../repositories/stats.repo');
const users = require('../repositories/users.repo');
const { withTransaction } = require('../db/database');
const { generateAdaptiveQuiz } = require('../engine/adaptiveEngine');
const { generateQuestion, TAG_INFO } = require('../engine/questionGenerator');
const { tagsForClass } = require('../engine/classTags');
const { requireAuth } = require('../middleware/auth');

// A "random" (adaptive) practice session is 10 questions; if the student's
// today log count is >= this, they've finished at least one random session
// today and the tag-picker / dashboard are unlocked.
const DAILY_RANDOM_THRESHOLD = 10;

async function studentGradeTags(studentId) {
  const u = await users.findByIdSummary(studentId);
  return { classname: u?.classname || null, tags: tagsForClass(u?.classname || '') };
}

async function todayRandomDone(studentId, tags) {
  const t = await logs.todayOverview(studentId, tags);
  const n = Number(t.todayquestions) || 0;
  return { done: n >= DAILY_RANDOM_THRESHOLD, todayCount: n, need: DAILY_RANDOM_THRESHOLD };
}

router.use(requireAuth);

// ----------------------------------------------------------------
// GET /questions  — adaptive quiz
// ----------------------------------------------------------------
// GET /today-status  — used by the math hub to unlock/lock advanced options.
router.get('/today-status', async (req, res, next) => {
  try {
    const { tags } = await studentGradeTags(req.session.studentId);
    const status = await todayRandomDone(req.session.studentId, tags);
    res.json({ success: true, ...status });
  } catch (e) { next(e); }
});

// GET /grade-tags  — hub uses this to render the tag picker.
router.get('/grade-tags', async (req, res, next) => {
  try {
    const { tags } = await studentGradeTags(req.session.studentId);
    res.json({
      success: true,
      tags: tags.map(t => ({
        tag: t,
        tagName: TAG_INFO[t]?.name || t,
        category: TAG_INFO[t]?.category || '',
      })),
    });
  } catch (e) { next(e); }
});

router.get('/questions', async (req, res, next) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const studentId = req.session.studentId;
    const { classname, tags: allowedTags } = await studentGradeTags(studentId);
    const requestedTag = req.query.tag ? String(req.query.tag) : null;

    let full;
    if (requestedTag) {
      // Tag-specific practice — gated by "random must be done today".
      if (!allowedTags.includes(requestedTag)) {
        return res.status(403).json({ success: false, message: '此題型不在你的年級範圍。' });
      }
      const status = await todayRandomDone(studentId, allowedTags);
      if (!status.done) {
        return res.status(403).json({
          success: false,
          message: `請先完成今天的隨機練習（${status.todayCount}/${status.need}）。`,
          gated: true,
        });
      }
      full = Array.from({ length: count }, () => generateQuestion(requestedTag));
    } else {
      // Random / adaptive practice.
      const result = await generateAdaptiveQuiz(studentId, count, { classname });
      full = result.questions;
      res.locals._distribution = result.distribution;
    }

    req.session.currentQuiz = full.map((q, idx) => ({
      index: idx + 1,
      tag: q.tag,
      questionText: q.questionText,
      correctAnswer: q.answer,
    }));

    res.json({
      success: true,
      mode: requestedTag ? 'tag' : 'random',
      requestedTag,
      count: full.length,
      questions: full.map((q, idx) => ({
        index: idx + 1,
        tag: q.tag,
        category: q.category,
        tagName: q.tagName,
        questionText: q.questionText,
        symbol: q.symbol,
      })),
      distribution: res.locals._distribution || null,
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /submit  — batch grade + persist
// ----------------------------------------------------------------
router.post('/submit', async (req, res, next) => {
  try {
    const studentId = req.session.studentId;
    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: '請提供答案陣列' });
    }
    const quiz = req.session.currentQuiz;
    if (!quiz || quiz.length === 0) {
      return res.status(400).json({ success: false, message: '沒有進行中的測驗，請先取得題目' });
    }

    const graded = [];
    let correctCount = 0;
    let totalTime = 0;

    for (const ans of answers) {
      const question = quiz.find(q => q.index === ans.index);
      if (!question) continue;
      const userAnswer = parseFloat(ans.userAnswer);
      const isCorrect = userAnswer === question.correctAnswer;
      const timeTaken = parseFloat(ans.timeTaken) || 0;
      if (isCorrect) correctCount++;
      totalTime += timeTaken;
      graded.push({ question, userAnswer, isCorrect, timeTaken });
    }

    await withTransaction(async client => {
      for (const g of graded) {
        await logs.insert({
          studentId,
          tag: g.question.tag,
          questionText: g.question.questionText,
          correctAnswer: g.question.correctAnswer,
          userAnswer: g.userAnswer,
          isCorrect: g.isCorrect,
          timeSpent: g.timeTaken,
        }, { client });
        await stats.recordAttempt(studentId, g.question.tag, g.isCorrect, { client });
      }
    });

    req.session.currentQuiz = null;

    const results = graded.map(g => ({
      index: g.question.index,
      questionText: g.question.questionText,
      correctAnswer: g.question.correctAnswer,
      userAnswer: g.userAnswer,
      isCorrect: g.isCorrect,
      timeTaken: g.timeTaken,
      tag: g.question.tag,
    }));

    res.json({
      success: true,
      message: '答案已提交',
      summary: {
        totalQuestions: results.length,
        correctCount,
        incorrectCount: results.length - correctCount,
        accuracyRate: results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0,
        totalTime: Math.round(totalTime * 10) / 10,
        avgTime: results.length > 0 ? Math.round((totalTime / results.length) * 10) / 10 : 0,
      },
      results,
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /answer  — single-question submit
// ----------------------------------------------------------------
router.post('/answer', async (req, res, next) => {
  try {
    const studentId = req.session.studentId;
    const { index, userAnswer, timeTaken } = req.body;

    const quiz = req.session.currentQuiz;
    if (!quiz || quiz.length === 0) {
      return res.status(400).json({ success: false, message: '沒有進行中的測驗' });
    }
    const question = quiz.find(q => q.index === index);
    if (!question) {
      return res.status(400).json({ success: false, message: `找不到第 ${index} 題` });
    }
    const parsed = parseFloat(userAnswer);
    const isCorrect = parsed === question.correctAnswer;
    const ts = Math.round(parseFloat(timeTaken)) || 0;

    await logs.insert({
      studentId,
      tag: question.tag,
      questionText: question.questionText,
      correctAnswer: question.correctAnswer,
      userAnswer: parsed,
      isCorrect,
      timeSpent: ts,
    });
    await stats.recordAttempt(studentId, question.tag, isCorrect);

    req.session.currentQuiz = quiz.filter(q => q.index !== index);

    res.json({
      success: true,
      result: {
        index,
        questionText: question.questionText,
        correctAnswer: question.correctAnswer,
        userAnswer: parsed,
        isCorrect,
        timeTaken: ts,
        tag: question.tag,
      },
      remaining: req.session.currentQuiz.length,
    });
  } catch (e) { next(e); }
});

module.exports = router;
