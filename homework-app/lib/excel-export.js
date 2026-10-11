'use strict';

const path = require('node:path');
const { isAcademicYear, isIsoDate } = require('./domain');

const GRADES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const TEMPLATE = path.join(__dirname, '..', 'templates', 'summary-t1.xlsx');
const DAY = 86400000;
const badRequest = message => Object.assign(new Error(message), { status: 400 });

function reportPeriod(input) {
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
    if (!Number.isInteger(week) || week < 1 || week > 53) throw badRequest('請選擇正確的周次');
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

function highlight(count) {
  if (count >= 10) return 'FFA6A6A6';
  if (count >= 8) return 'FFE6B8B7';
  if (count >= 5) return 'FFFFFF00';
  return null;
}

async function buildExport({ period, scope = 'all', reports, templateBuffer }) {
  const ExcelJS = require('exceljs');
  const book = new ExcelJS.Workbook();
  try {
    if (templateBuffer) await book.xlsx.load(templateBuffer);
    else await book.xlsx.readFile(TEMPLATE);
  } catch (error) {
    if (!templateBuffer) throw error;
    throw badRequest('未能讀取 Excel 範本，請上載有效的 .xlsx 檔案');
  }
  const source = book.worksheets.find(isSummarySheet);
  if (!source) throw badRequest('範本格式不符，請使用包含 P1–P6 欄位的總表');
  const suffix = scope === 'all' ? '' : `_${scope}`;
  const sheetName = `${period.mode === 'week' ? `wk${period.week}` : `自選${period.dateFrom.replaceAll('-', '')}-${period.dateTo.replaceAll('-', '')}`}${suffix}`;
  const summary = cloneSheet(book, source, sheetName);
  const detailName = `${sheetName}_明細`;
  const existingDetail = book.getWorksheet(detailName);
  if (existingDetail) book.removeWorksheet(existingDetail.id);
  const detail = book.addWorksheet(detailName);
  const scopeLabel = scope === 'all' ? '全校 P1–P6' : scope;
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
  const lastNumber = Math.max(30, ...students.filter(student => validNo(student.classNo)).map(student => Number(student.classNo)));
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
  const nameStyle = structuredClone(source.getCell('B5').style);
  const countStyle = structuredClone(source.getCell('C5').style);
  const numberStyle = structuredClone(source.getCell('A5').style);
  nameStyle.fill = countStyle.fill = { type: 'pattern', pattern: 'none' };
  for (let row = 5; row <= Math.max(totalRow, summary.rowCount); row++) {
    summary.getCell(row, 1).value = row <= lastRow ? (row - 4 <= lastNumber ? row - 4 : '—') : null;
    summary.getCell(row, 1).style = structuredClone(numberStyle);
    summary.getRow(row).height = source.getRow(5).height || 24;
    for (let grade = 0; grade < 6; grade++) {
      const nameCell = summary.getCell(row, 2 + grade * 2);
      const countCell = summary.getCell(row, 3 + grade * 2);
      nameCell.value = countCell.value = null;
      nameCell.style = structuredClone(nameStyle);
      countCell.style = structuredClone(countStyle);
      countCell.numFmt = '0;-0;;@';
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
      countCell.value = student.missingCount;
      const color = highlight(student.missingCount);
      if (color) for (const cell of [nameCell, countCell]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      const lineCapacity = Math.max(4, Math.floor((summary.getColumn(nameColumn).width || 9) * 7 / ((nameStyle.font?.size || 8) * 0.67)));
      const lines = String(nameCell.value).split('\n').reduce((total, line) => {
        const units = [...line].reduce((length, character) => length + (/[\p{Script=Han}]/u.test(character) ? 2 : 1), 0);
        return total + Math.max(1, Math.ceil(units / lineCapacity));
      }, 0);
      summary.getRow(row).height = Math.max(summary.getRow(row).height, lines * 11 + 4);
    }
    summary.getCell(totalRow, nameColumn).value = '總計';
    summary.getCell(totalRow, nameColumn).font = { ...nameStyle.font, bold: true };
    summary.getCell(totalRow, countColumn).value = { formula: `SUM(${summary.getColumn(countColumn).letter}5:${summary.getColumn(countColumn).letter}${lastRow})`, result: report.totalMissing };
    summary.getCell(totalRow, countColumn).numFmt = '0';
    summary.getCell(totalRow, countColumn).font = { ...countStyle.font, bold: true };
  }
  summary.pageSetup.printArea = `A1:N${totalRow}`;
  summary.getColumn('N').width = Math.max(summary.getColumn('N').width || 8, 14);
  summary.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

  detail.columns = [
    { key: 'date', width: 14 }, { key: 'className', width: 10 }, { key: 'classNo', width: 10 },
    { key: 'id', width: 16 }, { key: 'name', width: 40 }, { key: 'subject', width: 18 },
    { key: 'homework', width: 42 }, { key: 'madeUp', width: 14 },
  ];
  detail.mergeCells('A1:H1');
  detail.getCell('A1').value = `欠交功課明細 ${scopeLabel} (${dateLabel(period.dateFrom)}-${dateLabel(period.dateTo)})`;
  detail.getCell('A1').font = { name: 'Arial', size: 13, bold: true };
  detail.getRow(1).height = 26;
  detail.mergeCells('A2:H2');
  detail.getCell('A2').value = '總欠交次數包括已補做的欠交紀錄。';
  detail.getRow(3).values = ['日期', '班別', '班號', '學生編號', '姓名', '科目', '功課', '已補做'];
  detail.getRow(3).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  detail.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F8B8D' } };
  const items = students.flatMap(student => student.missingRecords.map(record => ({ student, record })))
    .sort((a, b) => a.record.date.localeCompare(b.record.date) || a.student.className.localeCompare(b.student.className) || (Number(a.student.classNo) || 999) - (Number(b.student.classNo) || 999) || a.student.id.localeCompare(b.student.id));
  for (const { student, record } of items) {
    const row = detail.addRow({ date: new Date(`${record.date}T00:00:00Z`), className: student.className, classNo: student.classNo ?? null,
      id: student.id, name: student.name, subject: record.subjectName, homework: record.homework, madeUp: record.madeUp ? '是' : '否' });
    row.font = { name: 'Arial', size: 11 };
    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = Math.max(30, Math.ceil(String(record.homework || '').length / 35) * 16 + 8, Math.ceil(String(student.name || '').length / 32) * 16 + 8);
    row.getCell(1).numFmt = 'd/m/yyyy';
  }
  detail.autoFilter = `A3:H${Math.max(3, detail.rowCount)}`;
  detail.views = [{ state: 'frozen', ySplit: 3 }];
  detail.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:3' };
  book.calcProperties.fullCalcOnLoad = true;
  book.views = [{ ...book.views[0], activeTab: book.worksheets.indexOf(summary) }];
  // ExcelJS derives this flag from firstPageNumber on write, even when the
  // imported sheet explicitly disabled it. Omit the unused number to keep it disabled.
  for (const sheet of book.worksheets) if (!sheet.pageSetup.useFirstPageNumber) delete sheet.pageSetup.firstPageNumber;
  return { buffer: await book.xlsx.writeBuffer(), filename: `欠交功課_${period.academicYear}_${sheetName}.xlsx`, sheetName };
}

module.exports = { buildExport, reportPeriod, GRADES };
