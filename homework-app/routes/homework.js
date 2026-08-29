'use strict';

const express = require('express');
const router = express.Router();
const repo = require('../repositories/homework.repo');
const academicYearsRepo = require('../../math-app/repositories/academic-years.repo');
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');
const {
  SUBJECTS, STUDENT_STATUSES, TEACHER_STATUSES, subjectById, subjectsForGrade,
  isAcademicYear, isIsoDate, todayHongKong,
} = require('../lib/domain');

router.use(requireAuth);

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const text = (value, max = 100) => String(value || '').trim().slice(0, max);

function pdfHex(value) {
  const bytes = [0xfe, 0xff];
  for (const character of String(value || '')) {
    const code = character.codePointAt(0);
    if (code <= 0xffff) bytes.push(code >> 8, code & 255);
    else {
      const adjusted = code - 0x10000;
      const high = 0xd800 + (adjusted >> 10);
      const low = 0xdc00 + (adjusted & 1023);
      bytes.push(high >> 8, high & 255, low >> 8, low & 255);
    }
  }
  return Buffer.from(bytes).toString('hex').toUpperCase();
}

function buildPdf(lines) {
  const pageLines = [];
  for (let index = 0; index < lines.length; index += 35) pageLines.push(lines.slice(index, index + 35));
  if (!pageLines.length) pageLines.push(['沒有記錄']);
  const objects = new Map();
  const pageIds = pageLines.map((_, index) => 4 + index * 2);
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type0 /BaseFont /MSung-Light /Encoding /UniCNS-UCS2-H /DescendantFonts [999 0 R] >>');
  pageLines.forEach((page, index) => {
    const pageId = pageIds[index];
    const streamId = pageId + 1;
    const commands = ['BT', '/F1 11 Tf', '48 800 Td'];
    for (const line of page) commands.push(`<${pdfHex(line)}> Tj`, '0 -20 Td');
    commands.push('ET');
    const stream = commands.join('\n');
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.set(streamId, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.set(999, '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /MSung-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (CNS1) /Supplement 7 >> >>');
  const maxId = 999;
  const chunks = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'];
  const offsets = Array(maxId + 1).fill(0);
  for (const [id, body] of [...objects.entries()].sort((a, b) => a[0] - b[0])) {
    offsets[id] = Buffer.byteLength(chunks.join(''), 'binary');
    chunks.push(`${id} 0 obj\n${body}\nendobj\n`);
  }
  const xref = Buffer.byteLength(chunks.join(''), 'binary');
  chunks.push(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= maxId; id++) chunks.push(`${String(offsets[id]).padStart(10, '0')} 00000 ${offsets[id] ? 'n' : 'f'} \n`);
  chunks.push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.from(chunks.join(''), 'binary');
}

async function isMonitor(studentId, academicYear, className, subject) {
  const rows = await repo.listMonitors({ studentId, academicYear, className, subject });
  return rows.length > 0;
}

async function requireAssignment(req, res) {
  const { academicYear, className, subject } = req.query;
  if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className || '') || !subjectById(subject)) {
    fail(res, 400, '學年、班別或科目不正確');
    return null;
  }
  if (!subjectsForGrade(className).some(item => item.id === subject)) {
    fail(res, 400, '該年級沒有此科目');
    return null;
  }
  if (req.session.role !== 'teacher' && !(await isMonitor(req.session.studentId, academicYear, className, subject))) {
    fail(res, 403, '你未獲委任為此科科長');
    return null;
  }
  return { academicYear, className, subject };
}

router.get('/meta', async (req, res, next) => {
  try {
    const [currentAcademicYear, academicYears] = await Promise.all([
      academicYearsRepo.getCurrentAcademicYear(),
      academicYearsRepo.listAcademicYears(),
    ]);
    const assignments = req.session.role === 'teacher' ? [] : await repo.listMonitors({
      studentId: req.session.studentId,
      academicYear: currentAcademicYear,
    });
    res.json({
      success: true,
      role: req.session.role,
      canAccess: req.session.role === 'teacher' || assignments.length > 0,
      subjects: SUBJECTS,
      academicYears,
      currentAcademicYear,
      assignments,
    });
  } catch (error) { next(error); }
});

router.get('/students', requireTeacher, async (req, res, next) => {
  try {
    const { academicYear, className, subject } = req.query;
    if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className || '') || !subjectById(subject)) return fail(res, 400, '學年、班別或科目不正確');
    if (!subjectsForGrade(className).some(item => item.id === subject)) return fail(res, 400, '該年級沒有此科目');
    res.json({ success: true, students: await repo.listStudents(academicYear, className, subject) });
  } catch (error) { next(error); }
});

router.get('/monitors', requireTeacher, async (req, res, next) => {
  try { res.json({ success: true, monitors: await repo.listMonitors(req.query) }); }
  catch (error) { next(error); }
});

router.put('/monitors', requireTeacher, async (req, res, next) => {
  try {
    const academicYear = text(req.body.academicYear, 10);
    const className = text(req.body.className, 10);
    const subject = text(req.body.subject, 40);
    const studentIds = [...new Set((Array.isArray(req.body.studentIds) ? req.body.studentIds : []).map(id => text(id, 20)).filter(Boolean))];
    if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className) || !subjectById(subject)) return fail(res, 400, '學年、班別或科目不正確');
    if (!subjectsForGrade(className).some(item => item.id === subject)) return fail(res, 400, '該年級沒有此科目');
    const eligible = await repo.listStudents(academicYear, className, subject);
    const allowed = new Set(eligible.map(student => student.id));
    if (studentIds.some(id => !allowed.has(id))) return fail(res, 400, '科長必須來自所選班別及科目組別');
    const monitors = await repo.replaceMonitors({ academicYear, className, subject, studentIds, createdBy: req.session.studentId });
    res.json({ success: true, message: '科長設定已儲存', monitors });
  } catch (error) { next(error); }
});

router.get('/assignments', async (req, res, next) => {
  try {
    if (req.session.role === 'teacher') return res.json({ success: true, assignments: [] });
    const academicYear = await academicYearsRepo.getCurrentAcademicYear();
    res.json({ success: true, assignments: await repo.listMonitors({ studentId: req.session.studentId, academicYear }) });
  } catch (error) { next(error); }
});

router.get('/roster', async (req, res, next) => {
  try {
    const assignment = await requireAssignment(req, res);
    if (!assignment) return;
    res.json({ success: true, students: await repo.listStudents(assignment.academicYear, assignment.className, assignment.subject) });
  } catch (error) { next(error); }
});

router.get('/records', async (req, res, next) => {
  try {
    const assignment = await requireAssignment(req, res);
    if (!assignment) return;
    const date = req.query.date;
    if (date && !isIsoDate(date)) return fail(res, 400, '日期不正確');
    if (date) return res.json({ success: true, record: await repo.findRecord({ ...assignment, date }) });
    if (req.session.role !== 'teacher') return fail(res, 400, '學生查閱記錄時必須指定日期');
    res.json({ success: true, records: await repo.listRecords({ ...assignment, dateFrom: req.query.dateFrom, dateTo: req.query.dateTo }) });
  } catch (error) { next(error); }
});

router.get('/records-pdf', requireTeacher, async (req, res, next) => {
  try {
    const assignment = await requireAssignment(req, res);
    if (!assignment) return;
    const date = text(req.query.date, 10);
    if (!isIsoDate(date)) return fail(res, 400, '日期不正確');
    const [record, roster] = await Promise.all([repo.findRecord({ ...assignment, date }), repo.listStudents(assignment.academicYear, assignment.className, assignment.subject)]);
    if (!record) return fail(res, 404, '找不到記錄');
    const names = new Map(roster.map(student => [student.id, `${student.name} (${student.id})`]));
    const labels = { complete: '完成', missing: '欠交', absent: 'Absent' };
    const subject = subjectById(assignment.subject);
    const lines = ['杯澳公立學校　欠交功課記錄', `${assignment.academicYear}　${assignment.className}　${subject.name}　${date}`, ''];
    record.homeworks.forEach((homework, index) => {
      lines.push(`${index + 1}. ${homework.title}`);
      const exceptions = homework.statuses.filter(item => item.status !== 'complete');
      if (!exceptions.length) lines.push('　全班完成');
      else exceptions.forEach(item => lines.push(`　${names.get(item.studentId) || item.studentId}：${labels[item.status] || item.status}${item.madeUp ? '（已補做）' : ''}`));
      lines.push('');
    });
    const filename = `homework-${date}-${assignment.className}-${assignment.subject}.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(buildPdf(lines));
  } catch (error) { next(error); }
});

function normalizeHomeworks(homeworks, rosterIds, statuses, { allowMadeUp = false, preservedHomeworks = [] } = {}) {
  if (!Array.isArray(homeworks) || homeworks.length < 1 || homeworks.length > 12) return { error: '請新增 1 至 12 份功課' };
  const allowedStatuses = new Set(statuses);
  const allowedStudents = new Set(rosterIds);
  const preservedMadeUp = new Map();
  for (const homework of preservedHomeworks) for (const row of homework.statuses || []) {
    preservedMadeUp.set(`${homework.id}:${row.studentId}`, Boolean(row.madeUp));
  }
  const normalized = [];
  for (let index = 0; index < homeworks.length; index++) {
    const id = text(homeworks[index]?.id, 50) || `hw-${Date.now()}-${index + 1}`;
    const title = text(homeworks[index]?.title, 150);
    if (!title) return { error: `請填寫第 ${index + 1} 份功課名稱` };
    const incoming = Array.isArray(homeworks[index].statuses) ? homeworks[index].statuses : [];
    const statusMap = new Map();
    for (const row of incoming) {
      const studentId = text(row.studentId, 20);
      const status = text(row.status, 20);
      if (!allowedStudents.has(studentId) || !allowedStatuses.has(status) || statusMap.has(studentId)) return { error: '學生狀態資料不正確' };
      statusMap.set(studentId, status);
    }
    if (statusMap.size !== rosterIds.length) return { error: '請為所有學生選擇狀態' };
    normalized.push({
      id,
      title,
      statuses: rosterIds.map(studentId => {
        const incoming = homeworks[index].statuses.find(row => text(row.studentId, 20) === studentId);
        const madeUp = allowMadeUp
          ? Boolean(incoming?.madeUp)
          : Boolean(preservedMadeUp.get(`${id}:${studentId}`));
        return { studentId, status: statusMap.get(studentId), madeUp };
      }),
    });
  }
  return { homeworks: normalized };
}

router.post('/records', async (req, res, next) => {
  try {
    const assignment = {
      academicYear: text(req.body.academicYear, 10), className: text(req.body.className, 10), subject: text(req.body.subject, 40),
    };
    const date = text(req.body.date, 10);
    if (!isAcademicYear(assignment.academicYear) || !/^P[1-6]$/.test(assignment.className) || !subjectById(assignment.subject) || !isIsoDate(date)) return fail(res, 400, '學年、班別、科目或日期不正確');
    if (!subjectsForGrade(assignment.className).some(item => item.id === assignment.subject)) return fail(res, 400, '該年級沒有此科目');
    const isTeacher = req.session.role === 'teacher';
    if (!isTeacher) {
      if (date !== todayHongKong()) return fail(res, 400, '科長只可填報今天的記錄；過去日期只供查閱');
      if (!(await isMonitor(req.session.studentId, assignment.academicYear, assignment.className, assignment.subject))) return fail(res, 403, '你未獲委任為此科科長');
    }
    if (await repo.findRecord({ ...assignment, date })) return fail(res, 409, '此日期的記錄已建立，請使用修改功能');
    const roster = await repo.listStudents(assignment.academicYear, assignment.className, assignment.subject);
    const result = normalizeHomeworks(
      req.body.homeworks,
      roster.map(student => student.id),
      isTeacher ? TEACHER_STATUSES : STUDENT_STATUSES,
      { allowMadeUp: isTeacher },
    );
    if (result.error) return fail(res, 400, result.error);
    const record = await repo.createRecord({ ...assignment, date, homeworks: result.homeworks, createdBy: req.session.studentId });
    res.status(201).json({ success: true, message: isTeacher ? '老師記錄已新增' : '欠交功課記錄已儲存', record });
  } catch (error) {
    if (error.code === '23505' || error.code === 'RECORD_EXISTS') return fail(res, 409, '此日期的記錄已儲存');
    next(error);
  }
});

router.put('/records', async (req, res, next) => {
  try {
    const assignment = {
      academicYear: text(req.body.academicYear, 10), className: text(req.body.className, 10), subject: text(req.body.subject, 40),
    };
    const date = text(req.body.date, 10);
    if (!isAcademicYear(assignment.academicYear) || !/^P[1-6]$/.test(assignment.className) || !subjectById(assignment.subject) || !isIsoDate(date)) return fail(res, 400, '篩選資料不正確');
    if (!subjectsForGrade(assignment.className).some(item => item.id === assignment.subject)) return fail(res, 400, '該年級沒有此科目');
    const isTeacher = req.session.role === 'teacher';
    if (!isTeacher) {
      if (date !== todayHongKong()) return fail(res, 400, '科長只可修改今天的記錄；過往日期只供查看');
      if (!(await isMonitor(req.session.studentId, assignment.academicYear, assignment.className, assignment.subject))) return fail(res, 403, '你沒有此班別及科目的科長權限');
    }
    const existing = await repo.findRecord({ ...assignment, date });
    if (!existing) return fail(res, 404, '找不到記錄');
    const roster = await repo.listStudents(assignment.academicYear, assignment.className, assignment.subject);
    const result = normalizeHomeworks(
      req.body.homeworks,
      roster.map(student => student.id),
      isTeacher ? TEACHER_STATUSES : STUDENT_STATUSES,
      { allowMadeUp: isTeacher, preservedHomeworks: isTeacher ? [] : existing.homeworks },
    );
    if (result.error) return fail(res, 400, result.error);
    const record = await repo.updateRecord({ ...assignment, date, homeworks: result.homeworks, updatedBy: req.session.studentId });
    res.json({ success: true, message: '記錄已更新', record });
  } catch (error) { next(error); }
});

/**
 * Remove a day's record entirely.
 *
 * Teachers only, and deliberately not offered to monitors: a monitor who filed the wrong thing can
 * correct it through the editor, whereas deleting takes the day's record away from everyone who
 * might still need to read it. The date is part of the address rather than an id, so this can only
 * remove the record the teacher is looking at.
 */
router.delete('/records', requireTeacher, async (req, res, next) => {
  try {
    const assignment = await requireAssignment(req, res);
    if (!assignment) return;
    const date = text(req.query.date, 10);
    if (!isIsoDate(date)) return fail(res, 400, '日期不正確');
    const removed = await repo.deleteRecord({ ...assignment, date });
    if (!removed) return fail(res, 404, '找不到記錄');
    res.json({ success: true, message: '記錄已刪除', record: removed });
  } catch (error) { next(error); }
});

router.get('/analysis', requireTeacher, async (req, res, next) => {
  try {
    const academicYear = text(req.query.academicYear, 10);
    const className = text(req.query.className, 10);
    const studentId = text(req.query.studentId, 20);
    if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className) || !studentId) return fail(res, 400, '請選擇學年、年級及學生');
    const user = await repo.findUser(studentId, academicYear);
    if (!user || user.role === 'teacher' || user.classname !== className) return fail(res, 404, '找不到該學生');
    const records = await repo.listRecords({ academicYear, className });
    const rows = [];
    for (const record of records) for (const homework of record.homeworks) {
      const item = homework.statuses.find(entry => entry.studentId === studentId);
      if (item?.status === 'missing') rows.push({ date: record.date, subject: record.subject, homeworkId: homework.id, homework: homework.title, status: item.status, madeUp: Boolean(item.madeUp) });
    }
    res.json({ success: true, student: { id: studentId, name: user.name }, rows });
  } catch (error) { next(error); }
});

router.put('/analysis/made-up', requireTeacher, async (req, res, next) => {
  try {
    const academicYear = text(req.body.academicYear, 10);
    const className = text(req.body.className, 10);
    const studentId = text(req.body.studentId, 20);
    const updates = Array.isArray(req.body.updates) ? req.body.updates : [];
    if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className) || !studentId) return fail(res, 400, '參數不正確');
    if (!updates.length) return fail(res, 400, '沒有需要更新的項目');
    const user = await repo.findUser(studentId, academicYear);
    if (!user || user.role === 'teacher' || user.classname !== className) return fail(res, 404, '找不到該學生');
    // Group updates by record key (date + subject)
    const grouped = new Map();
    for (const update of updates) {
      const date = text(update.date, 10);
      const subject = text(update.subject, 40);
      const key = `${date}|${subject}`;
      if (!grouped.has(key)) grouped.set(key, { date, subject, items: [] });
      grouped.get(key).items.push({ homeworkId: text(update.homeworkId, 50), madeUp: Boolean(update.madeUp) });
    }
    let changed = 0;
    for (const [, { date, subject, items }] of grouped) {
      const record = await repo.findRecord({ academicYear, className, subject, date });
      if (!record) continue;
      let modified = false;
      for (const { homeworkId, madeUp } of items) {
        const homework = record.homeworks.find(hw => hw.id === homeworkId);
        if (!homework) continue;
        const row = homework.statuses.find(entry => entry.studentId === studentId);
        if (row && row.status === 'missing' && row.madeUp !== madeUp) {
          row.madeUp = madeUp;
          modified = true;
          changed++;
        }
      }
      if (modified) {
        await repo.updateRecord({ academicYear, className, subject, date, homeworks: record.homeworks, updatedBy: req.session.studentId });
      }
    }
    res.json({ success: true, message: `已更新 ${changed} 項狀態` });
  } catch (error) { next(error); }
});

router.get('/pending', async (req, res, next) => {
  try {
    if (req.session.role === 'teacher') return res.json({ success: true, pending: [] });
    const academicYear = await academicYearsRepo.getCurrentAcademicYear();
    const user = await repo.findUser(req.session.studentId, academicYear);
    if (!user) return fail(res, 404, '找不到學生');
    const records = await repo.listRecords({ academicYear, className: user.classname || '' });
    const pending = [];
    for (const record of records) for (const homework of record.homeworks) {
      const item = homework.statuses.find(entry => entry.studentId === req.session.studentId);
      if (item?.status === 'missing' && !item.madeUp) {
        pending.push({ date: record.date, subject: record.subject, subjectName: subjectById(record.subject)?.name || record.subject, homework: homework.title });
      }
    }
    res.json({ success: true, pending });
  } catch (error) { next(error); }
});

router.get('/class-analysis', requireTeacher, async (req, res, next) => {
  try {
    const academicYear = text(req.query.academicYear, 10);
    const className = text(req.query.className, 10);
    const dateFrom = text(req.query.dateFrom, 10);
    const dateTo = text(req.query.dateTo, 10);
    if (!isAcademicYear(academicYear) || !/^P[1-6]$/.test(className) || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom > dateTo) {
      return fail(res, 400, '請選擇正確的學年、班級及日期範圍');
    }
    const [students, records] = await Promise.all([
      repo.listClassStudents(academicYear, className),
      repo.listRecords({ academicYear, className, dateFrom, dateTo }),
    ]);
    const counts = new Map(students.map(student => [student.id, 0]));
    for (const record of records) for (const homework of record.homeworks) for (const item of homework.statuses || []) {
      if (item.status === 'missing' && counts.has(item.studentId)) counts.set(item.studentId, counts.get(item.studentId) + 1);
    }
    res.json({
      success: true,
      rows: students.map(student => ({ ...student, missingCount: counts.get(student.id) || 0 })),
      totalMissing: [...counts.values()].reduce((sum, count) => sum + count, 0),
    });
  } catch (error) { next(error); }
});

module.exports = router;
