'use strict';

const express = require('express');
const router = express.Router();

const users = require('../repositories/users.repo');
const stats = require('../repositories/stats.repo');
const logs = require('../repositories/logs.repo');
const { ALL_TAGS, TAG_INFO } = require('../engine/questionGenerator');
const { tagsForClass, tierForTag, TIER_ORDER } = require('../engine/classTags');
const { requireAuth, requireTeacher } = require('../middleware/auth');

router.use(requireAuth);

function targetStudent(req) {
  if (req.session.role === 'teacher' && req.query.studentId) return req.query.studentId;
  return req.session.studentId;
}

// Students may only view their own analytics after completing today's
// random practice. Teachers always pass (they're viewing someone else).
async function requireDailyRandomForStudent(req, res) {
  if (req.session.role === 'teacher') return true;
  const uid = req.session.studentId;
  const u = await users.findByIdSummary(uid);
  const tags = tagsForClass(u?.classname || '');
  const t = await logs.todayOverview(uid, tags);
  const n = Number(t.todayquestions) || 0;
  if (n < 10) {
    res.status(403).json({
      success: false, gated: true,
      message: `請先完成今天的隨機練習（${n}/10）。`,
    });
    return false;
  }
  return true;
}

// Restrict a student's dashboard to the tags in their grade's curriculum.
// Falls back to ALL_TAGS for unknown classes / staff / graduated.
async function tagsForStudentId(studentId) {
  const u = await users.findByIdSummary(studentId);
  return tagsForClass(u?.classname || '');
}

function suggestionFor(rate) {
  if (rate < 30) return '需要大量練習，建議從基礎概念重新學習';
  if (rate < 50) return '需要加強練習，注意計算步驟';
  if (rate < 70) return '接近達標，再多練習幾次即可掌握';
  return '表現良好，繼續保持';
}

function enrichTag(row) {
  return {
    tag: row.tag,
    totalAttempted: Number(row.totalattempted) || 0,
    totalCorrect: Number(row.totalcorrect) || 0,
    accuracyRate: Number(row.accuracyrate) || 0,
    tagName: TAG_INFO[row.tag]?.name || row.tag,
    category: TAG_INFO[row.tag]?.category || '未知',
    tier: tierForTag(row.tag),
  };
}

// ----------------------------------------------------------------
// GET /overview
// ----------------------------------------------------------------
router.get('/overview', async (req, res, next) => {
  try {
    if (!(await requireDailyRandomForStudent(req, res))) return;
    const studentId = targetStudent(req);
    const tags = await tagsForStudentId(studentId);
    const ov = await stats.overview(studentId, tags);
    const td = await logs.todayOverview(studentId, tags);
    const totalQuestions = parseInt(ov.totalquestions) || 0;
    res.json({
      success: true,
      overview: {
        totalQuestions,
        totalCorrect: parseInt(ov.totalcorrect) || 0,
        overallAccuracy: parseFloat(ov.overallaccuracy) || 0,
        totalSessions: Math.floor(totalQuestions / 10),
        today: {
          questions: parseInt(td.todayquestions) || 0,
          correct: parseInt(td.todaycorrect) || 0,
          accuracy: parseFloat(td.todayaccuracy) || 0,
          avgTime: parseFloat(td.avgtime) || 0,
        },
      },
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /tags
// ----------------------------------------------------------------
router.get('/tiers', async (req, res, next) => {
  try { res.json({ success: true, tiers: TIER_ORDER }); }
  catch (e) { next(e); }
});

router.get('/tags', async (req, res, next) => {
  try {
    if (!(await requireDailyRandomForStudent(req, res))) return;
    const studentId = targetStudent(req);
    const tags = await tagsForStudentId(studentId);
    const rows = await stats.tagBreakdown(studentId, tags);
    const byTag = new Map(rows.map(r => [r.tag, r]));
    const enriched = tags.map(tag => enrichTag(byTag.get(tag) || { tag }));
    res.json({ success: true, stats: enriched });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /history
// ----------------------------------------------------------------
router.get('/history', async (req, res, next) => {
  try {
    if (!(await requireDailyRandomForStudent(req, res))) return;
    const studentId = targetStudent(req);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const tag = req.query.tag || null;
    const tags = await tagsForStudentId(studentId);

    const [rows, total] = await Promise.all([
      logs.history(studentId, tags, { limit, offset, tag }),
      logs.historyCount(studentId, tags, { tag }),
    ]);

    res.json({
      success: true,
      total,
      limit,
      offset,
      history: rows.map(l => ({
        logId: l.logid,
        tag: l.tag,
        questionText: l.questiontext,
        correctAnswer: l.correctanswer,
        userAnswer: l.useranswer,
        isCorrect: l.iscorrect === 1 || l.iscorrect === true,
        timeTaken: parseFloat(l.timetaken) || 0,
        timestamp: l.timestamp,
      })),
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /weaknesses
// ----------------------------------------------------------------
router.get('/weaknesses', async (req, res, next) => {
  try {
    if (!(await requireDailyRandomForStudent(req, res))) return;
    const studentId = targetStudent(req);
    const tags = await tagsForStudentId(studentId);
    const rows = await stats.weaknesses(studentId, tags);
    const enriched = rows.map(r => ({
      ...enrichTag(r),
      suggestion: suggestionFor(Number(r.accuracyrate) || 0),
    }));
    res.json({ success: true, weaknesses: enriched, count: enriched.length });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /time-analysis
// ----------------------------------------------------------------
router.get('/time-analysis', async (req, res, next) => {
  try {
    if (!(await requireDailyRandomForStudent(req, res))) return;
    const studentId = targetStudent(req);
    const tags = await tagsForStudentId(studentId);
    const rows = await logs.timeAnalysis(studentId, tags);
    res.json({
      success: true,
      timeAnalysis: rows.map(t => ({
        tag: t.tag,
        count: parseInt(t.count) || 0,
        avgTime: parseFloat(t.avgtime) || 0,
        minTime: parseFloat(t.mintime) || 0,
        maxTime: parseFloat(t.maxtime) || 0,
        tagName: TAG_INFO[t.tag]?.name || t.tag,
        category: TAG_INFO[t.tag]?.category || '未知',
      })),
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /teacher/students  (teachers only)
// ----------------------------------------------------------------
router.get('/teacher/students', requireTeacher, async (req, res, next) => {
  try {
    const rows = await users.listForTeacher(ALL_TAGS, { includeTeachers: false });
    res.json({ success: true, students: rows });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /teacher/all-users  (teachers only)
// ----------------------------------------------------------------
router.get('/teacher/all-users', requireTeacher, async (req, res, next) => {
  try {
    const rows = await users.listForTeacher(ALL_TAGS, { includeTeachers: true });
    res.json({ success: true, students: rows });
  } catch (e) { next(e); }
});

module.exports = router;
