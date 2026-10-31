'use strict';

// Load the Excel module at server boot, before classrooms accept connections.
const ExcelJS = require('exceljs');
const reportWork = require('./report-work').createReportWork();
const { readFile } = require('node:fs/promises');
const { createHash } = require('node:crypto');
const homeworkRepo = require('../repositories/homework.repo');
const reportRepo = require('../repositories/reports.repo');
const { GRADES, TEMPLATE, cloneSheet, isSummarySheet, reportPeriod } = require('./excel-export');
const { buildClassAnalysis } = require('./class-analysis');
const { writeTemplate } = require('./xlsx-template');
const { writeTasksSheet, applyTaskSheet, TASK_SHEET_NAME } = require('./report-tasks-sheet');
const DAY = 86400000;
const ACTIONS = [{ threshold: 5, action: 'parent', legend: 'N5' }, { threshold: 8, action: 'detention', legend: 'N6' }, { threshold: 10, action: 'demerit', legend: 'N7' }];
const invalid = message => Object.assign(new Error(message), { status: 400 });
const fingerprint = buffer => createHash('sha256').update(buffer).digest('hex');
const cleanName = name => {
  const label = String(name || '').replace(/已留堂\s*[1-4]\s*次/g, '').trim();
  return label.match(/[\p{Script=Han}]+/u)?.[0] || label.toLowerCase().replace(/[^a-z]/g, '');
};
const sameName = (a, b) => {
  const name = cleanName(a);
  if (!name) return false;
  return name === cleanName(b) || (!/[\p{Script=Han}]/u.test(a) && String(b).toLowerCase().replace(/[^a-z]/g, '').includes(name));
};
const fg = fill => JSON.stringify(fill?.fgColor || {});
const count = value => Number(value?.result ?? value ?? 0);
const datesInTitle = title => [...String(title).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)].map(([, d, m, y]) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);

// Inspect ZIP directory sizes before a user-supplied workbook is decompressed.
function checkArchive(buffer) {
  if (buffer.length > 8 * 1024 * 1024) throw invalid('Excel 不能超過 8 MB。');
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw invalid('請上載有效的 .xlsx 檔案。');
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let total = 0;
  if (entries > 1000) throw invalid('Excel 內容過大。');
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw invalid('Excel 檔案格式不正確。');
    const size = buffer.readUInt32LE(offset + 24);
    total += size;
    if (size > 16 * 1024 * 1024 || total > 32 * 1024 * 1024) throw invalid('Excel 解壓後內容過大。');
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

async function openReport(buffer, period) {
  const ExcelJS = require('exceljs');
  checkArchive(buffer);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer); } catch { throw invalid('未能讀取 Excel，請上載有效的 .xlsx 檔案。'); }
  const source = book.worksheets.find(sheet => new RegExp(`^wk\\s*${period.week}$`, 'i').test(sheet.name) && isSummarySheet(sheet));
  if (!source) throw invalid(`Excel 必須包含 wk${period.week} 的 P1–P6 總表。`);
  const warnings = ACTIONS.map(item => source.getCell(item.legend).fill);
  if (warnings.some(fill => fill?.pattern !== 'solid' || fg(fill) === '{}') || new Set(warnings.map(fg)).size !== 3) throw invalid('請保留總表右側 5／8／10 次的三種圖例顏色。');
  const [dateFrom, dateTo] = datesInTitle(source.getCell('A3').value);
  if (dateFrom !== period.dateFrom || dateTo !== period.dateTo) throw invalid('Excel 日期標題與所選周次不一致。');
  const yearLabel = String(source.getCell('A2').value);
  if (!yearLabel.includes(`${period.academicYear.slice(2, 4)}/${period.academicYear.slice(-2)}`)) throw invalid('Excel 的學年與所選學年不一致。');
  if (source.rowCount > 600) throw invalid('總表學生行數過多。');
  let totalRow = 0;
  for (let r = 5; r <= source.rowCount; r++) if (GRADES.some((_, index) => source.getCell(r, 3 + index * 2).value?.formula)) totalRow = r;
  if (totalRow < 6) throw invalid('找不到總表的總計公式行。');
  for (let r = 5; r < totalRow; r++) for (let c = 2; c <= 12; c += 2) {
    if (!source.getCell(r, c).value) continue;
    const n = count(source.getCell(r, c + 1).value);
    if (!Number.isInteger(n) || n < 0 || n > 100000) throw invalid('每位學生的欠交數必須是非負整數。');
  }
  return { book, source, totalRow };
}

function detentionMarker(sheet, row, column, nameOnly = false) {
  const label = String(sheet.getCell(row, column).value || '').match(/已留堂\s*([1-4])\s*次/);
  if (label) return Number(label[1]);
  const colors = (nameOnly ? [column] : [column, column + 1]).map(c => fg(sheet.getCell(row, c).fill));
  for (let r = 5; r <= Math.min(30, sheet.rowCount); r++) {
    const marker = String(sheet.getCell(r, 14).value || '').match(/已留堂\s*([1-4])\s*次/);
    const fill = sheet.getCell(r, 14).fill;
    if (marker && fill?.pattern === 'solid' && fg(fill) !== '{}' && colors.includes(fg(fill))) return Number(marker[1]);
  }
  return 0;
}

function entriesFor(source, totalRow, rosters) {
  const entries = [];
  for (let r = 5; r < totalRow; r++) for (let grade = 0; grade < 6; grade++) {
    const column = 2 + grade * 2;
    const displayName = String(source.getCell(r, column).value || '');
    if (!displayName.trim()) continue;
    const className = GRADES[grade];
    const classNo = Number(source.getCell(r, 1).value) || null;
    const candidates = rosters[grade];
    const student = candidates.find(item => item.classNo === classNo && sameName(displayName, item.name))
      || candidates.find(item => sameName(displayName, item.name));
    entries.push({ row: r, column, className, classNo, displayName, id: student?.id || null,
      key: student?.id || `${className}:${classNo || r}:${cleanName(displayName)}`, name: student?.name || displayName.replaceAll('\n', ' '),
      previousCount: count(source.getCell(r, column + 1).value), detention: detentionMarker(source, r, column) });
  }
  return entries;
}

function nextStatus(source, entry, nextCount) {
  const previousFill = source.getCell(entry.row, entry.column).fill;
  const previousCountFill = source.getCell(entry.row, entry.column + 1).fill;
  const oldLevel = entry.detention ? ACTIONS.filter(item => entry.previousCount >= item.threshold).length
    : ACTIONS.findIndex(item => fg(source.getCell(item.legend).fill) === fg(previousFill)) + 1;
  const nextLevel = ACTIONS.filter(item => nextCount >= item.threshold).length;
  // Without a new tier, keep each cell's own style (name and count may differ).
  if (entry.detention && nextLevel <= oldLevel) return { fill: previousCountFill, nameFill: previousFill, actions: [] };
  const fill = nextLevel ? source.getCell(ACTIONS[nextLevel - 1].legend).fill : previousFill;
  // A name records completed detentions independently of the current count tier.
  const nameFill = detentionMarker(source, entry.row, entry.column, true) ? previousFill : fill;
  const changed = fg(previousFill) !== fg(nameFill) || fg(previousCountFill) !== fg(fill);
  return { fill, nameFill, actions: changed && nextLevel > oldLevel ? ACTIONS.slice(oldLevel, nextLevel) : [] };
}

function previousNameFill(source, entry) {
  if (!source) return;
  for (let row = 5; row <= source.rowCount; row++) {
    if ((Number(source.getCell(row, 1).value) || null) !== entry.classNo
      || !sameName(String(source.getCell(row, entry.column).value || ''), entry.displayName)) continue;
    if (detentionMarker(source, row, entry.column, true)) return source.getCell(row, entry.column).fill;
    return;
  }
}

async function inputs(period) {
  const baselinePeriod = reportPeriod({ ...period, week: 6, dateTo: new Date(Date.parse(`${period.dateFrom}T00:00:00Z`) + 35 * DAY).toISOString().slice(0, 10) });
  const defaultBuffer = await readFile(TEMPLATE);
  const baseline = await openReport(defaultBuffer, baselinePeriod);
  const state = await reportRepo.getState(period.academicYear);
  const rosters = await Promise.all(GRADES.map(grade => homeworkRepo.listClassStudents(period.academicYear, grade)));
  const records = await homeworkRepo.listRecords({ academicYear: period.academicYear,
    dateFrom: new Date(Date.parse(`${baselinePeriod.dateTo}T00:00:00Z`) + DAY).toISOString().slice(0, 10), dateTo: period.dateTo });
  const current = Object.fromEntries(GRADES.flatMap((grade, i) => buildClassAnalysis(rosters[i], records.filter(record => record.className === grade)).rows.map(row => [row.id, row])));
  const version = state.versions.filter(item => item.week <= period.week).sort((a, b) => b.week - a.week)[0];
  const buffer = period.week === 6 ? defaultBuffer : version ? Buffer.from(version.file, 'base64') : defaultBuffer;
  const opened = period.week === 6 || !version ? baseline : await openReport(buffer, { ...period, ...version.period });
  return { ...opened, state, rosters, current, version: period.week === 6 ? null : version, buffer };
}

async function prepare(period) {
  const data = await inputs(period);
  const { book, source, state, rosters, current, version } = data;
  // Repair only platform-generated reports affected by the old two-cell paint.
  // Never infer changes to a teacher-uploaded version or restore older marks
  // past the immediately preceding weekly sheet.
  const previousSource = version?.kind === 'generated' ? book.worksheets
    .filter(sheet => isSummarySheet(sheet) && /^wk\s*\d+$/i.test(sheet.name)
      && Number(sheet.name.match(/\d+/)[0]) < version.week)
    .sort((a, b) => Number(b.name.match(/\d+/)[0]) - Number(a.name.match(/\d+/)[0]))[0] : null;
  const entries = entriesFor(source, data.totalRow, rosters);
  const historical = period.week > 6 && state.versions.some(item => item.week > period.week) && version?.week === period.week;
  let totalRow = data.totalRow;
  const seen = new Set(entries.map(entry => entry.id).filter(Boolean));
  const occupied = new Set(entries.map(entry => `${entry.row}:${entry.column}`));
  const rowNumbers = new Map(entries.map(entry => [entry.row, entry.classNo]));
  if (period.week > 6 && !historical) for (let grade = 0; grade < 6; grade++) for (const student of rosters[grade]) {
    if (seen.has(student.id) || !current[student.id]?.missingCount) continue;
    const column = 2 + grade * 2;
    const candidateRow = Number.isInteger(student.classNo) && student.classNo > 0 ? 4 + student.classNo : 0;
    const reusable = candidateRow >= 5 && candidateRow < totalRow && !occupied.has(`${candidateRow}:${column}`)
      && (candidateRow < data.totalRow || rowNumbers.get(candidateRow) === student.classNo);
    const row = reusable ? candidateRow : totalRow++;
    occupied.add(`${row}:${column}`);
    rowNumbers.set(row, student.classNo || null);
    entries.push({ ...student, row, column, displayName: student.name, key: student.id, previousCount: 0, detention: 0, added: true });
  }
  const candidates = [];
  for (const entry of entries) {
    const observed = current[entry.id]?.missingCount || 0;
    entry.missingCount = period.week === 6 || historical ? entry.previousCount : Math.max(0, entry.previousCount + observed - (version?.observed?.[entry.id] || 0));
    entry.missingRecords = current[entry.id]?.missingRecords || [];
    if (period.week === 6 || historical) {
      entry.fill = source.getCell(entry.row, entry.column + 1).fill;
      entry.nameFill = source.getCell(entry.row, entry.column).fill;
      continue;
    }
    const reached = ACTIONS.filter(item => entry.missingCount >= item.threshold);
    const status = entry.added
      ? { fill: reached.length ? source.getCell(reached.at(-1).legend).fill : { type: 'pattern', pattern: 'none' }, actions: reached }
      : nextStatus(source, entry, entry.missingCount);
    entry.fill = status.fill;
    entry.nameFill = status.nameFill || status.fill;
    if (!entry.added && fg(source.getCell(entry.row, entry.column).fill) === fg(source.getCell(entry.row, entry.column + 1).fill)
      && ACTIONS.some(action => fg(source.getCell(action.legend).fill) === fg(source.getCell(entry.row, entry.column).fill))) {
      entry.nameFill = previousNameFill(previousSource, entry) || entry.nameFill;
    }
    for (const action of status.actions) candidates.push({ id: fingerprint(`${period.academicYear}|${entry.key}|${action.threshold}`),
      academicYear: period.academicYear, studentId: entry.id, studentKey: entry.key, name: entry.name, className: entry.className,
      classNo: entry.classNo, week: period.week, count: entry.missingCount, threshold: action.threshold, action: action.action, done: false });
  }
  const rowsByClass = GRADES.map(className => ({ className, rows: entries.filter(entry => entry.className === className),
    totalMissing: entries.filter(entry => entry.className === className).reduce((sum, entry) => sum + entry.missingCount, 0) }));
  return { ...data, period, entries, candidates, reports: rowsByClass, templateTotalRow: data.totalRow, totalRow };
}

function publicState(state) {
  return { revision: state.revision,
    versions: state.versions.map(({ week, period, kind, savedAt, savedBy }) => ({ week, period, kind, savedAt, savedBy })).sort((a, b) => b.week - a.week),
    tasks: state.tasks };
}

async function preview(period, className) {
  const result = await reportWork.preview(JSON.stringify(period), () => prepare(period));
  const report = result.reports.find(item => item.className === className);
  const tasks = [...result.state.tasks];
  for (const candidate of result.candidates) if (!tasks.some(task => task.id === candidate.id)) tasks.push({ ...candidate, preview: true });
  return { ...report, ...publicState(result.state), tasks, baselineWeek: result.version?.week || 6 };
}

async function generate(period, userId) {
  const data = await prepare(period);
  if (period.week === 6) return { buffer: data.buffer, filename: '總表 T1.xlsx', state: publicState(data.state) };
  if (data.state.versions.some(item => item.week > period.week)) {
    const saved = data.state.versions.find(item => item.week === period.week);
    if (!saved) throw invalid('已有較新周次，不能補建較早周次。');
    const original = Buffer.from(saved.file, 'base64');
    const buffer = data.book.getWorksheet(TASK_SHEET_NAME) ? original : await writeTasksSheet(original, data.state.tasks, period, data.source.name);
    return { buffer, filename: `欠交功課_${period.academicYear}_wk${period.week}.xlsx`, state: publicState(data.state) };
  }
  const summary = cloneSheet(data.book, data.source, `wk${period.week}`);
  summary.getCell('A3').value = `欠交功課紀錄 (${period.dateFrom.split('-').reverse().map(Number).join('/')}-${period.dateTo.split('-').reverse().map(Number).join('/')})`;
  if (data.totalRow !== data.templateTotalRow) for (let c = 1; c <= 13; c++) summary.getCell(data.templateTotalRow, c).value = null;
  for (const entry of data.entries) {
    if (entry.added) {
      for (let c = 1; c <= 13; c++) if (entry.row >= data.templateTotalRow) summary.getCell(entry.row, c).style = structuredClone(data.source.getCell(5, c).style);
      summary.getCell(entry.row, 1).value = entry.classNo || '—';
      summary.getCell(entry.row, entry.column).value = entry.displayName;
      summary.getRow(entry.row).height = data.source.getRow(5).height;
    }
    if (entry.missingCount !== entry.previousCount || entry.added) summary.getCell(entry.row, entry.column + 1).value = entry.missingCount || null;
    for (const [column, fill] of [[entry.column, entry.nameFill], [entry.column + 1, entry.fill]])
      if (entry.added || fg(fill) !== fg(data.source.getCell(entry.row, column).fill)) summary.getCell(entry.row, column).fill = structuredClone(fill);
  }
  if (data.totalRow !== data.templateTotalRow) {
    for (let c = 1; c <= 13; c++) {
      summary.getCell(data.totalRow, c).style = structuredClone(data.source.getCell(data.templateTotalRow, c).style);
      summary.getCell(data.totalRow, c).value = null;
    }
    summary.getRow(data.totalRow).height = data.source.getRow(data.templateTotalRow).height;
  }
  for (let grade = 0; grade < 6; grade++) {
    const column = 3 + grade * 2;
    if (!data.source.getCell(data.templateTotalRow, column).value?.formula) continue;
    summary.getCell(data.totalRow, column).value = { formula: `SUM(${summary.getColumn(column).letter}5:${summary.getColumn(column).letter}${data.totalRow - 1})`, result: data.reports[grade].totalMissing };
  }
  const now = new Date().toISOString();
  for (const candidate of data.candidates) if (!data.state.tasks.some(task => task.id === candidate.id)) data.state.tasks.push({ ...candidate, createdAt: now });
  const summaryBuffer = await writeTemplate({ templateBuffer: data.buffer, source: data.source, summary, totalRow: data.totalRow, templateTotalRow: data.templateTotalRow });
  const buffer = await writeTasksSheet(summaryBuffer, data.state.tasks, period, summary.name);
  const snapshot = { week: period.week, period, kind: 'generated', savedAt: now, savedBy: userId, hash: fingerprint(buffer), file: buffer.toString('base64'),
    observed: Object.fromEntries(Object.entries(data.current).map(([id, row]) => [id, row.missingCount])) };
  data.state.versions = data.state.versions.filter(item => item.week !== period.week).concat(snapshot);
  const saved = await reportRepo.saveState(period.academicYear, data.state, data.state.revision);
  return { buffer, filename: `欠交功課_${period.academicYear}_wk${period.week}.xlsx`, state: publicState(saved) };
}

async function upload(period, buffer, userId, expectedRevision) {
  if (period.week === 6) throw invalid('第 6 周是原始基準檔，不能覆蓋。請上載第 7 周或之後的版本。');
  const data = await inputs(period);
  if (Number(expectedRevision) !== data.state.revision) throw Object.assign(new Error('總表已更新，請重新載入後再上載。'), { status: 409 });
  if (data.state.versions.some(item => item.week > period.week)) throw invalid('已有較新周次，不能以較早版本取代。');
  const opened = await openReport(buffer, period);
  applyTaskSheet(opened.book, data.state.tasks, userId);
  const entries = entriesFor(opened.source, opened.totalRow, data.rosters);
  for (const entry of entries) if (entry.detention) for (const task of data.state.tasks) {
    if (task.studentKey === entry.key && task.action === 'detention' && !task.done) Object.assign(task, { done: true, doneBy: userId, doneAt: new Date().toISOString(), resolvedByUpload: true });
  }
  data.state.versions = data.state.versions.filter(item => item.week !== period.week).concat({ week: period.week, period, kind: 'uploaded',
    savedAt: new Date().toISOString(), savedBy: userId, hash: fingerprint(buffer), file: buffer.toString('base64'),
    // A late submission after the teacher downloaded this report must still be
    // added next week, not silently absorbed into the upload's watermark.
    observed: data.version?.week === period.week ? data.version.observed : Object.fromEntries(Object.entries(data.current).map(([id, row]) => [id, row.missingCount])) });
  return publicState(await reportRepo.saveState(period.academicYear, data.state, data.state.revision));
}

module.exports = { preview, generate: (...args) => reportWork.run(() => generate(...args)),
  upload: (...args) => reportWork.run(() => upload(...args)), openReport, checkArchive, nextStatus };
