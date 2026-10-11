'use strict';

const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { writeTemplate } = require('./xlsx-template');
const { isAcademicYear, isIsoDate } = require('./domain');

const GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const TEMPLATE = path.join(__dirname, '..', 'templates', 'summary-t1.xlsx');
const DAY = 86400000;
const badRequest = message => Object.assign(new Error(message), { status: 400 });

function reportPeriod(input = {}) {
  const academicYear = String(input.academicYear || '');
  const dateFrom = String(input.dateFrom || '');
  const dateTo = String(input.dateTo || '');
  const mode = String(input.mode || 'custom');
  if (!isAcademicYear(academicYear) || !isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom > dateTo) {
    throw badRequest('請選擇正確的學年及日期範圍');
  }
  if (!['week', 'custom'].includes(mode)) throw badRequest('請選擇按周次或自選日期');
  const week = Number(input.week);
  if (mode === 'week') {
    if (!Number.isInteger(week) || week < 6 || week > 53) throw badRequest('請選擇第 6 周或之後的周次');
    const expectedTo = new Date(Date.parse(`${dateFrom}T00:00:00Z`) + (week - 1) * 7 * DAY).toISOString().slice(0, 10);
    if (dateTo !== expectedTo) throw badRequest('周次與日期範圍不一致，請重新選擇周次');
  }
  return { academicYear, dateFrom, dateTo, mode, week: mode === 'week' ? week : null };
}

function dateLabel(iso) {
  const [year, month, day] = iso.split('-');
  return `${Number(day)}/${Number(month)}/${year}`;
}

function isSummarySheet(sheet) {
  return GRADES.every((grade, index) => String(sheet.getCell(4, 2 + index * 2).value || '').includes(grade));
}

function cloneSheet(book, source, name) {
  const model = structuredClone(source.model);
  const existing = book.getWorksheet(name);
  if (existing) book.removeWorksheet(existing.id);
  const sheet = book.addWorksheet(name);
  model.id = sheet.id;
  model.name = name;
  model.mergeCells = model.merges;
  sheet.model = model;
  // Restoring merges can fall back to column styles for their child cells.
  // Reapply the saved cell styles, including the template's individual fonts.
  for (const row of model.rows) for (const cell of row.cells) {
    sheet.getCell(cell.address).style = structuredClone(cell.style || {});
  }
  return sheet;
}

function displayName(student, reference) {
  const name = String(student.name || student.id);
  const referenceName = String(reference || '');
  const chineseName = name.match(/[\p{Script=Han}]+/u)?.[0];
  const referenceChinese = referenceName.match(/[\p{Script=Han}]+/u)?.[0];
  if (chineseName && chineseName === referenceChinese) return referenceName;
  return name.replace(/([\p{Script=Han}])\s+(?=[A-Za-z])/u, '$1\n');
}

function highlight(count, source) {
  const legend = count >= 10 ? 'N7' : count >= 8 ? 'N6' : count >= 5 ? 'N5' : null;
  return legend ? structuredClone(source.getCell(legend).fill) : null;
}

async function buildExport({ period, scope = 'all', reports }) {
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  const templateBuffer = await readFile(TEMPLATE);
  await book.xlsx.load(templateBuffer);
  const source = book.worksheets.find(isSummarySheet);
  if (!source) throw badRequest('範本格式不符，請使用包含 P1–P6 欄位的總表');
  const suffix = scope === 'all' ? '' : `_${scope}`;
  const sheetName = `${period.mode === 'week' ? `wk${period.week}` : `自選${period.dateFrom.replaceAll('-', '')}-${period.dateTo.replaceAll('-', '')}`}${suffix}`;
  const summary = cloneSheet(book, source, sheetName);
  summary.getCell('A2').value = `${period.academicYear.slice(2, 4)}/${period.academicYear.slice(-2)}年度`;
  summary.getCell('A3').value = `欠交功課紀錄 (${dateLabel(period.dateFrom)}-${dateLabel(period.dateTo)})${scope === 'all' ? '' : ` ${scope}`}`;

  // Keep the template's short display names when they identify the current student.
  const references = new Map();
  for (let grade = 0; grade < 6; grade++) for (let row = 5; row <= source.rowCount; row++) {
    const no = Number(source.getCell(row, 1).value);
    if (Number.isInteger(no) && no > 0) references.set(`${GRADES[grade]}|${no}`, source.getCell(row, 2 + grade * 2).value);
  }
  const students = reports.flatMap(report => report.rows);
  const validNo = value => Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 500;
  // The template's last row contains totals. Keep it there unless actual
  // class numbers or unnumbered students need more rows; never drop students.
  const templateTotalRow = source.rowCount;
  const lastNumber = Math.max(templateTotalRow - 5, ...students.filter(student => validNo(student.classNo)).map(student => Number(student.classNo)));
  const placements = reports.map(report => {
    const assigned = new Map();
    const extra = [];
    for (const student of report.rows) {
      const no = Number(student.classNo);
      if (validNo(student.classNo) && !assigned.has(no)) assigned.set(no, student);
      else extra.push(student);
    }
    extra.forEach((student, index) => assigned.set(lastNumber + index + 1, student));
    return { ...report, assigned, extraCount: extra.length };
  });
  const lastRow = 4 + lastNumber + Math.max(0, ...placements.map(report => report.extraCount));
  const totalRow = lastRow + 1;
  for (let row = 5; row <= Math.max(totalRow, summary.rowCount); row++) {
    // Do not normalize fonts, alignment, number formats, row heights or widths.
    // New rows inherit the appropriate body/total row from the same template.
    const styleRow = row === totalRow ? templateTotalRow : row <= templateTotalRow ? row : 5;
    if (row > templateTotalRow) summary.getRow(row).height = source.getRow(styleRow).height;
    summary.getCell(row, 1).value = row <= lastRow ? (row - 4 <= lastNumber ? row - 4 : '—')
      : row === templateTotalRow ? source.getCell(templateTotalRow, 1).value : null;
    summary.getCell(row, 1).style = structuredClone(source.getCell(styleRow, 1).style);
    for (let grade = 0; grade < 6; grade++) {
      const nameCell = summary.getCell(row, 2 + grade * 2);
      const countCell = summary.getCell(row, 3 + grade * 2);
      nameCell.value = countCell.value = null;
      nameCell.style = structuredClone(source.getCell(styleRow, 2 + grade * 2).style);
      countCell.style = structuredClone(source.getCell(styleRow, 3 + grade * 2).style);
      // Old warnings refer to old counts; apply the template's legend below.
      if (row !== totalRow) nameCell.fill = countCell.fill = { type: 'pattern', pattern: 'none' };
    }
  }
  for (const report of placements) {
    const grade = GRADES.indexOf(report.className);
    const nameColumn = 2 + grade * 2;
    const countColumn = nameColumn + 1;
    for (const [slot, student] of report.assigned) {
      const row = 4 + slot;
      const nameCell = summary.getCell(row, nameColumn);
      const countCell = summary.getCell(row, countColumn);
      nameCell.value = displayName(student, references.get(`${report.className}|${student.classNo}`));
      countCell.value = student.missingCount || null;
      const fill = highlight(student.missingCount, source);
      if (fill) for (const cell of [nameCell, countCell]) cell.fill = structuredClone(fill);
    }
    summary.getCell(totalRow, nameColumn).value = source.getCell(templateTotalRow, nameColumn).value;
    summary.getCell(totalRow, countColumn).value = { formula: `SUM(${summary.getColumn(countColumn).letter}5:${summary.getColumn(countColumn).letter}${lastRow})`, result: report.totalMissing };
  }
  const buffer = await writeTemplate({ templateBuffer, source, summary, totalRow });
  return { buffer, filename: `欠交功課_${period.academicYear}_${sheetName}.xlsx`, sheetName };
}

module.exports = { buildExport, reportPeriod, GRADES, TEMPLATE, cloneSheet, isSummarySheet };
