#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const temp = await mkdtemp(path.join(tmpdir(), 'buio-phonics-'));
const dbFile = path.join(temp, 'fixture.json');
const port = 3156;
const base = `http://127.0.0.1:${port}`;
const passwordhash = bcrypt.hashSync('123456', 4);
const user = (studentid, name, role, classname = '', classno = null) => ({
  studentid, name, role, passwordhash, classname, classno,
  chinesegroup: '', englishgroup: '', mathgroup: '', language: 'zh-HK',
});

await writeFile(dbFile, JSON.stringify({
  users: [
    user('T001', '測試老師', 'teacher'),
    user('S001', '一年級一號', 'student', 'P1', 1),
    user('S002', '一年級二號', 'student', 'P1', 2),
    user('S201', '二年級一號', 'student', 'P2', 1),
  ],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    PORT: String(port), BUIO_JSON_DB_FILE: dbFile, SUPABASE_DB_URL: '', NODE_ENV: 'development',
    GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Phonics test server did not start:\n${output}`);
}

async function login(studentId) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, password: '123456' }),
  });
  assert.equal(response.status, 200);
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map(value => value.split(';')[0]).join('; ');
}

async function request(cookie, url, { method = 'GET', body, redirect = 'follow' } = {}) {
  const response = await fetch(`${base}${url}`, {
    method, redirect,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json() : await response.text();
  return { response, data };
}

try {
  await waitForServer();
  assert.equal((await request('', '/api/phonics/catalog')).response.status, 401, 'catalog requires platform login');
  assert.equal((await request('', '/phonics', { redirect: 'manual' })).response.status, 302, 'page requires platform login');

  const student = await login('S001');
  let result = await request(student, '/api/phonics/catalog');
  assert.equal(result.response.status, 200);
  assert.equal(result.data.levels.length, 8, 'eight learning journeys');
  assert.equal(result.data.accent, 'en-gb', 'new classes default to British English');
  assert.equal(result.data.levels.flatMap(level => level.words).length, 48, 'complete built-in word bank');
  const cat = result.data.levels.find(level => level.id === 'more-sounds').words.find(item => item.id === 'cat');
  assert.deepEqual(cat.segments.map(item => item.text), ['c', 'a', 't'], 'CVC carriages');
  assert.deepEqual(cat.segments.map(item => item.ipa), ['k', 'æ', 't'], 'phoneme labels');
  const cupcake = result.data.levels.at(-1).words.find(item => item.id === 'cupcake');
  assert.equal(cupcake.mode, 'syllable');
  assert.deepEqual(cupcake.segments.map(item => item.text), ['cup', 'cake'], 'long word uses syllable train');
  const stop = result.data.levels.find(level => level.id === 'adjacent-consonants').words.find(item => item.id === 'stop');
  assert.deepEqual(stop.segments.map(item => item.text), ['s', 't', 'o', 'p'], 'adjacent consonants remain separate phonemes');
  const cup = result.data.levels.find(level => level.id === 'more-sounds').words.find(item => item.id === 'cup');
  assert.deepEqual(cup.segments.map(item => item.ipa), ['k', 'ʌ', 'p'], 'cup is taught as /k/ + /ʌ/ + /p/');

  assert.equal(result.data.audioApproved, true, 'complete-word Google TTS is approved');
  assert.equal(result.data.audioProvider, 'google-cloud-tts');
  assert.equal(result.data.ttsAvailable, false, 'fixture has no Google credentials');
  assert.equal(Object.hasOwn(cat.segments[0], 'audio'), false, 'isolated synthetic audio is not exposed');
  assert.equal(Object.hasOwn(cat, 'prefixAudio'), false, 'partial-word synthetic audio is not exposed');
  assert.equal(Object.hasOwn(cat, 'wordAudio'), false, 'complete words use the protected TTS endpoint on demand');
  assert.equal((await request(student, '/api/phonics/tts', {
    method: 'POST', body: { wordId: 'cat' },
  })).response.status, 501, 'TTS reports missing Google configuration cleanly');

  result = await request(student, '/api/phonics/progress');
  assert.equal(result.data.progress.attempts, 0);
  assert.equal(result.data.progress.totalWords, 48);

  result = await request(student, '/api/phonics/attempts', {
    method: 'POST', body: { wordId: 'cat', assembled: ['a', 'c', 't'], mistakes: -8, elapsedMs: -1 },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.correct, false, 'server verifies carriage order');
  assert.equal(result.data.attempt.stars, 0);
  assert.equal(result.data.attempt.mistakes, 0, 'invalid negative counters are clamped');

  result = await request(student, '/api/phonics/attempts', {
    method: 'POST', body: { wordId: 'cat', assembled: ['c', 'a', 't'], mistakes: 0, elapsedMs: 4200 },
  });
  assert.equal(result.data.correct, true);
  assert.equal(result.data.attempt.stars, 3);
  result = await request(student, '/api/phonics/attempts', {
    method: 'POST', body: { wordId: 'cupcake', assembled: ['cup', 'cake'], mistakes: 2, elapsedMs: 9000 },
  });
  assert.equal(result.data.attempt.stars, 2, 'multisyllable attempt is persisted');
  assert.equal((await request(student, '/api/phonics/attempts', {
    method: 'POST', body: { wordId: 'not-a-word', assembled: [] },
  })).response.status, 400, 'unknown words rejected');

  result = await request(student, '/api/phonics/progress');
  assert.equal(result.data.progress.attempts, 3);
  assert.equal(result.data.progress.masteredWords, 2);
  assert.equal(result.data.progress.totalStars, 5);
  assert.equal((await request(student, '/phonics')).response.status, 200, 'student page available');
  assert.equal((await request(student, '/phonics/teacher', { redirect: 'manual' })).response.status, 302, 'student cannot open teacher page');

  let teacher = await login('T001');
  assert.equal((await request(teacher, '/phonics')).data.includes('教師進度'), true, 'teacher lands on progress dashboard');
  result = await request(teacher, '/api/phonics/catalog?accent=en-us');
  assert.equal(result.data.accent, 'en-us', 'teacher can preview American English without changing a class');
  assert.equal(result.data.isTeacherPreview, true);
  result = await request(student, '/api/phonics/catalog?accent=en-us');
  assert.equal(result.data.accent, 'en-gb', 'students cannot override their assigned class accent in the URL');
  assert.equal((await request(teacher, '/api/phonics/attempts', {
    method: 'POST', body: { wordId: 'cat', assembled: ['c', 'a', 't'] },
  })).response.status, 403, 'teacher preview never pollutes student progress');
  result = await request(teacher, '/api/phonics/teacher/summary?className=P1');
  assert.equal(result.data.students.length, 2, 'class filter follows student management roster');
  assert.equal(result.data.classAccents.P1, 'en-gb', 'teacher sees the default class accent');
  assert.equal(result.data.students.find(item => item.id === 'S001').masteredWords, 2);
  assert.equal(result.data.students.find(item => item.id === 'S002').attempts, 0, 'students without attempts remain visible');
  assert.equal((await request(student, '/api/phonics/teacher/summary')).response.status, 403, 'teacher analytics protected');
  assert.equal((await request(student, '/api/phonics/teacher/accent', {
    method: 'PUT', body: { academicYear: '2025-26', className: 'P1', accent: 'en-us' },
  })).response.status, 403, 'students cannot change a class accent');
  result = await request(teacher, '/api/phonics/teacher/accent', {
    method: 'PUT', body: { academicYear: '2025-26', className: 'P1', accent: 'en-us' },
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.setting.accent, 'en-us', 'teacher can set American English for one class');
  result = await request(student, '/api/phonics/catalog');
  assert.equal(result.data.accent, 'en-us', 'student automatically inherits the class accent');
  assert.equal(Object.hasOwn(result.data.levels[0].words[0], 'wordAudio'), false, 'accent selection uses the protected on-demand endpoint');
  const americanDog = result.data.levels.find(level => level.id === 'more-sounds').words.find(item => item.id === 'dog');
  assert.equal(americanDog.segments[1].ipa, 'ɑ', 'American short-o uses the distinct /ɑ/ label and audio');
  assert.equal((await request(teacher, '/api/phonics/teacher/accent', {
    method: 'PUT', body: { academicYear: '2025-26', className: 'P1', accent: 'fr-fr' },
  })).response.status, 400, 'unsupported accents are rejected');

  result = await request(teacher, '/api/auth/unlock-admin', { method: 'POST', body: { password: '999999' } });
  const updatedCookie = (typeof result.response.headers.getSetCookie === 'function'
    ? result.response.headers.getSetCookie()
    : [result.response.headers.get('set-cookie')].filter(Boolean))
    .map(value => value.split(';')[0]).join('; ');
  if (updatedCookie) teacher = updatedCookie;
  result = await request(teacher, '/api/auth/upgrade-students', { method: 'POST' });
  assert.equal(result.data.currentAcademicYear, '2026-27');
  result = await request(student, '/api/phonics/progress');
  assert.equal(result.data.academicYear, '2026-27');
  assert.equal(result.data.progress.attempts, 0, 'new academic year starts a separate progress record');
  result = await request(teacher, '/api/phonics/teacher/summary?academicYear=2025-26&className=P1');
  assert.equal(result.data.students.find(item => item.id === 'S001').masteredWords, 2, 'historical Phonics progress remains available');
  result = await request(teacher, '/api/phonics/teacher/summary?academicYear=2026-27&className=P2');
  assert.ok(result.data.students.some(item => item.id === 'S001'), 'promoted roster is used for the new academic year');

  console.log('✅ Phonics Express Google TTS policy, permissions, progress and academic-year tests passed.');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}
