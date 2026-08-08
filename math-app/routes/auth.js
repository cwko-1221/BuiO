'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const config = require('../../config');
const users = require('../repositories/users.repo');
const academicYears = require('../repositories/academic-years.repo');
const stats = require('../repositories/stats.repo');
const { withTransaction } = require('../db/database');
const { ALL_TAGS } = require('../engine/questionGenerator');
const { requireTeacher } = require('../middleware/auth');
const {
  normalizeStudentId, isValidStudentId,
  normalizeClassNo, isValidClassNo,
  isSupportedLanguage,
} = require('../validators');

const ADMIN_PASSWORD = '999999';

function adminPasswordMatches(value) {
  const received = Buffer.from(String(value || ''));
  const expected = Buffer.from(ADMIN_PASSWORD);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function requireAdminUnlocked(req, res, next) {
  if (!req.session?.adminUnlocked) {
    return res.status(403).json({ success: false, message: '請先輸入 Admin 密碼' });
  }
  next();
}

// ----------------------------------------------------------------
// POST /login
// ----------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { studentId, password } = req.body;
    if (!studentId || !password) {
      return res.status(400).json({ success: false, message: '請輸入學號和密碼' });
    }
    const id = normalizeStudentId(studentId);
    const user = await users.findById(id);
    if (!user) {
      return res.status(401).json({ success: false, message: '學號不存在' });
    }
    if (!bcrypt.compareSync(password, user.passwordhash)) {
      return res.status(401).json({ success: false, message: '密碼錯誤' });
    }
    req.session.studentId = user.studentid;
    req.session.studentName = user.name;
    req.session.role = user.role || 'student';
    req.session.adminUnlocked = false;

    res.json({
      success: true,
      message: '登入成功',
      student: {
        id: user.studentid,
        name: user.name,
        role: req.session.role,
        className: user.classname || '',
        classNo: user.classno || null,
        language: user.language || 'zh-HK',
      },
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /logout
// ----------------------------------------------------------------
router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ success: true, message: '已登出' });
});

router.get('/admin-status', requireTeacher, (req, res) => {
  res.json({ success: true, unlocked: Boolean(req.session.adminUnlocked) });
});

router.post('/unlock-admin', requireTeacher, (req, res) => {
  if (!adminPasswordMatches(req.body?.password)) {
    req.session.adminUnlocked = false;
    return res.status(401).json({ success: false, message: 'Admin 密碼不正確' });
  }
  req.session.adminUnlocked = true;
  res.json({ success: true, message: 'Admin 已解鎖' });
});

// ----------------------------------------------------------------
// GET /me
// ----------------------------------------------------------------
router.get('/me', async (req, res, next) => {
  // Optional dev mock — only if explicitly enabled (MOCK_AUTH=1 + non-prod)
  if (config.mockAuth && !req.session.studentId) {
    req.session.studentId = 'S001';
    req.session.studentName = '測試學生';
    req.session.role = 'student';
  }
  if (!req.session.studentId) {
    return res.status(401).json({ success: false, message: '未登入' });
  }
  try {
    const u = await users.findByIdSummary(req.session.studentId);
    if (u) {
      req.session.studentName = u.name;
      req.session.role = u.role || 'student';
    }
    res.json({
      success: true,
      student: {
        id: req.session.studentId,
        name: u?.name || req.session.studentName,
        role: u?.role || req.session.role || 'student',
        className: u?.classname || '',
        classNo: u?.classno || null,
        language: u?.language || 'zh-HK',
      },
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// PUT /language
// ----------------------------------------------------------------
router.put('/language', async (req, res, next) => {
  if (!req.session.studentId) {
    return res.status(401).json({ success: false, message: '未登入' });
  }
  const { language } = req.body;
  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ success: false, message: '不支援的語言' });
  }
  try {
    await users.updateLanguage(req.session.studentId, language);
    res.json({ success: true, message: '語言設定已更新', language });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /register-student   (teachers only)
// ----------------------------------------------------------------
router.post('/register-student', requireTeacher, async (req, res, next) => {
  try {
    const { studentId, name, password, role, className, classNo, chineseGroup, englishGroup, mathGroup } = req.body;
    if (!studentId || !name || !password) {
      return res.status(400).json({ success: false, message: '請填寫完整資訊 (學號/教師編號、姓名、密碼)' });
    }
    const id = normalizeStudentId(studentId);
    if (!isValidStudentId(id)) {
      return res.status(400).json({ success: false, message: '學號格式不正確' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: '密碼最少需要 6 個字元' });
    }
    const classNoNum = normalizeClassNo(classNo);
    if (!isValidClassNo(classNoNum)) {
      return res.status(400).json({ success: false, message: '班號必須是 1 至 99 的整數' });
    }
    if (await users.exists(id)) {
      return res.status(400).json({ success: false, message: '此帳號已經存在' });
    }
    const targetRole = role === 'teacher' ? 'teacher' : 'student';
    if (targetRole === 'teacher' && !req.session.adminUnlocked) {
      return res.status(403).json({ success: false, message: '請先輸入 Admin 密碼' });
    }
    const passwordHash = bcrypt.hashSync(password, 10);

    await users.insert({
      studentId: id, name, passwordHash, role: targetRole,
      className: className || '', classNo: classNoNum,
      chineseGroup: chineseGroup || '',
      englishGroup: englishGroup || '',
      mathGroup: mathGroup || '',
    });
    if (targetRole === 'student') {
      await academicYears.upsertCurrentStudent({
        studentId: id, name, className: className || '', classNo: classNoNum,
        chineseGroup: chineseGroup || '', englishGroup: englishGroup || '', mathGroup: mathGroup || '',
      });
      await stats.ensureTagsForStudent(id, ALL_TAGS);
    }
    res.json({ success: true, message: '帳號建立成功' });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /register-students-batch
// ----------------------------------------------------------------
router.post('/register-students-batch', requireTeacher, async (req, res, next) => {
  try {
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: '請提供學生資料' });
    }
    if (students.length > 200) {
      return res.status(400).json({ success: false, message: '每次最多匯入 200 名學生' });
    }

    const valid = [];
    const skipped = [];
    const seen = new Set();

    students.forEach((row = {}, index) => {
      const rowNumber = Number(row.rowNumber) || index + 2;
      const id = normalizeStudentId(row.studentId);
      const name = String(row.name || '').trim();
      const password = String(row.password || '').trim();
      const passwordProvided = Boolean(row.passwordProvided || password);
      const classNo = normalizeClassNo(row.classNo);

      if (!id || !name) return skipped.push({ rowNumber, studentId: id, reason: '缺少學號或姓名' });
      if (!isValidStudentId(id)) return skipped.push({ rowNumber, studentId: id, reason: '學號格式不正確' });
      if (passwordProvided && password.length < 6) return skipped.push({ rowNumber, studentId: id, reason: '密碼最少需要 6 個字元' });
      if (!isValidClassNo(classNo)) return skipped.push({ rowNumber, studentId: id, reason: '班號必須是 1 至 99 的整數' });
      if (seen.has(id)) return skipped.push({ rowNumber, studentId: id, reason: 'Excel 內有重複學號' });

      seen.add(id);
      valid.push({
        rowNumber, studentId: id, name, password, passwordProvided,
        className: String(row.className || '').trim(),
        classNo,
        chineseGroup: String(row.chineseGroup || '').trim(),
        englishGroup: String(row.englishGroup || '').trim(),
        mathGroup: String(row.mathGroup || '').trim(),
      });
    });

    const toCreate = [];
    const toUpdate = [];
    for (const s of valid) {
      const existing = await users.findById(s.studentId);
      if (!existing) toCreate.push(s);
      else if ((existing.role || 'student') === 'teacher') {
        skipped.push({ rowNumber: s.rowNumber, studentId: s.studentId, reason: '學號屬於教師帳戶' });
      } else toUpdate.push(s);
    }

    if (toCreate.length > 0 || toUpdate.length > 0) {
      await withTransaction(async client => {
        for (const s of toCreate) {
          const passwordHash = await bcrypt.hash(s.password || '123456', 10);
          await users.insert({ ...s, passwordHash, role: 'student' }, { client });
          await academicYears.upsertCurrentStudent({ ...s }, { client });
          await stats.ensureTagsForStudent(s.studentId, ALL_TAGS, { client });
        }
        for (const s of toUpdate) {
          const passwordHash = s.passwordProvided ? await bcrypt.hash(s.password, 10) : null;
          await users.updateStudentProfile({ ...s, passwordHash }, { client });
          await academicYears.upsertCurrentStudent({ ...s }, { client });
        }
      });
    }

    res.json({
      success: true,
      message: `成功新增 ${toCreate.length} 名學生，更新 ${toUpdate.length} 名學生`,
      created: toCreate.map(s => ({ studentId: s.studentId, name: s.name })),
      updated: toUpdate.map(s => ({ studentId: s.studentId, name: s.name })),
      skipped,
    });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// DELETE /delete-student/:studentId
// ----------------------------------------------------------------
router.delete('/delete-student/:studentId', requireTeacher, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ success: false, message: '無效的學生 ID' });
    }
    if (req.session.studentId === studentId) {
      return res.status(403).json({ success: false, message: '無法刪除自己目前登入的帳號' });
    }
    if (!await users.exists(studentId)) {
      return res.status(404).json({ success: false, message: '找不到該帳號' });
    }
    const target = await users.findById(studentId);
    if ((target?.role || '').toLowerCase() === 'teacher' && !req.session.adminUnlocked) {
      return res.status(403).json({ success: false, message: '請先輸入 Admin 密碼' });
    }
    await users.deleteById(studentId);
    res.json({ success: true, message: '帳號已成功刪除' });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /update-student
// ----------------------------------------------------------------
router.post('/update-student', requireTeacher, async (req, res, next) => {
  try {
    const { studentId, field, value } = req.body;
    if (!studentId || !field) {
      return res.status(400).json({ success: false, message: '參數不完整' });
    }
    if (!users.ALLOWED_UPDATE_FIELDS[field]) {
      return res.status(400).json({ success: false, message: '不允許更新此欄位' });
    }
    let normalized = value || '';
    if (field === 'classNo') {
      normalized = normalizeClassNo(value);
      if (!isValidClassNo(normalized)) {
        return res.status(400).json({ success: false, message: '班號必須是 1 至 99 的整數' });
      }
    }
    await users.updateField(studentId, field, normalized);
    res.json({ success: true, message: '更新成功' });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------------
// POST /upgrade-students
// ----------------------------------------------------------------
router.post('/upgrade-students', requireTeacher, requireAdminUnlocked, async (req, res, next) => {
  try {
    const result = await users.upgradeAllStudents();
    res.json({
      success: true,
      message: `所有學生已升級；現時學年為 ${result.currentAcademicYear}`,
      ...result,
    });
  } catch (e) { next(e); }
});

module.exports = router;
