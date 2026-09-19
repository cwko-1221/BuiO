'use strict';

const express = require('express');
const router = express.Router();

const logs = require('../repositories/logs.repo');
const stats = require('../repositories/stats.repo');
const { withTransaction } = require('../db/database');
const { generateAdaptiveQuiz, DEFAULT_QUIZ_SIZE } = require('../engine/adaptiveEngine');
const { generateQuestion, TAG_INFO } = require('../engine/questionGenerator');
const { scopeForStudent } = require('../engine/studentScope');
const { requireAuth } = require('../middleware/auth');

// A "random" (adaptive) practice session is 6 questions; if the student's
// today log count is >= this, they've finished at least one random session
// today and the tag-picker / dashboard are unlocked.
const DAILY_RANDOM_THRESHOLD = DEFAULT_QUIZ_SIZE;

function isFractionQuestion(question) {
  return Boolean(question && question.tag && question.tag.startsWith('frac_'));
}

function fractionAnswerFormat(question) {
  if (!isFractionQuestion(question)) return null;
  const type = question.answerType || 'fraction';
  const numerator = question.answerNumerator ?? question.correctAnswer;
  const denominator = question.answerDenominator ?? question.denominator;
  const fields = type === 'mixed'
    ? [
        { name: 'whole', maxLength: String(Math.abs(question.answerWhole || 0)).length },
        { name: 'numerator', maxLength: String(Math.abs(numerator)).length },
        { name: 'denominator', maxLength: String(Math.abs(denominator)).length },
      ]
    : [
        { name: 'numerator', maxLength: String(Math.abs(numerator)).length },
        { name: 'denominator', maxLength: String(Math.abs(denominator)).length },
      ];
  return { type, fields };
}

function gradeAnswer(question, rawUserAnswer, rawUserDenominator, rawUserNumerator, rawUserWhole) {
  if (isFractionQuestion(question)) {
    const numerator = parseInt(rawUserNumerator ?? rawUserAnswer, 10);
    const denominator = parseInt(rawUserDenominator, 10);
    const answerType = question.answerType || 'fraction';
    const whole = answerType === 'mixed' ? parseInt(rawUserWhole, 10) : 0;
    const expectedNumerator = question.answerNumerator ?? question.correctAnswer;
    const expectedDenominator = question.answerDenominator ?? question.denominator;
    const expectedWhole = question.answerWhole || 0;
    const valid = Number.isInteger(numerator)
      && Number.isInteger(denominator)
      && denominator > 0
      && numerator >= 0
      && (answerType !== 'mixed' || numerator < denominator)
      && (answerType !== 'mixed' || (Number.isInteger(whole) && whole >= 0));
    const isCorrect = valid
      && numerator === expectedNumerator
      && denominator === expectedDenominator
      && (answerType !== 'mixed' || whole === expectedWhole);
    const userValue = valid ? whole + numerator / denominator : null;
    const correctValue = expectedWhole + expectedNumerator / expectedDenominator;
    const userDisplay = valid
      ? (answerType === 'mixed' ? `${whole}又${numerator}/${denominator}` : `${numerator}/${denominator}`)
      : '';
    const correctDisplay = answerType === 'mixed'
      ? `${expectedWhole}又${expectedNumerator}/${expectedDenominator}`
      : `${expectedNumerator}/${expectedDenominator}`;
    return {
      userAnswer: userValue,
      userAnswerDisplay: userDisplay,
      correctAnswerValue: correctValue,
      correctAnswerDisplay: correctDisplay,
      isCorrect,
    };
  }

  const userAnswer = parseFloat(rawUserAnswer);
  return {
    userAnswer,
    userAnswerDisplay: userAnswer,
    correctAnswerValue: question.correctAnswer,
    correctAnswerDisplay: question.correctAnswer,
    isCorrect: userAnswer === question.correctAnswer,
  };
}

async function studentGradeTags(studentId) {
  const scope = await scopeForStudent(studentId);
  return { classname: scope.classname || null, tags: scope.tags };
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
    const rawCount = parseInt(req.query.count, 10);
    const count = Number.isFinite(rawCount) && rawCount > 0
      ? Math.min(rawCount, 20) : DEFAULT_QUIZ_SIZE;
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
      const result = await generateAdaptiveQuiz(studentId, count, { allowedTags });
      full = result.questions;
      res.locals._distribution = result.distribution;
    }

    req.session.currentQuiz = full.map((q, idx) => ({
      index: idx + 1,
      tag: q.tag,
      questionText: q.questionText,
      correctAnswer: q.answer,
      denominator: q.denominator || null,
      answerType: q.answerType || null,
      answerWhole: q.answerWhole ?? null,
      answerNumerator: q.answerNumerator ?? null,
      answerDenominator: q.answerDenominator ?? null,
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
        answerFormat: fractionAnswerFormat(q),
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
      const gradedAnswer = gradeAnswer(
        question,
        ans.userAnswer,
        ans.userDenominator,
        ans.userNumerator,
        ans.userWhole,
      );
      const timeTaken = parseFloat(ans.timeTaken) || 0;
      if (gradedAnswer.isCorrect) correctCount++;
      totalTime += timeTaken;
      graded.push({ question, ...gradedAnswer, timeTaken });
    }

    await withTransaction(async client => {
      await logs.insertMany(graded.map(g => ({
        studentId,
        tag: g.question.tag,
        questionText: g.question.questionText,
        correctAnswer: g.correctAnswerValue,
        userAnswer: g.userAnswer,
        isCorrect: g.isCorrect,
        timeSpent: g.timeTaken,
      })), { client });
      await stats.recordAttempts(studentId, graded.map(g => ({
        tag: g.question.tag,
        isCorrect: g.isCorrect,
      })), { client });
    });

    req.session.currentQuiz = null;

    const results = graded.map(g => ({
      index: g.question.index,
      questionText: g.question.questionText,
      correctAnswer: g.correctAnswerDisplay,
      userAnswer: g.userAnswerDisplay,
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
    const { index, userAnswer, userDenominator, userNumerator, userWhole, timeTaken } = req.body;

    const quiz = req.session.currentQuiz;
    if (!quiz || quiz.length === 0) {
      return res.status(400).json({ success: false, message: '沒有進行中的測驗' });
    }
    const question = quiz.find(q => q.index === index);
    if (!question) {
      return res.status(400).json({ success: false, message: `找不到第 ${index} 題` });
    }
    const gradedAnswer = gradeAnswer(question, userAnswer, userDenominator, userNumerator, userWhole);
    const ts = Math.round(parseFloat(timeTaken)) || 0;

    await logs.insert({
      studentId,
      tag: question.tag,
      questionText: question.questionText,
      correctAnswer: gradedAnswer.correctAnswerValue,
      userAnswer: gradedAnswer.userAnswer,
      isCorrect: gradedAnswer.isCorrect,
      timeSpent: ts,
    });
    await stats.recordAttempt(studentId, question.tag, gradedAnswer.isCorrect);

    req.session.currentQuiz = quiz.filter(q => q.index !== index);

    res.json({
      success: true,
      result: {
        index,
        questionText: question.questionText,
        correctAnswer: gradedAnswer.correctAnswerDisplay,
        userAnswer: gradedAnswer.userAnswerDisplay,
        isCorrect: gradedAnswer.isCorrect,
        timeTaken: ts,
        tag: question.tag,
      },
      remaining: req.session.currentQuiz.length,
    });
  } catch (e) { next(e); }
});

module.exports = router;
