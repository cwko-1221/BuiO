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
const { reportPeriod, buildExport } = require('../homework-app/lib/excel-export');
const root = path.resolve(import.meta.dirname, '..');
const temp = await mkdtemp(path.join(tmpdir(), 'buio-homework-excel-'));
const qaDir = process.env.HOMEWORK_EXCEL_QA_DIR;
const port = 3146;
const base = `http://127.0.0.1:${port}`;
const academicYear = '2026-27';
const user = (id, name, className, classNo) => ({ studentid: id, name, role: className ? 'student' : 'teacher', classname: className || '', classno: classNo,
  passwordhash: bcrypt.hashSync('123456', 4), chinesegroup: 'A', englishgroup: 'A', mathgroup: 'A', language: 'zh-HK' });
const users = [user('T001', '測試老師'), user('S002', '王美賢 Akbar Adeena', 'P4', 2), user('S030', '三十號同學', 'P4', 30),
  user('S000', '未編號同學', 'P4', null), user('S004', '零欠交同學', 'P4', 4), user('S101', '一年級同學', 'P1', 1),
  user('S501', '五年級同學', 'P5', 1), user('S601', '六年級同學', 'P6', 1)];
let recordId = 0;
const record = (date, statuses, className = 'P4', amount = 1) => ({ id: ++recordId, academicYear, className, subject: 'music', date,
  homeworks: Array.from({ length: amount }, (_, index) => ({ id: `hw-${recordId}-${index}`, title: index ? `音樂功課 ${index}` : '=SUM(A1:A2)', statuses })),
  createdBy: 'T001', submittedAt: new Date().toISOString() });
const missing = (studentId, madeUp = false) => ({ studentId, status: 'missing', madeUp });
const records = [
  record('2026-09-04', [missing('S002')]), record('2026-09-07', [{ studentId: 'S002', status: 'absent' }]),
  record('2026-09-08', [missing('S002', true), missing('S030')]),
  record('2026-09-24', [missing('S030'), { studentId: 'S002', status: 'complete' }]),
  record('2026-09-25', [missing('S030')]), record('2026-10-09', [missing('S002')]),
  record('2026-10-10', [missing('S002')]), record('2026-10-16', [missing('S000')]), record('2026-10-17', [missing('S002')]),
  record('2026-09-08', [missing('S101')], 'P1', 5), record('2026-09-08', [missing('S501')], 'P5', 8), record('2026-09-08', [missing('S601')], 'P6', 10),
];
const dbFile = path.join(temp, 'fixture.json');
await writeFile(dbFile, JSON.stringify({ users, platformSettings: { currentAcademicYear: academicYear },
  studentAcademicYears: users.filter(student => student.role === 'student').map(student => ({ academicYear, studentId: student.studentid,
    name: student.name, className: student.classname, classNo: student.classno, chineseGroup: 'A', englishGroup: 'A', mathGroup: 'A' })),
  homeworkRecords: records, homeworkMonitors: [], _homeworkRecordId: recordId, _homeworkMonitorId: 0, studentStats: [], questionLogs: [], _logId: 0 }));
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: dbFile,
  SUPABASE_DB_URL: '', NODE_ENV: 'development', ADMIN_PASSWORD: 'fixture-admin' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
const workbook = async buffer => { const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer); return book; };
const login = async studentId => {
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, password: '123456' }) });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
};
let cookie;
const period = { academicYear, mode: 'week', week: '7', dateFrom: '2026-09-04', dateTo: '2026-10-16', scope: 'all' };
const exportFile = async (values, session = cookie) => {
  return fetch(`${base}/api/homework/class-analysis/export`, { method: 'POST',
    headers: { Cookie: session || '', 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
};
const assertTemplateLayout = (sheet, reference) => {
  assert.deepEqual(sheet.views, reference.views, 'template zoom and normal, unfrozen view are preserved');
  assert.deepEqual(sheet.properties, reference.properties, 'default row/column dimensions are preserved');
  assert.deepEqual(sheet.pageSetup, reference.pageSetup, 'paper size, margins, scale and print settings are preserved');
  for (let col = 1; col <= 14; col++) {
    assert.equal(sheet.getColumn(col).width, reference.getColumn(col).width, 'every column width, including the legend, is preserved');
    assert.deepEqual(sheet.getColumn(col).style, reference.getColumn(col).style);
  }
  for (let row = 1; row <= reference.rowCount; row++) {
    assert.equal(sheet.getRow(row).height, reference.getRow(row).height, `row ${row} is not auto-sized`);
    for (let col = 1; col <= 14; col++) {
      const { fill: actualFill, ...actualStyle } = sheet.getCell(row, col).style;
      const { fill: expectedFill, ...expectedStyle } = reference.getCell(row, col).style;
      assert.deepEqual(actualStyle, expectedStyle, `${sheet.name}!${sheet.getCell(row, col).address} keeps its exact font, size, borders, alignment and number format`);
      if (row <= 4 || col === 1 || col === 14) assert.deepEqual(actualFill, expectedFill);
    }
  }
};
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    if (attempt > 60) throw new Error(logs || 'Server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(weekEnd('2026-09-04', 6), '2026-10-09');
  assert.equal(weekEnd('2026-09-04', 7), '2026-10-16');
  assert.deepEqual(defaultWeekPeriod(academicYear, '2026-10-11'), { dateFrom: '2026-09-04', dateTo: '2026-10-09', week: '6', mode: 'week' });
  assert.throws(() => reportPeriod({ ...period, dateTo: '2026-10-09' }), /不一致/);
  cookie = await login('T001');
  assert.equal((await exportFile(period, '')).status, 401, 'login is required');
  assert.equal((await exportFile(period, await login('S002'))).status, 403, 'student cannot export');
  const sourceBuffer = await readFile(path.join(root, 'homework-app/templates/summary-t1.xlsx'));
  const source = await workbook(sourceBuffer);
  const response = await exportFile(period);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  assert.match(decodeURIComponent(response.headers.get('content-disposition')), /wk7\.xlsx/);
  const week7Buffer = Buffer.from(await response.arrayBuffer());
  const week7 = await workbook(week7Buffer);
  const sourceZip = await JSZip.loadAsync(sourceBuffer);
  const exportedZip = await JSZip.loadAsync(week7Buffer);
  const originalStyles = await sourceZip.file('xl/styles.xml').async('string');
  const exportedStyles = await exportedZip.file('xl/styles.xml').async('string');
  for (const section of ['fonts', 'fills', 'borders', 'cellStyleXfs', 'cellStyles']) {
    const pattern = new RegExp(`<${section}\\b[^>]*>[\\s\\S]*?</${section}>`);
    assert.equal(exportedStyles.match(pattern)?.[0], originalStyles.match(pattern)?.[0], `${section} is retained verbatim, including the default font`);
  }
  for (const name of Object.keys(sourceZip.files).filter(name => /^xl\/(worksheets\/|printerSettings\/|theme\/|sharedStrings\.xml)/.test(name) && !sourceZip.files[name].dir)) {
    assert.deepEqual(await exportedZip.file(name).async('nodebuffer'), await sourceZip.file(name).async('nodebuffer'), `${name} is preserved byte-for-byte`);
  }
  assert.equal(exportedZip.file('xl/calcChain.xml'), null, 'old formula chain is removed so new totals recalculate');
  assert.ok(week7.getWorksheet('wk7'), 'week7 is added');
  const summary = week7.getWorksheet('wk7');
  assert.deepEqual(week7.worksheets.map(sheet => sheet.name), [...source.worksheets.map(sheet => sheet.name), 'wk7'], 'only a summary is added, with no detail sheet');
  assertTemplateLayout(summary, source.getWorksheet('wk6'));
  assert.deepEqual([...summary.model.merges].sort(), [...source.getWorksheet('wk6').model.merges].sort(), 'new week keeps merged titles and grade headers');
  assert.equal(summary.getCell('A3').value, '欠交功課紀錄 (4/9/2026-16/10/2026)');
  assert.equal(summary.getCell('H6').value, '王美賢\nAdeena', 'matching template name is kept');
  assert.equal(summary.getCell('I6').value, 4, 'all subjects including caught-up work are counted');
  assert.equal(summary.getCell('I34').value, 3, 'student 30 is not overwritten by totals');
  assert.equal(summary.getCell('I35').value, 1, 'unnumbered student is included');
  assert.deepEqual(summary.getCell('I36').value, { formula: 'SUM(I5:I35)', result: 8 });
  assert.equal(summary.getCell('I8').value, null, 'zero counts stay blank as in the template');
  assert.equal(summary.getCell('H8').value, '零欠交同學', 'zero-missing student remains in roster');
  assert.equal(summary.getCell('H36').value, null, 'no new total label is added');
  assert.deepEqual(summary.getCell('I36').style, source.getWorksheet('wk6').getCell('I34').style, 'extended totals use the exact template style without added bold text');
  assert.deepEqual(summary.getCell('C5').fill, source.getWorksheet('wk6').getCell('N5').fill);
  assert.deepEqual(summary.getCell('K5').fill, source.getWorksheet('wk6').getCell('N6').fill);
  assert.deepEqual(summary.getCell('M5').fill, source.getWorksheet('wk6').getCell('N7').fill);
  for (const original of source.worksheets) {
    const exported = week7.getWorksheet(original.name);
    assert.ok(exported);
    assert.deepEqual([...exported.model.merges].sort(), [...original.model.merges].sort());
    assert.deepEqual(exported.pageSetup, original.pageSetup);
    for (let row = 1; row <= original.rowCount; row++) for (let col = 1; col <= original.columnCount; col++) {
      assert.deepEqual(exported.getCell(row, col).value, original.getCell(row, col).value, `${original.name} value is preserved`);
      assert.deepEqual(exported.getCell(row, col).style, original.getCell(row, col).style, `${original.name} style is preserved`);
    }
  }
  const normalReports = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(className => ({ className, totalMissing: 2,
    rows: [{ id: `${className}-2`, name: className === 'P4' ? '王美賢 Akbar Adeena' : className === 'P1' ? '<測試 & 同學>' : className === 'P2' ? '=1+1' : '測試同學', className, classNo: 2, missingCount: 2 }] }));
  const normal = await workbook((await buildExport({ period: reportPeriod(period), reports: normalReports })).buffer);
  const normalSummary = normal.getWorksheet('wk7');
  assertTemplateLayout(normalSummary, source.getWorksheet('wk6'));
  assert.equal(normalSummary.rowCount, source.getWorksheet('wk6').rowCount, 'normal rosters keep the original total row and table size');
  assert.equal(normalSummary.getCell('I34').value.result, 2);
  assert.equal(normalSummary.getCell('A34').value, source.getWorksheet('wk6').getCell('A34').value);
  assert.equal(normalSummary.getCell('B6').value, '<測試 & 同學>', 'XML-sensitive names remain literal text');
  assert.equal(normalSummary.getCell('D6').value, '=1+1', 'names cannot become formulas');
  const customResponse = await exportFile({ ...period, mode: 'custom', scope: 'P4', dateFrom: '2026-09-08', dateTo: '2026-09-24' });
  assert.equal(customResponse.status, 200);
  const custom = await workbook(Buffer.from(await customResponse.arrayBuffer()));
  const customSheet = custom.getWorksheet('自選20260908-20260924_P4');
  assertTemplateLayout(customSheet, source.getWorksheet('wk6'));
  assert.ok(custom.worksheets.every(sheet => !sheet.name.includes('明細')));
  assert.equal(customSheet.getCell('I6').value, 1);
  assert.equal(customSheet.getCell('I34').value, 2, 'both boundary dates are included');
  assert.equal(customSheet.getCell('I36').value.result, 3);
  assert.equal(customSheet.getCell('B5').value, null, 'unselected classes do not retain stale template counts');
  const analysis = await fetch(`${base}/api/homework/class-analysis?academicYear=2026-27&className=P4&dateFrom=2026-09-08&dateTo=2026-09-24`, { headers: { Cookie: cookie } }).then(result => result.json());
  assert.equal(analysis.totalMissing, customSheet.getCell('I36').value.result, 'Excel reconciles to displayed class analysis');
  const week6 = await exportFile({ ...period, week: '6', dateTo: '2026-10-09', scope: 'P4' });
  assert.equal((await workbook(Buffer.from(await week6.arrayBuffer()))).getWorksheet('wk6_P4').getCell('I36').value.result, 6, 'Week6 excludes Week7 records');
  const appended = await exportFile({ ...period, week: '8', dateTo: '2026-10-23' });
  assert.equal(appended.status, 200);
  const week8 = await workbook(Buffer.from(await appended.arrayBuffer()));
  assert.equal(week8.getWorksheet('wk8').getCell('I36').value.result, 9, 'Week8 adds the next period');
  assert.ok(week8.worksheets.every(sheet => !sheet.name.includes('明細')));
  const repeated = await exportFile({ ...period, week: '6', dateTo: '2026-10-09' });
  assert.equal((await workbook(Buffer.from(await repeated.arrayBuffer()))).worksheets.filter(sheet => sheet.name === 'wk6').length, 1, 'an existing week is updated once');
  assert.equal((await exportFile({ ...period, mode: 'custom', dateFrom: '2026-09-24', dateTo: '2026-09-08' })).status, 400);
  assert.equal((await exportFile({ ...period, week: '0' })).status, 400);
  assert.equal((await exportFile({})).status, 400);
  if (qaDir) { await mkdir(qaDir, { recursive: true }); await writeFile(path.join(qaDir, 'week7-fixture.xlsx'), week7Buffer); }

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
      assert.equal(await page.locator('#classAnalysisTemplate, #clearExportTemplate, input[type="file"]').count(), 0, 'template upload controls are removed');
      assert.equal(await page.getByText('上載上一份總表', { exact: false }).count(), 0);
      await page.locator('#classAnalysisWeek').selectOption('7');
      assert.equal(await page.locator('#classAnalysisFrom').inputValue(), '2026-09-04');
      assert.equal(await page.locator('#classAnalysisTo').inputValue(), '2026-10-16');
      assert.equal(await page.locator('#classAnalysisTo').getAttribute('readonly'), '');
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#exportClassAnalysis').click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /wk7\.xlsx$/);
      await download.saveAs(path.join(temp, 'browser.xlsx'));
      const browserBook = await workbook(await readFile(path.join(temp, 'browser.xlsx')));
      assert.equal(browserBook.getWorksheet('wk7').getCell('I36').value.result, 8);
      assertTemplateLayout(browserBook.getWorksheet('wk7'), source.getWorksheet('wk6'));
      assert.ok(browserBook.worksheets.every(sheet => !sheet.name.includes('明細')));
      await page.locator('#classAnalysisMode').selectOption('custom');
      await page.locator('#classAnalysisFrom').fill('2026-09-08');
      await page.locator('#classAnalysisTo').fill('2026-09-24');
      await page.locator('#classAnalysisScope').selectOption('class');
      await page.locator('#runClassAnalysis').click();
      await page.locator('.analysis-total').waitFor();
      assert.match(await page.locator('.analysis-total').innerText(), /3/);
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'desktop.png'), fullPage: true });
      const customDownloadPromise = page.waitForEvent('download');
      await page.locator('#exportClassAnalysis').click();
      const customDownload = await customDownloadPromise;
      assert.match(customDownload.suggestedFilename(), /自選20260908-20260924_P4/);
      await customDownload.saveAs(path.join(temp, 'browser-custom.xlsx'));
      assert.equal((await workbook(await readFile(path.join(temp, 'browser-custom.xlsx')))).getWorksheet('自選20260908-20260924_P4').getCell('I36').value.result, 3);
      await page.locator('#classAnalysisMode').selectOption('week');
      await page.locator('#classAnalysisFrom').fill('2026-09-04');
      await page.locator('#classAnalysisWeek').selectOption('8');
      const nextWeekDownloadPromise = page.waitForEvent('download');
      await page.locator('#exportClassAnalysis').click();
      const nextWeekDownload = await nextWeekDownloadPromise;
      await nextWeekDownload.saveAs(path.join(temp, 'browser-week8.xlsx'));
      const nextWeek = await workbook(await readFile(path.join(temp, 'browser-week8.xlsx')));
      assert.ok(nextWeek.getWorksheet('wk8_P4'));
      assert.ok(nextWeek.worksheets.every(sheet => !sheet.name.includes('明細')));
      await page.setViewportSize({ width: 390, height: 844 });
      if (qaDir) await page.screenshot({ path: path.join(qaDir, 'mobile.png'), fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile controls fit');
      assert.deepEqual(errors, [], 'no browser runtime errors');
    } finally { await browser.close(); }
    console.log('Desktop/mobile Excel downloads and week/custom selection passed, with no template upload or detail sheets.');
  }
  console.log('Homework Excel tests passed: exact template fonts/layout, summary-only sheets, dates, counts, permissions and zero/unnumbered/class-30 students.');
} catch (error) {
  console.error(logs.slice(-4000));
  throw error;
} finally {
  server.kill('SIGTERM');
  if (server.exitCode == null) await new Promise(resolve => server.once('exit', resolve));
  if (!temp.startsWith(path.join(tmpdir(), 'buio-homework-excel-'))) throw new Error('Invalid fixture cleanup path');
  await rm(temp, { recursive: true, force: true });
}
