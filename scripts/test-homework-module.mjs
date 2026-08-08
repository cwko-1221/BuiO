#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const temp = await mkdtemp(path.join(tmpdir(), 'buio-homework-'));
const dbFile = path.join(temp, 'fixture.json');
const port = 3137;
const base = `http://127.0.0.1:${port}`;
const passwordhash = bcrypt.hashSync('123456', 4);
const user = (studentid, name, role, classname = '', classno = null, chinesegroup = '', englishgroup = '', mathgroup = '') => ({
  studentid, name, role, passwordhash, classname, classno, chinesegroup, englishgroup, mathgroup, language: 'zh-HK',
});
await writeFile(dbFile, JSON.stringify({
  users: [
    user('T001', '測試老師', 'teacher'),
    user('S001', '四甲一', 'student', 'P4', 1, 'A組', 'A', 'A組'),
    user('S002', '四甲二', 'student', 'P4', 2, 'A', 'B組', 'A'),
    user('S003', '四甲三', 'student', 'P4', 3, 'A組', 'A組', 'B'),
    user('S004', '四乙一', 'student', 'P4', 4, 'B組', 'B', 'B組'),
    user('S101', '一年級生', 'student', 'P1', 1, 'A', 'A', 'A'),
    user('S301', '三年級生', 'student', 'P3', 1, 'A', 'A', 'A'),
    user('S601', '六年級生', 'student', 'P6', 1, 'B', 'B', 'B'),
  ], studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: dbFile, SUPABASE_DB_URL: '', NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start:\n${output}`);
}

async function login(studentId) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, password: '123456' }),
  });
  assert.equal(response.status, 200);
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  const cookie = setCookies.map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'login cookie');
  return cookie;
}

async function request(cookie, url, { method = 'GET', body } = {}) {
  const response = await fetch(`${base}${url}`, {
    method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = (response.headers.get('content-type') || '').includes('json') ? await response.json() : await response.text();
  return { response, data };
}

try {
  await waitForServer();
  let teacher = await login('T001');
  const teacherMeta = await request(teacher, '/api/homework/meta');
  const year = teacherMeta.data.currentAcademicYear;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const subjectIds = teacherMeta.data.subjects.map(subject => subject.id);
  assert.deepEqual(subjectIds, [
    'chinese-a', 'chinese-b', 'english-a', 'english-b', 'math-a', 'math-b',
    'general-studies', 'humanities', 'science', 'visual-arts', 'music', 'pe', 'computer', 'putonghua',
  ], 'complete subject catalogue');

  let result = await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=chinese-a`);
  assert.deepEqual(result.data.students.map(row => row.id), ['S001', 'S002', 'S003'], 'A組 roster filtering');
  result = await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=chinese-b`);
  assert.deepEqual(result.data.students.map(row => row.id), ['S004'], 'B組 roster filtering');
  assert.deepEqual((await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=english-a`)).data.students.map(row => row.id), ['S001', 'S003'], 'English A roster');
  assert.deepEqual((await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=math-a`)).data.students.map(row => row.id), ['S001', 'S002'], 'Math A roster');
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=music`)).data.students.length, 4, 'common subject roster');
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P1&subject=humanities`)).response.status, 200);
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P3&subject=general-studies`)).response.status, 200);
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P6&subject=general-studies`)).response.status, 200);
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P4&subject=general-studies`)).response.status, 400);
  assert.equal((await request(teacher, `/api/homework/students?academicYear=${year}&className=P3&subject=humanities`)).response.status, 400);
  assert.equal((await fetch(`${base}/api/homework/meta`)).status, 401, 'unauthenticated API blocked');

  result = await request(teacher, '/api/homework/monitors', { method: 'PUT', body: { academicYear: year, className: 'P4', subject: 'chinese-a', studentIds: ['S001', 'S002'] } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.monitors.length, 2, 'multiple monitors');
  result = await request(teacher, '/api/homework/monitors', { method: 'PUT', body: { academicYear: year, className: 'P4', subject: 'chinese-a', studentIds: ['S004'] } });
  assert.equal(result.response.status, 400, 'reject monitor outside group');

  const nonMonitor = await login('S003');
  assert.equal((await request(nonMonitor, '/api/homework/meta')).data.canAccess, false);
  assert.equal((await request(nonMonitor, '/homework')).response.status, 403, 'protected page');
  result = await request(nonMonitor, '/api/homework/records', { method: 'POST', body: { academicYear: year, className: 'P4', subject: 'chinese-a', date: today, homeworks: [] } });
  assert.equal(result.response.status, 403, 'protected write API');

  const monitor = await login('S001');
  assert.equal((await request(monitor, '/api/homework/meta')).data.canAccess, true);
  assert.equal((await request(monitor, '/homework')).response.status, 200);
  result = await request(monitor, `/api/homework/roster?academicYear=${year}&className=P4&subject=chinese-a`);
  assert.deepEqual(result.data.students.map(row => row.id), ['S001', 'S002', 'S003']);
  const statuses = ['S001', 'S002', 'S003'].map((studentId, index) => ({ studentId, status: index === 2 ? 'missing' : 'complete' }));
  const secondStatuses = ['S001', 'S002', 'S003'].map((studentId, index) => ({
    studentId,
    status: index === 0 ? 'absent' : 'complete',
  }));
  const recordBody = {
    academicYear: year,
    className: 'P4',
    subject: 'chinese-a',
    date: today,
    homeworks: [
      { id: 'hw-1', title: '工作紙（一）', statuses },
      { id: 'hw-2', title: '默書改正', statuses: secondStatuses },
    ],
  };
  result = await request(monitor, '/api/homework/records', { method: 'POST', body: { ...recordBody, date: '2020-01-01' } });
  assert.equal(result.response.status, 400, 'past date is read-only');
  result = await request(monitor, '/api/homework/records', { method: 'POST', body: recordBody });
  assert.equal(result.response.status, 201, 'monitor creates today record');
  assert.equal(result.data.record.homeworks.length, 2, 'multiple homeworks can be saved for one date');
  assert.equal(result.data.record.homeworks[1].statuses[0].status, 'absent', 'Absent status is persisted');
  const monitorUpdate = structuredClone(result.data.record);
  monitorUpdate.homeworks[0].title = '工作紙（一）修訂';
  monitorUpdate.homeworks.push({
    id: 'hw-3', title: '補充練習',
    statuses: ['S001', 'S002', 'S003'].map(studentId => ({ studentId, status: 'complete' })),
  });
  result = await request(monitor, '/api/homework/records', { method: 'PUT', body: monitorUpdate });
  assert.equal(result.response.status, 200, 'monitor can update today record');
  assert.equal(result.data.record.homeworks.length, 3, 'monitor can add homework after saving');
  assert.equal(result.data.record.homeworks[0].title, '工作紙（一）修訂', 'monitor edits saved homework');
  assert.equal((await request(monitor, '/api/homework/records', { method: 'PUT', body: { ...monitorUpdate, date: '2020-01-01' } })).response.status, 400, 'past record stays read-only');
  assert.equal((await request(monitor, '/api/homework/records', { method: 'POST', body: recordBody })).response.status, 409, 'duplicate create is rejected');

  result = await request(nonMonitor, '/api/homework/pending');
  assert.equal(result.data.pending.length, 1, 'homepage reminder sees outstanding homework');
  assert.equal(result.data.pending[0].subjectName, '中文 A組', 'homepage reminder includes the subject and group');
  assert.equal((await request(nonMonitor, '/api/homework/records', { method: 'PUT', body: monitorUpdate })).response.status, 403, 'non-monitor cannot update record');
  const teacherRecord = await request(teacher, `/api/homework/records?academicYear=${year}&className=P4&subject=chinese-a&date=${today}`);
  teacherRecord.data.record.homeworks[0].statuses.find(row => row.studentId === 'S003').madeUp = true;
  teacherRecord.data.record.homeworks[1].title = '默書改正（老師修訂）';
  result = await request(teacher, '/api/homework/records', { method: 'PUT', body: { ...recordBody, homeworks: teacherRecord.data.record.homeworks } });
  assert.equal(result.response.status, 200, 'teacher marks made up');
  const madeUpRow = result.data.record.homeworks[0].statuses.find(row => row.studentId === 'S003');
  assert.equal(madeUpRow.status, 'missing', 'made-up flag does not change the primary status');
  assert.equal(madeUpRow.madeUp, true, 'made-up flag is stored independently');
  assert.equal(result.data.record.homeworks[1].title, '默書改正（老師修訂）', 'teacher can edit any homework record');
  const pdf = await fetch(`${base}/api/homework/records-pdf?academicYear=${year}&className=P4&subject=chinese-a&date=${today}`, { headers: { Cookie: teacher } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF', 'valid PDF download');
  assert.match(pdf.headers.get('content-disposition') || '', /attachment;.*\.pdf/i, 'PDF is downloadable');
  assert.ok(pdfBuffer.toString('latin1').includes('5DE54F5C7D19'), 'PDF contains the homework title 工作紙');
  assert.equal((await request(nonMonitor, '/api/homework/pending')).data.pending.length, 0, 'made-up item leaves reminder');
  result = await request(teacher, `/api/homework/analysis?academicYear=${year}&className=P4&studentId=S003`);
  assert.equal(result.data.rows[0].status, 'missing', 'analysis retains the original missing status');
  assert.equal(result.data.rows[0].madeUp, true, 'analysis shows the independent made-up flag');
  result = await request(teacher, `/api/homework/class-analysis?academicYear=${year}&className=P4&dateFrom=${today}&dateTo=${today}`);
  assert.equal(result.response.status, 200, 'teacher can run class analysis');
  assert.equal(result.data.totalMissing, 1, 'class analysis counts historical missing work even after made up');
  assert.equal(result.data.rows.find(row => row.id === 'S003').missingCount, 1, 'class analysis counts per student');
  assert.equal(result.data.rows.find(row => row.id === 'S002').missingCount, 0, 'class analysis includes students with zero missing work');

  result = await request(teacher, '/api/auth/upgrade-students', { method: 'POST' });
  assert.equal(result.response.status, 403, 'academic-year upgrade requires an unlocked Admin session');
  result = await request(teacher, '/api/auth/unlock-admin', { method: 'POST', body: { password: '123456' } });
  assert.equal(result.response.status, 401, 'wrong Admin password is rejected');
  result = await request(teacher, '/api/auth/unlock-admin', { method: 'POST', body: { password: '999999' } });
  assert.equal(result.response.status, 200, 'Admin password unlocks the session');
  teacher = (typeof result.response.headers.getSetCookie === 'function'
    ? result.response.headers.getSetCookie()
    : [result.response.headers.get('set-cookie')].filter(Boolean))
    .map(value => value.split(';')[0]).join('; ');
  result = await request(teacher, '/api/auth/upgrade-students', { method: 'POST' });
  assert.equal(result.response.status, 200, 'Admin can upgrade the academic year');
  assert.equal(result.data.previousAcademicYear, '2025-26');
  assert.equal(result.data.currentAcademicYear, '2026-27');

  const oldYearUsers = await request(teacher, '/api/stats/teacher/all-users?academicYear=2025-26');
  const newYearUsers = await request(teacher, '/api/stats/teacher/all-users?academicYear=2026-27');
  assert.equal(oldYearUsers.data.students.find(row => row.id === 'S001').className, 'P4', 'old academic-year class is preserved');
  assert.equal(newYearUsers.data.students.find(row => row.id === 'S001').className, 'P5', 'new academic-year class is promoted');
  assert.deepEqual(newYearUsers.data.academicYears, ['2026-27', '2025-26'], 'student management can select current and previous years');
  assert.equal((await request(teacher, '/api/homework/meta')).data.currentAcademicYear, '2026-27', 'homework module follows platform academic year');
  assert.deepEqual(
    (await request(teacher, '/api/homework/students?academicYear=2025-26&className=P4&subject=chinese-a')).data.students.map(row => row.id),
    ['S001', 'S002', 'S003'],
    'homework module uses the historical academic-year roster',
  );
  assert.deepEqual(
    (await request(teacher, '/api/homework/students?academicYear=2026-27&className=P5&subject=chinese-a')).data.students.map(row => row.id),
    ['S001', 'S002', 'S003'],
    'homework module uses the promoted current-year roster',
  );
  assert.equal((await request(monitor, '/api/homework/meta')).data.canAccess, false, 'old monitor assignment does not leak into the new academic year');

  result = await request(teacher, '/api/auth/register-students-batch', {
    method: 'POST',
    body: {
      students: [
        {
          rowNumber: 2, studentId: 'S001', name: '四甲一更新', password: '', passwordProvided: false,
          className: 'P5', classNo: 18, chineseGroup: 'B組', englishGroup: 'A組', mathGroup: 'B組',
        },
        {
          rowNumber: 3, studentId: 'S777', name: '批量新增生', password: '', passwordProvided: false,
          className: 'P5', classNo: 7, chineseGroup: 'A組', englishGroup: 'B組', mathGroup: 'A組',
        },
        {
          rowNumber: 4, studentId: 'T001', name: '不可覆蓋老師', password: '', passwordProvided: false,
          className: 'P5', classNo: 99, chineseGroup: 'A組', englishGroup: 'A組', mathGroup: 'A組',
        },
      ],
    },
  });
  assert.equal(result.response.status, 200, 'Excel batch upsert succeeds');
  assert.equal(result.data.created.length, 1, 'new student ID creates an account');
  assert.equal(result.data.updated.length, 1, 'existing student ID updates the account');
  assert.equal(result.data.skipped[0].studentId, 'T001', 'teacher account cannot be overwritten by student import');

  const oldYearAfterImport = await request(teacher, '/api/stats/teacher/all-users?academicYear=2025-26');
  const newYearAfterImport = await request(teacher, '/api/stats/teacher/all-users?academicYear=2026-27');
  const oldS001 = oldYearAfterImport.data.students.find(row => row.id === 'S001');
  const currentS001 = newYearAfterImport.data.students.find(row => row.id === 'S001');
  assert.equal(oldS001.name, '四甲一', 'historical academic-year name is preserved');
  assert.equal(oldS001.classNo, 1, 'historical academic-year class number is preserved');
  assert.equal(oldS001.chineseGroup, 'A組', 'historical academic-year groups are preserved');
  assert.equal(currentS001.name, '四甲一更新', 'matching ID updates the current student name');
  assert.equal(currentS001.classNo, 18, 'matching ID updates the current class number');
  assert.equal(currentS001.chineseGroup, 'B組', 'matching ID updates current subject groups');
  assert.equal(newYearAfterImport.data.students.find(row => row.id === 'S777').classNo, 7, 'new ID is added to the current academic year');
  assert.ok(await login('S001'), 'blank imported password preserves an existing student password');
  assert.ok(await login('S777'), 'blank password for a new student uses the default password');
  assert.deepEqual(
    (await request(teacher, '/api/homework/students?academicYear=2025-26&className=P4&subject=chinese-a')).data.students.map(row => row.id),
    ['S001', 'S002', 'S003'],
    'historical homework roster keeps the old group assignment',
  );
  assert.deepEqual(
    (await request(teacher, '/api/homework/students?academicYear=2026-27&className=P5&subject=chinese-a')).data.students.map(row => row.id),
    ['S002', 'S003', 'S777'],
    'current homework roster follows Excel-updated groups',
  );

  console.log('✅ Homework and academic-year integration API tests passed (isolated fixture).');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}
