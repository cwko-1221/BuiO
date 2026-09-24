'use strict';

const express = require('express');
const router = express.Router();

const users = require('../repositories/users.repo');
const academicYears = require('../repositories/academic-years.repo');
const stats = require('../repositories/stats.repo');
const logs = require('../repositories/logs.repo');
const { ALL_TAGS, TAG_INFO } = require('../engine/questionGenerator');
const { DEFAULT_QUIZ_SIZE } = require('../engine/adaptiveEngine');
const {
  tierForTag,
  TIER_ORDER,
  TIER_IDS,
  tiersForClass,
  tagsForClass,
  QUESTION_TYPE_IDS,
  QUESTION_TYPE_FILTER_ORDER,
  questionTypesForClass,
  filterTagsForScope,
  normalizeClassname,
} = require('../engine/classTags');
const { scopeForStudent } = require('../engine/studentScope');
const tierPolicy = require('../repositories/tier-policy.repo');
const questionTypePolicy = require('../repositories/question-type-policy.repo');
const topicPolicy = require('../repositories/topic-policy.repo');
const { requireAuth, requireTeacher } = require('../middleware/auth');

router.use(requireAuth);

function targetStudent(req) {
  if (req.session.role === 'teacher' && req.query.studentId) return req.query.studentId;
  return req.session.studentId;
}

// Restrict a student's dashboard to topics they can actually receive under the
// curriculum, tier and individual-topic rules for their class or maths group.
// Falls back to ALL_TAGS for unknown classes / staff / graduated.
async function tagsForStudentId(studentId) {
  const { tags } = await scopeForStudent(studentId);
  return tags;
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
        totalSessions: Math.floor(totalQuestions / DEFAULT_QUIZ_SIZE),
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
    const currentAcademicYear = await academicYears.getCurrentAcademicYear();
    const rows = await users.listForTeacher(ALL_TAGS, { includeTeachers: false });
    res.json({ success: true, students: rows, currentAcademicYear });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// GET /teacher/all-users  (teachers only)
// ----------------------------------------------------------------
router.get('/teacher/all-users', requireTeacher, async (req, res, next) => {
  try {
    const [currentAcademicYear, years] = await Promise.all([
      academicYears.getCurrentAcademicYear(),
      academicYears.listAcademicYears(),
    ]);
    const requestedYear = String(req.query.academicYear || currentAcademicYear);
    if (!/^20\d{2}-\d{2}$/.test(requestedYear) || !years.includes(requestedYear)) {
      return res.status(400).json({ success: false, message: '學年不正確' });
    }
    const rows = await users.listForTeacher(ALL_TAGS, { includeTeachers: true, academicYear: requestedYear });
    res.json({
      success: true,
      students: rows,
      academicYear: requestedYear,
      academicYears: years,
      currentAcademicYear,
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// Tier policy  (teachers only)
// ----------------------------------------------------------------
// Which 銅/銀/金/鑽 tiers a class — or one math group inside it — may receive.
// The rows are the six grades plus every math group actually in use, so a
// teacher picks "P4 · B組" off a list instead of inventing a key.
function policyRows(students, policy) {
  const groupsByGrade = new Map();
  const counts = new Map();
  for (const s of students) {
    const grade = normalizeClassname(s.className);
    if (!grade) continue;
    const group = String(s.mathGroup || '').trim();
    if (!groupsByGrade.has(grade)) groupsByGrade.set(grade, new Set());
    if (group) groupsByGrade.get(grade).add(group);
    const bump = key => counts.set(key, (counts.get(key) || 0) + 1);
    bump(tierPolicy.policyKey(grade, ''));
    if (group) bump(tierPolicy.policyKey(grade, group));
  }

  const rows = [];
  for (const grade of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
    const tiers = tiersForClass(grade);
    const groups = [...(groupsByGrade.get(grade) || [])].sort();
    for (const group of ['', ...groups]) {
      const key = tierPolicy.policyKey(grade, group);
      rows.push({
        className: grade,
        mathGroup: group,
        label: group ? grade + ' · ' + group : grade + '（全級）',
        isGradeWide: !group,
        tiers,
        configured: Object.prototype.hasOwnProperty.call(policy, key),
        disabled: tierPolicy.resolve(policy, grade, group),
        studentCount: counts.get(key) || 0,
      });
    }
  }
  return rows;
}

function questionTypePolicyRows(students, policy) {
  const groupsByGrade = new Map();
  const counts = new Map();
  for (const s of students) {
    const grade = normalizeClassname(s.className);
    if (!grade) continue;
    const group = String(s.mathGroup || '').trim();
    if (!groupsByGrade.has(grade)) groupsByGrade.set(grade, new Set());
    if (group) groupsByGrade.get(grade).add(group);
    const bump = key => counts.set(key, (counts.get(key) || 0) + 1);
    bump(questionTypePolicy.policyKey(grade, ''));
    if (group) bump(questionTypePolicy.policyKey(grade, group));
  }

  const rows = [];
  for (const grade of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
    const questionTypes = questionTypesForClass(grade);
    const groups = [...(groupsByGrade.get(grade) || [])].sort();
    for (const group of ['', ...groups]) {
      const key = questionTypePolicy.policyKey(grade, group);
      rows.push({
        className: grade,
        mathGroup: group,
        label: group ? grade + ' · ' + group : grade + '（全級）',
        isGradeWide: !group,
        questionTypes,
        configured: Object.prototype.hasOwnProperty.call(policy, key),
        disabled: questionTypePolicy.resolve(policy, grade, group),
        studentCount: counts.get(key) || 0,
      });
    }
  }
  return rows;
}

async function respondWithPolicy(res, policy) {
  const students = await users.listForTeacher(ALL_TAGS, { includeTeachers: false });
  res.json({ success: true, tiers: TIER_ORDER, rows: policyRows(students, policy) });
}

router.get('/teacher/tier-policy', requireTeacher, async (req, res, next) => {
  try {
    await respondWithPolicy(res, await tierPolicy.getPolicy());
  } catch (e) { next(e); }
});

router.put('/teacher/tier-policy', requireTeacher, async (req, res, next) => {
  try {
    const className = normalizeClassname(req.body?.className);
    if (!className) {
      return res.status(400).json({ success: false, message: '班級不正確，只支援 P1 至 P6。' });
    }
    const mathGroup = String(req.body?.mathGroup || '').trim().slice(0, 20);
    const raw = req.body?.disabledTiers;

    // null clears the rule, so the group follows its grade again.
    if (raw !== null) {
      if (!Array.isArray(raw)) {
        return res.status(400).json({ success: false, message: '請提供要停用的級別。' });
      }
      const unknown = raw.filter(id => !TIER_IDS.includes(id));
      if (unknown.length) {
        return res.status(400).json({ success: false, message: '未知的題目級別：' + unknown.join('、') });
      }
      const off = new Set(raw);
      if (tiersForClass(className).every(t => off.has(t.id))) {
        return res.status(400).json({
          success: false,
          message: '至少要保留一個級別，否則學生沒有題目可以做。',
        });
      }
    }

    const [currentTierPolicy, typePolicy, exactTopicPolicy] = await Promise.all([
      tierPolicy.getPolicy(),
      questionTypePolicy.getPolicy(),
      topicPolicy.getPolicy(),
    ]);
    const candidateTierPolicy = { ...currentTierPolicy };
    const tierKey = tierPolicy.policyKey(className, mathGroup);
    if (raw === null) delete candidateTierPolicy[tierKey];
    else candidateTierPolicy[tierKey] = raw;
    const candidateDisabledTiers = tierPolicy.resolve(candidateTierPolicy, className, mathGroup);
    const exactRule = topicPolicy.resolveRule(exactTopicPolicy, className, mathGroup);
    const candidateTags = tagsForClass(className)
      .filter(tag => !candidateDisabledTiers.includes(tierForTag(tag)));
    const enabledTags = exactRule.configured
      ? candidateTags.filter(tag => !exactRule.disabledTags.includes(tag))
      : filterTagsForScope(
        className,
        candidateDisabledTiers,
        questionTypePolicy.resolve(typePolicy, className, mathGroup),
      );
    if (!enabledTags.length) {
      return res.status(400).json({
        success: false,
        message: '目前的題型設定會令學生沒有可用課題，請先保留至少一個課題。',
      });
    }

    const policy = await tierPolicy.setRule(className, mathGroup, raw === null ? null : raw);
    await respondWithPolicy(res, policy);
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// Question type policy (teachers only)
// ----------------------------------------------------------------
async function respondWithQuestionTypePolicy(res, policy) {
  const students = await users.listForTeacher(ALL_TAGS, { includeTeachers: false });
  res.json({
    success: true,
    questionTypes: QUESTION_TYPE_FILTER_ORDER,
    rows: questionTypePolicyRows(students, policy),
  });
}

router.get('/teacher/question-type-policy', requireTeacher, async (req, res, next) => {
  try {
    await respondWithQuestionTypePolicy(res, await questionTypePolicy.getPolicy());
  } catch (e) { next(e); }
});

router.put('/teacher/question-type-policy', requireTeacher, async (req, res, next) => {
  try {
    const className = normalizeClassname(req.body?.className);
    if (!className) {
      return res.status(400).json({ success: false, message: '班級不正確，只支援 P1 至 P6。' });
    }
    const mathGroup = String(req.body?.mathGroup || '').trim().slice(0, 20);
    const raw = req.body?.disabledQuestionTypes;

    // null clears the rule, so the group follows its grade again.
    if (raw !== null) {
      if (!Array.isArray(raw)) {
        return res.status(400).json({ success: false, message: '請提供要停用的題目類型。' });
      }
      const unknown = raw.filter(id => !QUESTION_TYPE_IDS.includes(id));
      if (unknown.length) {
        return res.status(400).json({ success: false, message: '未知的題目類型：' + unknown.join('、') });
      }

      const availableTypeIds = new Set(questionTypesForClass(className).map(type => type.id));
      const unavailable = raw.filter(id => id.includes(':') && !availableTypeIds.has(id));
      if (unavailable.length) {
        return res.status(400).json({
          success: false,
          message: `${className} 沒有以下運算組合：` + unavailable.join('、'),
        });
      }

      const typeSet = new Set(raw);
      if (questionTypesForClass(className).every(type => typeSet.has(type.id))) {
        return res.status(400).json({
          success: false,
          message: '至少要保留一種題目類型，否則學生沒有題目可以做。',
        });
      }

      const tiers = await tierPolicy.getPolicy();
      const disabledTiers = tierPolicy.resolve(tiers, className, mathGroup);
      if (!filterTagsForScope(className, disabledTiers, raw).length) {
        return res.status(400).json({
          success: false,
          message: '目前的題目級別設定會令學生沒有可用題目，請先保留至少一個級別。',
        });
      }
    }

    const policy = await questionTypePolicy.setRule(
      className,
      mathGroup,
      raw === null ? null : raw,
    );
    await respondWithQuestionTypePolicy(res, policy);
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// Topic policy (teachers only)
// ----------------------------------------------------------------
// The teacher chooses a grade/group first. We then show only the cumulative
// curriculum topics whose tiers are enabled for that exact scope.
async function buildTopicPolicyView(className, mathGroup) {
  const [students, tierRules, legacyTypeRules, topicRules] = await Promise.all([
    users.listForTeacher(ALL_TAGS, { includeTeachers: false }),
    tierPolicy.getPolicy(),
    questionTypePolicy.getPolicy(),
    topicPolicy.getPolicy(),
  ]);
  const grade = normalizeClassname(className);
  const group = String(mathGroup || '').trim();
  const disabledTiers = tierPolicy.resolve(tierRules, grade, group);
  const disabledQuestionTypes = questionTypePolicy.resolve(legacyTypeRules, grade, group);
  const legacyAllowed = new Set(filterTagsForScope(grade, [], disabledQuestionTypes));
  const rule = topicPolicy.resolveRule(topicRules, grade, group);
  const availableTags = tagsForClass(grade)
    .filter(tag => !disabledTiers.includes(tierForTag(tag)));
  const topics = availableTags.map(tag => ({
    tag,
    name: TAG_INFO[tag]?.name || tag,
    category: TAG_INFO[tag]?.category || '',
    tier: tierForTag(tag),
    enabled: rule.configured
      ? !rule.disabledTags.includes(tag)
      : legacyAllowed.has(tag),
  }));
  // Match the student-scope safety fallback if a stale rule disables every
  // currently available tag (for example after a curriculum change).
  if (topics.length && !topics.some(topic => topic.enabled)) {
    topics.forEach(topic => { topic.enabled = true; });
  }
  const groups = [...new Set(students
    .filter(student => normalizeClassname(student.className) === grade)
    .map(student => String(student.mathGroup || '').trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  return {
    success: true,
    className: grade,
    mathGroup: group,
    groups,
    enabledTiers: tiersForClass(grade).filter(tier => !disabledTiers.includes(tier.id)),
    configured: rule.configured,
    inherited: Boolean(group) && !rule.groupConfigured && rule.configured,
    groupConfigured: rule.groupConfigured,
    legacyDefaults: !rule.configured && legacyAllowed.size < tagsForClass(grade).length,
    topics,
  };
}

router.get('/teacher/topic-policy', requireTeacher, async (req, res, next) => {
  try {
    const className = normalizeClassname(req.query.className || 'P1');
    if (!className) {
      return res.status(400).json({ success: false, message: '班級不正確，只支援 P1 至 P6。' });
    }
    const mathGroup = String(req.query.mathGroup || '').trim().slice(0, 20);
    res.json(await buildTopicPolicyView(className, mathGroup));
  } catch (e) { next(e); }
});

router.put('/teacher/topic-policy', requireTeacher, async (req, res, next) => {
  try {
    const className = normalizeClassname(req.body?.className);
    if (!className) {
      return res.status(400).json({ success: false, message: '班級不正確，只支援 P1 至 P6。' });
    }
    const mathGroup = String(req.body?.mathGroup || '').trim().slice(0, 20);
    const raw = req.body?.disabledTags;

    if (raw === null) {
      await topicPolicy.setRule(className, mathGroup, null);
      return res.json(await buildTopicPolicyView(className, mathGroup));
    }
    if (!Array.isArray(raw)) {
      return res.status(400).json({ success: false, message: '請提供要停用的課題。' });
    }
    const allGradeTags = new Set(tagsForClass(className));
    const unknown = raw.filter(tag => typeof tag !== 'string' || !allGradeTags.has(tag));
    if (unknown.length) {
      return res.status(400).json({ success: false, message: '包含此年級沒有的課題，請重新載入。' });
    }

    const [tierRules, legacyTypeRules, topicRules] = await Promise.all([
      tierPolicy.getPolicy(),
      questionTypePolicy.getPolicy(),
      topicPolicy.getPolicy(),
    ]);
    const disabledTiers = tierPolicy.resolve(tierRules, className, mathGroup);
    const activeTags = new Set(tagsForClass(className)
      .filter(tag => !disabledTiers.includes(tierForTag(tag))));
    const unavailable = raw.filter(tag => !activeTags.has(tag));
    if (unavailable.length) {
      return res.status(400).json({ success: false, message: '設定已更新，請重新載入可出的課題。' });
    }
    const selectedOff = new Set(raw);
    if (![...activeTags].some(tag => !selectedOff.has(tag))) {
      return res.status(400).json({
        success: false,
        message: '至少要保留一個課題，否則學生沒有題目可以做。',
      });
    }

    // Preserve disabled topics outside the current tier view. On first save,
    // translate the old category-level rules into topic defaults so migrating
    // the UI does not silently re-enable previously disabled question types.
    const existingRule = topicPolicy.resolveRule(topicRules, className, mathGroup);
    let previousDisabled;
    if (existingRule.configured) {
      previousDisabled = existingRule.disabledTags;
    } else {
      const oldDisabledTypes = questionTypePolicy.resolve(legacyTypeRules, className, mathGroup);
      const oldAllowed = new Set(filterTagsForScope(className, [], oldDisabledTypes));
      previousDisabled = tagsForClass(className).filter(tag => !oldAllowed.has(tag));
    }
    const mergedDisabled = [...new Set([
      ...previousDisabled.filter(tag => !activeTags.has(tag)),
      ...raw,
    ])];

    await topicPolicy.setRule(className, mathGroup, mergedDisabled);
    res.json(await buildTopicPolicyView(className, mathGroup));
  } catch (e) { next(e); }
});

module.exports = router;
