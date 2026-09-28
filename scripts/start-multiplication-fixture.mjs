import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const fixtureDirectory = await mkdtemp(path.join(tmpdir(), 'buio-multiplication-'));
const fixtureFile = path.join(fixtureDirectory, 'fixture.json');
const port = Number(process.env.MULTIPLICATION_FIXTURE_PORT || 3197);
const passwordhash = bcrypt.hashSync('123456', 4);
const users = [{ studentid: 'T9000', name: '輪盤測試老師', role: 'teacher', passwordhash, language: 'zh-HK' }];
const multiplicationChecks = [];
let nextStudentId = 9100;
const names = [
  '黃宇德 Wong Yeu Tak Him Danny', '林小芬 Lam Siu Fan', '陳大偉 Chan Tai Wai',
  'Campbell Olivia Rose', 'Sargent Tessa Jahn Tsz Lam', 'Valentino Michael Alexander',
  '梁慧婷 Leung Wai Ting Charlotte', '張凱晴 Cheung Hoi Ching', 'Wan Tsz Yau Ethan',
  'Tam Felina Anastasia', 'Jack Seth Axel Williamson', '李小璇 Lee Siu Suen',
];

function addStudents(group, grade, count, weighted = false) {
  for (let index = 0; index < count; index += 1) {
    const studentid = `S${++nextStudentId}`;
    const name = names[index % names.length] + (index >= names.length ? ` ${index + 1}` : '');
    users.push({ studentid, name, role: 'student', passwordhash, classname: grade, classno: index + 1, mathgroup: group, language: 'zh-HK' });
    const successes = weighted ? [0, 1, 9, 99][index % 4] : 0;
    for (let attempt = 0; attempt < successes; attempt += 1) {
      multiplicationChecks.push({ id: multiplicationChecks.length + 1, studentid, teacherid: 'T9000', tableNumber: 2 + (attempt % 8), isSuccess: true, createdAt: new Date().toISOString() });
    }
  }
}

addStudents('中英12', 'P5', 12);
addStudents('大組30', 'P4', 30);
addStudents('不均4', 'P3', 4, true);
addStudents('單人', 'P1', 1);
await writeFile(fixtureFile, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0, multiplicationChecks, _multiplicationCheckId: multiplicationChecks.length }));

const child = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: fixtureFile, SUPABASE_DB_URL: '', NODE_ENV: 'development', GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
  stdio: 'inherit',
});
console.log(`Multiplication fixture: http://127.0.0.1:${port}/multiplication-checklist`);
console.log('Fixture teacher: T9000 / 123456 (temporary database)');
let stopping = false;
async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill('SIGTERM');
  const resolved = path.resolve(fixtureDirectory);
  if (resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`) && path.basename(resolved).startsWith('buio-multiplication-')) {
    await rm(resolved, { recursive: true, force: true });
  }
}
process.on('SIGINT', async () => { await cleanup(); process.exit(0); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });
child.on('exit', async code => { await cleanup(); process.exit(code || 0); });
