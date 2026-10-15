import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { defaultWeekPeriod, weekEnd } from '../homework-app/public/js/report-period.mjs';

const require = createRequire(import.meta.url);
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const bcrypt = require('bcryptjs');
const { reportPeriod, cloneSheet } = require('../homework-app/lib/excel-export');
const { writeTemplate } = require('../homework-app/lib/xlsx-template');
const { attribute, partPath, escapeXml } = require('../homework-app/lib/xlsx-template');
const { writeTasksSheet, TASK_SHEET_NAME } = require('../homework-app/lib/report-tasks-sheet');
const { openReport, checkArchive, nextStatus } = require('../homework-app/lib/weekly-reports');
const root = path.resolve(import.meta.dirname, '..');
const temp = await mkdtemp(path.join(tmpdir(), 'buio-homework-excel-'));
const qaDir = process.env.HOMEWORK_EXCEL_QA_DIR;
const port = 3146;
const base = `http://127.0.0.1:${port}`;
const academicYear = '2026-27';
const user = (id, name, className, classNo) => ({ studentid: id, name, role: className ? 'student' : 'teacher', classname: className || '', classno: classNo,
  passwordhash: bcrypt.hashSync('123456', 4), chinesegroup: 'A', englishgroup: 'A', mathgroup: 'A', language: 'zh-HK' });
const users = [user('T001', '測試老師'), user('S401', '翟家朗 Jace', 'P4', 1), user('S002', '王美賢 Akbar Adeena', 'P4', 2),
  user('S030', '三十號同學', 'P4', 30), user('S000', '未編號同學', 'P4', null), user('S004', '金寶謙 Oliver', 'P4', 4),
  user('S101', '柏安達 Adam', 'P1', 1), user('S501', '艾莎華 Savannah', 'P5', 1), user('S502', '區栢堯 Ander', 'P5', 2),
  user('S511', '何力高 Nicolas', 'P5', 11), user('S601', '柏珈路 Jade', 'P6', 1)];
let recordId = 0;
const record = (date, statuses, className = 'P4', amount = 1) => ({ id: ++recordId, academicYear, className, subject: 'music', date,
  homeworks: Array.from({ length: amount }, (_, i) => ({ id: `hw-${recordId}-${i}`, title: i ? `音樂功課 ${i}` : '=SUM(A1:A2)', statuses })),
  createdBy: 'T001', submittedAt: new Date().toISOString() });
const missing = (studentId, madeUp = false) => ({ studentId, status: 'missing', madeUp });
const records = [record('2026-09-04', [missing('S002')]), record('2026-09-08', [missing('S002', true), missing('S030')]),
  record('2026-09-24', [missing('S030'), { studentId: 'S002', status: 'complete' }]), record('2026-10-09', [missing('S002')]),
  record('2026-10-10', [missing('S002'), missing('S030')]), record('2026-10-11', [missing('S401', true)], 'P4', 6),
  record('2026-10-16', [missing('S000')]), record('2026-10-10', [missing('S501'), missing('S502'), missing('S511')], 'P5'),
  record('2026-10-10', [missing('S101')], 'P1', 5), record('2026-10-10', [missing('S601')], 'P6', 8),
  record('2026-10-17', [missing('S501'), missing('S502')], 'P5'), record('2026-10-24', [missing('S502')], 'P5')];
records.push(record('2026-10-11', [missing('S511')], 'P5'));
const dbFile = path.join(temp, 'fixture.json');
await writeFile(dbFile, JSON.stringify({ users, platformSettings: { currentAcademicYear: academicYear },
  studentAcademicYears: users.filter(s => s.role === 'student').map(s => ({ academicYear, studentId: s.studentid,
    name: s.name, className: s.classname, classNo: s.classno, chineseGroup: 'A', englishGroup: 'A', mathGroup: 'A' })),
  homeworkRecords: records, homeworkMonitors: [], _homeworkRecordId: recordId, _homeworkMonitorId: 0, studentStats: [], questionLogs: [], _logId: 0 }));
let server;
let logs = '';
async function start() {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: dbFile,
    SUPABASE_DB_URL: '', NODE_ENV: 'development', ADMIN_PASSWORD: 'fixture-admin' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    if (i > 60) throw new Error(logs || 'Server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function stop() {
  if (!server || server.exitCode != null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
}
const workbook = async buffer => { const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); return book; };
const login = async studentId => {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, password: '123456' }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
};
let cookie;
const period = { academicYear, mode: 'week', week: '7', dateFrom: '2026-09-04', dateTo: '2026-10-16', scope: 'all' };
const forWeek = week => ({ ...period, week: String(week), dateTo: weekEnd(period.dateFrom, week) });
const exportFile = (values, session = cookie) => fetch(`${base}/api/homework/class-analysis/export`, { method: 'POST',
  headers: { Cookie: session || '', 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
async function download(values) {
  const response = await exportFile(values);
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  return Buffer.from(await response.arrayBuffer());
}
const preview = async (week, className = 'P4') => {
  const params = new URLSearchParams({ ...forWeek(week), className });
  const response = await fetch(`${base}/api/homework/class-analysis?${params}`, { headers: { Cookie: cookie } });
  const data = await response.json();
  assert.equal(response.status, 200, data.message);
  return data;
};
async function upload(buffer, week, revision, session = cookie, name = 'latest.xlsx') {
  const body = new FormData();
  for (const [key, value] of Object.entries(forWeek(week))) body.append(key, value);
  body.append('revision', String(revision));
  body.append('workbook', new Blob([buffer]), name);
  return fetch(`${base}/api/homework/class-analysis/report-upload`, { method: 'POST', headers: { Cookie: session || '' }, body });
}
const assertTemplateLayout = (sheet, reference) => {
  assert.deepEqual(sheet.views, reference.views);
  assert.deepEqual(sheet.properties, reference.properties);
  assert.deepEqual(sheet.pageSetup, reference.pageSetup);
  assert.deepEqual([...sheet.model.merges].sort(), [...reference.model.merges].sort());
  for (let c = 1; c <= 14; c++) {
    assert.equal(sheet.getColumn(c).width, reference.getColumn(c).width);
    assert.deepEqual(sheet.getColumn(c).style, reference.getColumn(c).style);
  }
  for (let r = 1; r < 34; r++) for (let c = 1; c <= 14; c++) {
    assert.equal(sheet.getRow(r).height, reference.getRow(r).height);
    const { fill: a, ...actual } = sheet.getCell(r, c).style;
    const { fill: b, ...expected } = reference.getCell(r, c).style;
    assert.deepEqual(actual, expected, `${sheet.name}!${sheet.getCell(r, c).address} keeps original fonts, sizes and layout`);
    if (r <= 4 || c === 1 || c === 14) assert.deepEqual(a, b);
  }
};
const taskActions = (data, id) => data.tasks.filter(task => task.studentId === id).map(task => task.action).sort();
const taskRows = sheet => Array.from({ length: Math.max(0, sheet.rowCount - 4) }, (_, i) => i + 5)
  .filter(r => sheet.getCell(r, 9).value).map(r => ({ row: r, id: sheet.getCell(r, 9).value, name: sheet.getCell(r, 4).value,
    action: sheet.getCell(r, 6).value, status: sheet.getCell(r, 7).value, notes: sheet.getCell(r, 8).value }));
async function editTaskCells(buffer, edits) {
  const book = await workbook(buffer);
  const rows = taskRows(book.getWorksheet(TASK_SHEET_NAME));
  const zip = await JSZip.loadAsync(buffer);
  const tag = (await zip.file('xl/workbook.xml').async('string')).match(/<sheet\b[^>]*\/>/g).find(tag => attribute(tag, 'name') === TASK_SHEET_NAME);
  const rel = (await zip.file('xl/_rels/workbook.xml.rels').async('string')).match(/<Relationship\b[^>]*\/>/g).find(rel => attribute(rel, 'Id') === attribute(tag, 'r:id'));
  const file = partPath(attribute(rel, 'Target'));
  let xml = await zip.file(file).async('string');
  for (const edit of edits) {
    const r = rows.find(row => row.id === edit.id)?.row;
    assert.ok(r, 'teacher edit targets an existing Excel task');
    for (const [column, value] of [['G', edit.status], ['H', edit.notes]]) if (value !== undefined) {
      const pattern = new RegExp(`<c\\b[^>]*r="${column}${r}"[^>]*?(?:\\/>|>[\\s\\S]*?<\\/c>)`);
      xml = xml.replace(pattern, raw => `<c r="${column}${r}" s="${attribute(raw, 's')}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`);
    }
  }
  zip.file(file, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
try {
  await start();
  assert.equal(weekEnd(period.dateFrom, 6), '2026-10-09');
  assert.equal(weekEnd(period.dateFrom, 7), '2026-10-16');
  assert.equal(defaultWeekPeriod(academicYear, '2026-09-01').week, '6');
  assert.equal(defaultWeekPeriod(academicYear, '2026-10-11').week, '6');
  assert.throws(() => reportPeriod({ ...period, week: 5 }), /第 6 周/);
  assert.throws(() => reportPeriod({ ...period, dateTo: '2026-10-09' }), /不一致/);
  cookie = await login('T001');
  const studentCookie = await login('S002');
  assert.equal((await exportFile(period, '')).status, 401);
  assert.equal((await exportFile(period, studentCookie)).status, 403);
  const sourceBuffer = await readFile(path.join(root, 'homework-app/templates/summary-t1.xlsx'));
  const sourceBook = await workbook(sourceBuffer);
  const source = sourceBook.getWorksheet('wk6');
  assert.equal(source.getCell('K15').value, 9);
  assert.deepEqual(source.getCell('J15').fill, source.getCell('N8').fill, 'the original name records one completed detention');
  assert.deepEqual(source.getCell('K15').fill, source.getCell('N6').fill, 'the original 9-count warning is separate from the name');
  for (let mark = 1; mark <= 4; mark++) {
    const marked = cloneSheet(sourceBook, source, `marker-test-${mark}`);
    marked.getCell('J15').fill = structuredClone(source.getCell(`N${mark + 7}`).fill);
    for (const nextCount of [9, 11]) {
      const status = nextStatus(marked, { row: 15, column: 10, previousCount: 9, detention: mark }, nextCount);
      assert.deepEqual(status.nameFill, marked.getCell('J15').fill, `completed detention ${mark} stays on the name at ${nextCount}`);
      assert.deepEqual(status.fill, source.getCell(nextCount === 9 ? 'N6' : 'N7').fill);
      assert.deepEqual(status.actions.map(action => action.action), nextCount === 9 ? [] : ['demerit']);
    }
    sourceBook.removeWorksheet(marked.id);
  }
  assert.deepEqual(await download(forWeek(6)), sourceBuffer, 'Week 6 is the exact original file, not re-saved');
  const baseline = await preview(6);
  assert.equal(baseline.rows.find(row => row.id === 'S401').missingCount, 4);
  assert.equal(baseline.rows.find(row => row.id === 'S002').missingCount, 0, 'old database records do not recompute the baseline');
  assert.deepEqual(baseline.tasks, []);
  const initialPreview = await preview(7);
  assert.deepEqual(taskActions(initialPreview, 'S401'), ['demerit', 'detention', 'parent']);
  assert.ok(initialPreview.tasks.every(task => task.preview));
  assert.equal(initialPreview.revision, 0, 'preview makes no persistent changes');
  const week7Buffer = await download(period);
  const week7 = await workbook(week7Buffer);
  const summary = week7.getWorksheet('wk7');
  assert.deepEqual(week7.worksheets.map(s => s.name), [...sourceBook.worksheets.map(s => s.name), 'wk7', TASK_SHEET_NAME]);
  const actions7 = week7.getWorksheet(TASK_SHEET_NAME);
  assert.deepEqual(taskRows(actions7).filter(row => row.name === '翟家朗 Jace').map(row => row.action), ['通知家長', '留堂班', '記缺點'], 'all crossed tiers are listed in Excel');
  assert.equal(taskRows(actions7).length, initialPreview.tasks.length);
  assert.ok(taskRows(actions7).every(row => row.status === '待處理'));
  assert.ok(actions7.getColumn(9).hidden, 'stable task identifiers are not shown to teachers');
  assert.deepEqual(actions7.getCell('G5').dataValidation.formulae, ['"待處理,已處理"']);
  assertTemplateLayout(summary, source);
  assert.equal(summary.getCell('A3').value, '欠交功課紀錄 (4/9/2026-16/10/2026)');
  assert.equal(summary.getCell('I5').value, 10, 'baseline 4 plus 6 new records, including caught-up records');
  assert.equal(summary.getCell('I6').value, 1);
  assert.equal(summary.getCell('K5').value, 5);
  assert.equal(summary.getCell('K6').value, 8);
  assert.equal(summary.getCell('K15').value, 11, '9 plus 2 new records matches the reported case');
  assert.deepEqual(summary.getCell('J15').style, source.getCell('J15').style, 'name keeps its exact green completed-detention style');
  for (const [address, legend] of [['H5', 'N7'], ['I5', 'N7'], ['J5', 'N5'], ['J6', 'N6'], ['K15', 'N7']]) assert.deepEqual(summary.getCell(address).fill, source.getCell(legend).fill);
  for (const address of ['J22', 'K22', 'J31', 'K31']) assert.deepEqual(summary.getCell(address).style, source.getCell(address).style, 'manual old detention markers stay unchanged');
  assert.equal(summary.getCell('H8').value, source.getCell('H8').value, 'zero-missing students stay in the original report');
  assert.equal(summary.getCell('H34').value, '三十號同學');
  assert.equal(summary.getCell('I34').value, 1);
  assert.equal(summary.getCell('H35').value, '未編號同學');
  assert.equal(summary.getCell('I35').value, 1);
  assert.equal(summary.getCell('C36').value, null, 'the original blank P1 total is not redesigned');
  assert.deepEqual(summary.getCell('I36').value, { formula: 'SUM(I5:I35)', result: baseline.totalMissing + 9 });
  const sourceZip = await JSZip.loadAsync(sourceBuffer);
  const week7Zip = await JSZip.loadAsync(week7Buffer);
  const originalStyles = await sourceZip.file('xl/styles.xml').async('string');
  const exportedStyles = await week7Zip.file('xl/styles.xml').async('string');
  for (const section of ['fonts', 'fills', 'borders', 'cellStyleXfs', 'cellStyles']) {
    const pattern = new RegExp(`<${section}\\b[^>]*>[\\s\\S]*?</${section}>`);
    assert.equal(exportedStyles.match(pattern)?.[0], originalStyles.match(pattern)?.[0]);
  }
  for (const name of Object.keys(sourceZip.files).filter(name => /^xl\/(worksheets\/|printerSettings\/|theme\/|sharedStrings\.xml)/.test(name) && !sourceZip.files[name].dir))
    assert.deepEqual(await week7Zip.file(name).async('nodebuffer'), await sourceZip.file(name).async('nodebuffer'), `${name} retained verbatim`);
  const saved7 = await preview(7);
  assert.ok(saved7.tasks.every(task => !task.preview));
  assert.deepEqual(taskActions(saved7, 'S401'), ['demerit', 'detention', 'parent']);
  assert.deepEqual(taskActions(saved7, 'S502'), ['detention']);
  assert.deepEqual(taskActions(saved7, 'S511'), ['demerit'], 'manual detention at 9 only adds the new 10 tier');
  const repeated = await workbook(await download(period));
  assert.equal(repeated.getWorksheet('wk7').getCell('I5').value, 10, 'repeated export does not double-count');
  assert.deepEqual(repeated.getWorksheet('wk7').getCell('J15').style, source.getCell('J15').style, 'repeated exports keep the green name');
  assert.equal((await preview(7)).tasks.length, saved7.tasks.length, 'repeated export does not duplicate actions');
  // Simulate a platform-generated Week 7 saved by the old two-cell paint bug.
  const brokenBook = await workbook(week7Buffer);
  const brokenSheet = cloneSheet(brokenBook, brokenBook.getWorksheet('wk7'), 'wk7');
  brokenSheet.getCell('J15').fill = structuredClone(source.getCell('N7').fill);
  const brokenBuffer = await writeTemplate({ templateBuffer: week7Buffer, source: summary, summary: brokenSheet, totalRow: 36 });
  await stop();
  const legacyFixture = JSON.parse(await readFile(dbFile, 'utf8'));
  legacyFixture.homeworkReportStates[0].state.versions.find(version => version.week === 7).file = brokenBuffer.toString('base64');
  await writeFile(dbFile, JSON.stringify(legacyFixture));
  await start(); cookie = await login('T001');
  const repaired = await workbook(await download(period));
  assert.deepEqual(repaired.getWorksheet('wk7').getCell('J15').style, source.getCell('J15').style, 'regenerating an affected platform version restores the previous green name');
  assert.equal(repaired.getWorksheet('wk7').getCell('K15').value, 11, 'repair never changes missing counts');
  assert.deepEqual(repaired.getWorksheet('wk7').getCell('K15').fill, source.getCell('N7').fill);
  assert.equal((await preview(7)).tasks.length, saved7.tasks.length, 'repair does not duplicate escalation actions');
  // Teacher annotates the generated report, retaining the native Excel styles.
  const teacherSource = repeated.getWorksheet('wk7');
  const teacherSheet = cloneSheet(repeated, teacherSource, 'wk7');
  for (const address of ['J6', 'K6']) teacherSheet.getCell(address).fill = structuredClone(teacherSource.getCell('N8').fill);
  teacherSheet.getCell('K5').fill = structuredClone(teacherSource.getCell('N9').fill);
  const parentTask = saved7.tasks.find(task => task.studentId === 'S401' && task.action === 'parent');
  const notedTask = saved7.tasks.find(task => task.studentId === 'S601' && task.action === 'detention');
  const teacherBuffer = await editTaskCells(await writeTemplate({ templateBuffer: await download(period), source: teacherSource, summary: teacherSheet, totalRow: 36 }),
    [{ id: parentTask.id, status: '已處理' }, { id: notedTask.id, notes: '安排星期五留堂' }]);
  const teacherPath = path.join(temp, 'teacher-latest.xlsx');
  await writeFile(teacherPath, teacherBuffer);
  // A late entry after download must not be swallowed by the upload watermark.
  const late = await fetch(`${base}/api/homework/records`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ academicYear, className: 'P4', subject: 'music', date: '2026-10-12', homeworks: [{ id: 'late', title: 'Late entry', statuses: [missing('S002')] }] }) });
  assert.equal(late.status, 201, await late.clone().text());
  let beforeUpload = await preview(7);
  assert.equal((await upload(teacherBuffer, 7, beforeUpload.revision - 1)).status, 409, 'stale teacher upload cannot overwrite a newer version');
  assert.equal((await upload(teacherBuffer, 7, beforeUpload.revision, studentCookie)).status, 403);
  assert.equal((await upload(teacherBuffer, 7, beforeUpload.revision, '')).status, 401);
  assert.equal((await upload(sourceBuffer, 6, beforeUpload.revision)).status, 400, 'Week 6 cannot be overwritten');
  assert.equal((await upload(sourceBuffer, 7, beforeUpload.revision)).status, 400);
  assert.equal((await upload(Buffer.from('not excel'), 7, beforeUpload.revision)).status, 400);
  assert.equal((await upload(teacherBuffer, 7, beforeUpload.revision, cookie, 'bad.xls')).status, 400);
  assert.equal((await upload(await editTaskCells(teacherBuffer, [{ id: parentTask.id, status: '錯誤狀態' }]), 7, beforeUpload.revision)).status, 400);
  const uploaded = await upload(teacherBuffer, 7, beforeUpload.revision);
  assert.equal(uploaded.status, 200, await uploaded.clone().text());
  const uploadedState = await uploaded.json();
  assert.equal(uploadedState.versions[0].kind, 'uploaded');
  assert.ok(uploadedState.tasks.find(task => task.studentId === 'S502' && task.action === 'detention').done, 'teacher detention marker resolves the pending detention');
  assert.ok(!uploadedState.tasks.find(task => task.studentId === 'S501' && task.action === 'parent').done, 'upload never claims a parent was notified');
  const stored = JSON.parse(await readFile(dbFile, 'utf8')).homeworkReportStates[0].state;
  assert.deepEqual(Buffer.from(stored.versions[0].file, 'base64'), teacherBuffer, 'teacher file stored exactly');
  const task = uploadedState.tasks.find(item => item.studentId === 'S401' && item.action === 'parent');
  assert.ok(task.done, 'the Excel status column marks parent notification as handled');
  await stop(); await start(); cookie = await login('T001');
  const afterRestart = await preview(8);
  assert.equal(afterRestart.baselineWeek, 7);
  assert.ok(afterRestart.tasks.find(item => item.id === task.id).done, 'tasks and uploaded version survive server restart');
  const week8Buffer = await download(forWeek(8));
  const week8 = await workbook(week8Buffer);
  const s8 = week8.getWorksheet('wk8');
  assert.equal(s8.getCell('I6').value, 2, 'late post-download record is included');
  assert.equal(s8.getCell('K5').value, 6);
  assert.equal(s8.getCell('K6').value, 9);
  assert.deepEqual(s8.getCell('K5').fill, teacherSheet.getCell('N9').fill, 'a count-cell-only detention marker is preserved without a new tier');
  assert.deepEqual(s8.getCell('J6').fill, teacherSheet.getCell('N8').fill);
  assert.deepEqual(s8.getCell('J15').style, source.getCell('J15').style, 'green name persists into subsequent weeks');
  assert.deepEqual(s8.getCell('K15').fill, source.getCell('N7').fill);
  const rows8 = taskRows(week8.getWorksheet(TASK_SHEET_NAME));
  assert.ok(!rows8.some(row => row.id === parentTask.id), 'handled Excel task is not carried into the next pending list');
  assert.ok(!rows8.some(row => row.id === saved7.tasks.find(task => task.studentId === 'S502' && task.action === 'detention').id));
  assert.equal(rows8.find(row => row.id === notedTask.id).notes, '安排星期五留堂', 'teacher notes carry into the next Excel version');
  assert.equal(week8.worksheets.filter(sheet => sheet.name === TASK_SHEET_NAME).length, 1, 'one action sheet, not a new duplicate each week');
  assert.equal((await preview(8)).tasks.length, uploadedState.tasks.length, 'same tiers create no repeat tasks');
  assert.deepEqual(await download(period), teacherBuffer, 'historical downloads return the saved file without changing the chain');
  assert.equal((await upload(teacherBuffer, 7, (await preview(8)).revision)).status, 400, 'cannot upload older week over newer report');
  const week9 = await workbook(await download(forWeek(9)));
  assert.equal(week9.getWorksheet('wk9').getCell('K6').value, 10);
  assert.deepEqual(week9.getWorksheet('wk9').getCell('J6').fill, source.getCell('N8').fill, 'a teacher-uploaded green name survives the next tier');
  assert.deepEqual(week9.getWorksheet('wk9').getCell('K6').fill, source.getCell('N7').fill, 'only the count changes to grey at the new tier');
  assert.deepEqual(taskActions(await preview(9), 'S502'), ['demerit', 'detention']);
  assert.deepEqual(await download(forWeek(6)), sourceBuffer, 'baseline stays immutable after every workflow');
  const customPeriod = { ...period, mode: 'custom', scope: 'P4', dateFrom: '2026-09-08', dateTo: '2026-09-24' };
  const custom = await workbook(await download(customPeriod));
  const customSheet = custom.getWorksheet('自選20260908-20260924_P4');
  assertTemplateLayout(customSheet, source);
  assert.equal(customSheet.getCell('I6').value, 1);
  assert.equal(customSheet.getCell('I34').value, 2);
  assert.equal(customSheet.getCell('I36').value.result, 3);
  assert.ok(custom.worksheets.every(sheet => !sheet.name.includes('明細')));
  assert.equal(custom.getWorksheet(TASK_SHEET_NAME), undefined, 'custom dates do not include weekly tasks');
  const empty = await workbook(await writeTasksSheet(sourceBuffer, [], reportPeriod(period), 'wk6'));
  assert.equal(empty.getWorksheet(TASK_SHEET_NAME).getCell('A5').value, '沒有待處理事項');
  const literal = await workbook(await writeTasksSheet(sourceBuffer, [{ ...parentTask, name: '=1+1 <學生>', done: false, notes: '=2+2 & 備註' }], reportPeriod(period), 'wk6'));
  assert.equal(literal.getWorksheet(TASK_SHEET_NAME).getCell('D5').value, '=1+1 <學生>');
  assert.equal(literal.getWorksheet(TASK_SHEET_NAME).getCell('H5').value, '=2+2 & 備註', 'Excel notes stay literal text, not formulas');
  assert.equal((await exportFile({ ...customPeriod, dateFrom: '2026-09-24', dateTo: '2026-09-08' })).status, 400);
  const zipBomb = Buffer.from(sourceBuffer);
  const central = zipBomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zipBomb.writeUInt32LE(32 * 1024 * 1024, central + 24);
  assert.throws(() => checkArchive(zipBomb), /解壓/);
  await assert.rejects(openReport(week7Buffer, reportPeriod(forWeek(8))), /wk8/);
  if (qaDir) { await mkdir(qaDir, { recursive: true }); await writeFile(path.join(qaDir, 'week7-fixture.xlsx'), week7Buffer); await writeFile(path.join(qaDir, 'week8-fixture.xlsx'), week8Buffer); }
  if (process.argv.includes('--browser')) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      await context.addCookies(cookie.split('; ').map(part => ({ name: part.split('=')[0], value: part.slice(part.indexOf('=') + 1), url: base })));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/homework`);
      await page.locator('[data-view="class-analysis"]').click();
      assert.equal(await page.locator('#classAnalysisMode, #classAnalysisWeek, #classAnalysisScope, #exportSummary, #exportClassAnalysis, #weeklyReportFile, .report-version').count(), 0, 'class analysis has no weekly/export/upload controls');
      assert.equal(await page.locator('.main .filters .field').count(), 4, 'only year, class and two dates remain');
      assert.equal(await page.locator('#classAnalysisFrom').inputValue(), '2026-09-01');
      assert.equal(await page.locator('#classAnalysisFrom').getAttribute('readonly'), null);
      await page.locator('#classAnalysisFrom').fill('2026-09-08');
      await page.locator('#classAnalysisTo').fill('2026-09-24');
      const analysisResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/homework/class-analysis');
      await page.locator('#runClassAnalysis').click();
      const query = new URL((await analysisResponse).url()).searchParams;
      assert.equal(query.has('mode') || query.has('week'), false, 'class analysis reads date-range platform records, not Excel baselines');
      await page.locator('.analysis-total').waitFor();
      assert.match(await page.locator('.analysis-total').innerText(), /3/);
      const student = page.locator('.class-analysis-student').filter({ hasText: 'S002' });
      await student.locator('summary').click();
      assert.equal(await student.locator('.class-analysis-record-list').isVisible(), true, 'student records remain expandable');
      assert.equal(await student.locator('.made-up').count(), 1, 'caught-up records remain in class analysis');
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'class-analysis-desktop.png') });
      await page.locator('#classAnalysisFrom').fill('2026-09-25');
      assert.equal(await page.locator('#runClassAnalysis').isDisabled(), true, 'invalid date ranges cannot be submitted');
      await page.locator('#classAnalysisFrom').fill('2026-09-08');

      await page.locator('[data-view="summary-export"]').click();
      assert.equal(await page.locator('[data-view="summary-export"]').innerText(), '匯出總表');
      assert.equal(await page.locator('[data-view="summary-export"]').getAttribute('class'), 'active');
      assert.equal(await page.locator('#runClassAnalysis, .class-analysis-students, #classAnalysisYear').count(), 0, 'export is a separate page without class statistics');
      assert.equal(await page.locator('#summaryExportWeek option').first().getAttribute('value'), '6');
      assert.equal(await page.locator('#summaryExportFrom').getAttribute('readonly'), '');
      await page.locator('#summaryExportWeek').selectOption('6');
      await page.locator('.report-version').waitFor();
      assert.equal(await page.locator('#weeklyReportFile').count(), 0, 'Week 6 remains immutable');
      const baselineDownload = page.waitForEvent('download');
      await page.locator('#exportSummary').click();
      const originalFile = await baselineDownload;
      await originalFile.saveAs(path.join(temp, 'browser-baseline.xlsx'));
      assert.deepEqual(await readFile(path.join(temp, 'browser-baseline.xlsx')), sourceBuffer, 'new export page downloads the exact Week 6 file');
      await page.locator('#exportSummary:not([disabled])').waitFor();
      await page.locator('#summaryExportWeek').selectOption('9');
      await page.locator('.report-version').waitFor();
      assert.equal(await page.locator('.report-tasks, .report-task-done').count(), 0, 'no pending actions on the website');
      assert.equal(await page.locator('#summaryExportTo').inputValue(), '2026-10-30');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#exportSummary').click();
      const dl = await downloadPromise;
      assert.match(dl.suggestedFilename(), /wk9\.xlsx$/);
      await dl.saveAs(path.join(temp, 'browser-week9.xlsx'));
      await page.locator('#exportSummary:not([disabled])').waitFor();
      const downloaded = await readFile(path.join(temp, 'browser-week9.xlsx'));
      const actions9 = taskRows((await workbook(downloaded)).getWorksheet(TASK_SHEET_NAME));
      const pendingId = actions9[0].id;
      const uploadPath = path.join(temp, 'browser-upload.xlsx');
      await writeFile(uploadPath, await editTaskCells(downloaded, [{ id: pendingId, status: '已處理' }]));
      await page.locator('#weeklyReportFile').setInputFiles(uploadPath);
      await page.locator('#uploadWeeklyReport').click();
      await page.getByText('最新總表已儲存，下周會沿用此版本。').waitFor();
      assert.ok((await preview(9)).tasks.find(item => item.id === pendingId).done);
      assert.equal(await page.locator('.report-tasks, .report-task-done').count(), 0);
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'summary-export-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile controls fit');
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'summary-export-mobile.png') });
      await page.locator('#summaryExportMode').selectOption('custom');
      await page.locator('#summaryExportFrom').fill('2026-09-04');
      await page.locator('#summaryExportTo').fill('2026-09-24');
      await page.locator('#summaryExportScope').selectOption('class');
      await page.locator('#summaryExportClass').selectOption('P4');
      assert.equal(await page.locator('#weeklyReportFile, #summaryExportWeek, .report-tasks').count(), 0, 'custom export has no weekly actions or uploads');
      const customRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/homework/class-analysis/export');
      const customDownload = page.waitForEvent('download');
      await page.locator('#exportSummary').click();
      assert.deepEqual((await customRequest).postDataJSON(), { academicYear, dateFrom: '2026-09-04', dateTo: '2026-09-24', mode: 'custom', week: '9', scope: 'P4' });
      const customFile = await customDownload;
      await customFile.saveAs(path.join(temp, 'browser-custom.xlsx'));
      assert.ok((await workbook(await readFile(path.join(temp, 'browser-custom.xlsx')))).worksheets.every(sheet => sheet.name !== TASK_SHEET_NAME));
      await page.locator('#exportSummary:not([disabled])').waitFor();

      await page.locator('[data-view="class-analysis"]').click();
      assert.equal(await page.locator('#classAnalysisFrom').inputValue(), '2026-09-08', 'export date settings do not alter class analysis');
      assert.equal(await page.locator('#classAnalysisTo').inputValue(), '2026-09-24');
      assert.equal(await page.locator('#classAnalysisClass').inputValue(), 'P4');
      await page.locator('#runClassAnalysis').click();
      await page.locator('.analysis-total').waitFor();
      assert.match(await page.locator('.analysis-total').innerText(), /3/);
      assert.equal(await page.locator('#weeklyReportFile, #summaryExportWeek, #exportSummary, .report-tasks').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'class analysis still fits mobile');
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'class-analysis-mobile.png') });
      await page.locator('[data-view="summary-export"]').click();
      assert.equal(await page.locator('#summaryExportMode').inputValue(), 'custom', 'export selections survive switching pages');
      assert.equal(await page.locator('#summaryExportFrom').inputValue(), '2026-09-04');
      assert.equal(await page.locator('#summaryExportScope').inputValue(), 'class');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
    console.log('Browser: simple class analysis, separate export page, independent filters, original/weekly/custom downloads, Excel-only actions, uploads and mobile fit passed.');
  }
  console.log('Excel: immutable Week 6, exact fonts/layout, independent name/count colours, all detention marks, legacy regeneration, incremental weeks, all crossed tiers, no duplicate actions, late records, persistence and access controls passed.');
} catch (error) { console.error(logs.slice(-3000)); throw error; }
finally {
  await stop();
  if (!temp.startsWith(path.join(tmpdir(), 'buio-homework-excel-'))) throw new Error('Invalid fixture cleanup path');
  await rm(temp, { recursive: true, force: true });
}
