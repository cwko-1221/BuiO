import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';

const workspace = path.resolve(import.meta.dirname, '..');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-report-'));
const dbFile = path.join(tempDir, 'db.json');
const port = 3177;

await fs.writeFile(dbFile, JSON.stringify({
  users: [
    { studentid: 'T900', name: 'Test Teacher', role: 'teacher', passwordhash: bcrypt.hashSync('123456', 4) },
    { studentid: 'S900', name: 'Test Student', role: 'student', passwordhash: bcrypt.hashSync('123456', 4) },
  ],
  studentStats: [],
  questionLogs: [],
  _logId: 0,
}, null, 2));

const child = spawn(process.execPath, ['server.js'], {
  cwd: workspace,
  env: {
    ...process.env,
    PORT: String(port),
    BUIO_JSON_DB_FILE: dbFile,
    SUPABASE_DB_URL: '',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const base = `http://127.0.0.1:${port}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture server did not start:\n${logs}`);
}

async function login(studentId) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, password: '123456' }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'login must issue a session cookie');
  return cookie;
}

function record(filename, score = 88) {
  return {
    filename,
    sheetName: 'ASR_Score_List_by_Class_1',
    schoolYear: '2025/2026',
    termCode: 'T1A1',
    termLabel: 'Term 1',
    grade: 'P4',
    gradeNum: 4,
    className: '4A',
    subjects: [{ name: '數學', startCol: 2, maxScore: 100, isGrade: false, subItems: [], colCount: 1 }],
    students: [{ classNo: 1, name: '測試學生', scores: { 數學: { total: score, items: {}, isGrade: false } }, hasScores: true }],
    classAverage: { 數學: score },
    classMax: { 數學: score },
    classMin: { 數學: score },
  };
}

async function makeWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ASR_Score_List_by_Class_1');
  sheet.addRow(['學年:', '2025/2026']);
  sheet.addRow(['測試原始 Excel']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function uploadWorkbook(cookie, workbookBuffer, score = 88) {
  const form = new FormData();
  form.append('file', new Blob([workbookBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), '四年級_2025.xlsx');
  form.append('records', JSON.stringify([record('四年級_2025.xlsx', score)]));
  return fetch(`${base}/api/report/imports`, { method: 'POST', headers: { Cookie: cookie }, body: form });
}

try {
  await waitForServer();

  assert.equal((await fetch(`${base}/api/report/data`)).status, 401, 'anonymous access must be rejected');
  const studentCookie = await login('S900');
  assert.equal((await fetch(`${base}/api/report/data`, { headers: { Cookie: studentCookie } })).status, 403,
    'student access must be rejected');

  const teacherCookie = await login('T900');
  let response = await fetch(`${base}/api/report/data`, { headers: { Cookie: teacherCookie } });
  assert.deepEqual((await response.json()).records, []);

  const invalidForm = new FormData();
  invalidForm.append('file', new Blob(['not excel']), 'bad.xlsx');
  invalidForm.append('records', JSON.stringify([record('bad.xlsx')]));
  response = await fetch(`${base}/api/report/imports`, { method: 'POST', headers: { Cookie: teacherCookie }, body: invalidForm });
  assert.equal(response.status, 400, 'fake Excel content must be rejected');

  const workbookBuffer = await makeWorkbook();
  response = await uploadWorkbook(teacherCookie, workbookBuffer);
  assert.equal(response.status, 201);
  let payload = await response.json();
  assert.equal(payload.records.length, 1);
  assert.equal(payload.imports.length, 1);
  assert.equal(payload.imports[0].filename, '四年級_2025.xlsx');
  assert.equal(payload.imports[0].originalAvailable, true);

  const secondTeacherCookie = await login('T900');
  response = await fetch(`${base}/api/report/data`, { headers: { Cookie: secondTeacherCookie } });
  payload = await response.json();
  assert.equal(payload.records[0].students[0].scores['數學'].total, 88,
    'a new session must read the shared server record');

  response = await fetch(`${base}/api/report/imports/${payload.imports[0].id}/file`, {
    headers: { Cookie: secondTeacherCookie },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), workbookBuffer, 'downloaded original must match upload bytes');

  response = await uploadWorkbook(teacherCookie, workbookBuffer, 93);
  payload = await response.json();
  assert.equal(payload.imports.length, 1, 're-uploading the same filename must replace, not duplicate');
  assert.equal(payload.records[0].students[0].scores['數學'].total, 93);

  response = await fetch(`${base}/api/report/data`, { method: 'DELETE', headers: { Cookie: teacherCookie } });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.deepEqual(payload.records, []);
  assert.deepEqual(payload.imports, []);

  console.log('Report server import checks passed.');
} finally {
  if (!child.killed) child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 2000)),
  ]);
  await fs.rm(tempDir, { recursive: true, force: true });
}
