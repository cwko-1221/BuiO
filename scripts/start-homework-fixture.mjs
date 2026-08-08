#!/usr/bin/env node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const fixtureDir = await mkdtemp(path.join(tmpdir(), 'buio-homework-ui-'));
const dbFile = path.join(fixtureDir, 'fixture.json');
const port = Number(process.env.HOMEWORK_FIXTURE_PORT) || 3140;
const passwordhash = bcrypt.hashSync('123456', 4);
const current = new Date();
const start = current.getMonth() >= 8 ? current.getFullYear() : current.getFullYear() - 1;
const academicYear = `${start}-${String(start + 1).slice(-2)}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(current);
const user = (studentid, name, role, classname = '', classno = null, chinesegroup = '', englishgroup = '', mathgroup = '') => ({ studentid, name, role, passwordhash, classname, classno, chinesegroup, englishgroup, mathgroup, language: 'zh-HK' });
const users = [
  user('T001', '陳老師', 'teacher'),
  user('S001', '陳樂希', 'student', 'P4', 1, 'A組', 'A組', 'A組'),
  user('S002', '梁子晴', 'student', 'P4', 2, 'A組', 'B組', 'A組'),
  user('S003', '黃家朗', 'student', 'P4', 3, 'A組', 'A組', 'B組'),
  user('S004', '何詠恩', 'student', 'P4', 4, 'B組', 'B組', 'B組'),
  user('S101', '一年級生', 'student', 'P1', 1, 'A組', 'A組', 'A組'),
  user('S301', '三年級生', 'student', 'P3', 1, 'A組', 'A組', 'A組'),
  user('S601', '六年級生', 'student', 'P6', 1, 'B組', 'B組', 'B組'),
];
await writeFile(dbFile, JSON.stringify({
  users, studentStats: [], questionLogs: [], _logId: 0,
  _homeworkMonitorId: 2, _homeworkRecordId: 1,
  homeworkMonitors: [
    { id: 1, academicYear, className: 'P4', subject: 'chinese-a', studentId: 'S001', createdBy: 'T001' },
    { id: 2, academicYear, className: 'P4', subject: 'chinese-a', studentId: 'S002', createdBy: 'T001' },
  ],
  homeworkRecords: [{
    id: 1, academicYear, className: 'P4', subject: 'chinese-a', date: today,
    homeworks: [{ id: 'fixture-hw-1', title: '中文作業第十二課', statuses: [
      { studentId: 'S001', status: 'complete' }, { studentId: 'S002', status: 'complete' },
      { studentId: 'S003', status: 'missing' },
    ] }], createdBy: 'S001', submittedAt: new Date().toISOString(), updatedBy: 'S001', updatedAt: new Date().toISOString(),
  }],
}, null, 2));

const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: dbFile, SUPABASE_DB_URL: '', NODE_ENV: 'development' }, stdio: 'inherit',
});
console.log(`\nHomework UI fixture: http://127.0.0.1:${port}`);
console.log('Teacher T001 / 123456 | monitors S001, S002 / 123456 | non-monitor S003 / 123456');
console.log('This uses a temporary database and never changes data/db.json. Press Ctrl+C to stop.\n');
const cleanup = async () => { if (!child.killed) child.kill('SIGTERM'); await rm(fixtureDir, { recursive: true, force: true }); };
process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });
child.on('exit', async code => { await rm(fixtureDir, { recursive: true, force: true }); process.exit(code ?? 0); });
