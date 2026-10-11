'use strict';

// Append only the requested action sheet. Never round-trip the original summary
// tabs or font table through a spreadsheet serializer.
const { upsertSheet, escapeXml, attribute, setAttribute, partPath } = require('./xlsx-template');
const NAME = '待處理事項';
const LABELS = { parent: '通知家長', detention: '留堂班', demerit: '記缺點' };

async function writeTasksSheet(buffer, tasks, period, sourceName) {
  const zip = await require('jszip').loadAsync(buffer);
  const read = path => zip.file(path).async('string');
  const sheets = (await read('xl/workbook.xml')).match(/<sheet\b[^>]*\/>/g);
  const source = sheets.find(tag => attribute(tag, 'name') === sourceName);
  const rel = (await read('xl/_rels/workbook.xml.rels')).match(/<Relationship\b[^>]*\/>/g)
    .find(tag => attribute(tag, 'Id') === attribute(source, 'r:id'));
  const sourceXml = await read(partPath(attribute(rel, 'Target')));
  const cells = sourceXml.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g);
  const styleId = address => Number(attribute(cells.find(cell => attribute(cell, 'r') === address), 's') || 0);
  let stylesXml = await read('xl/styles.xml');
  const section = stylesXml.match(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/)[0];
  const formats = section.match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g);
  const oldCount = formats.length;
  const variant = (base, horizontal, fillId = 0) => {
    let xf = setAttribute(setAttribute(formats[base], 'fillId', fillId), 'applyFill', 1);
    const alignment = `<alignment horizontal="${horizontal}" vertical="center" wrapText="1"/>`;
    xf = /<alignment\b/.test(xf) ? xf.replace(/<alignment\b[^>]*\/>/, alignment) : xf.replace('/>', `>${alignment}</xf>`);
    xf = setAttribute(xf, 'applyAlignment', 1);
    let index = formats.indexOf(xf);
    if (index < 0) { index = formats.length; formats.push(xf); }
    return index;
  };
  const title = variant(styleId('A1'), 'left');
  const body = variant(styleId('A5'), 'left');
  const number = variant(styleId('A5'), 'right');
  const header = variant(styleId('B4'), 'center');
  const warnings = Object.fromEntries(['parent', 'detention', 'demerit'].map((action, index) => [action,
    variant(styleId('A5'), 'left', Number(attribute(formats[styleId(`N${index + 5}`)], 'fillId')))]));
  const cell = (address, value, style) => value == null || value === '' ? `<c r="${address}" s="${style}"/>`
    : typeof value === 'number' ? `<c r="${address}" s="${style}"><v>${value}</v></c>`
      : `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  const row = (n, cells, height) => `<row r="${n}" ht="${height}" customHeight="1">${cells}</row>`;
  const pending = tasks.filter(task => !task.done && task.week <= period.week).sort((a, b) => a.className.localeCompare(b.className)
    || (a.classNo || 999) - (b.classNo || 999) || a.name.localeCompare(b.name, 'zh-HK') || a.threshold - b.threshold);
  const headers = ['周次', '班別', '班號', '學生姓名', '欠交次數', '處理事項', '處理狀態', '備註', '識別碼'];
  const rows = [row(1, cell('A1', `${NAME}（Week ${period.week}）`, title), 26),
    row(2, cell('A2', `${period.academicYear}　${period.dateFrom} 至 ${period.dateTo}`, body), 22),
    row(3, '', 8),
    row(4, headers.map((text, c) => cell(`${String.fromCharCode(65 + c)}4`, text, header)).join(''), 26)];
  pending.forEach((task, i) => {
    const n = i + 5;
    const values = [task.week, task.className, task.classNo, task.name, task.count, LABELS[task.action], '待處理', task.notes || '', task.id];
    rows.push(row(n, values.map((value, c) => cell(`${String.fromCharCode(65 + c)}${n}`, value,
      c === 5 ? warnings[task.action] : [0, 2, 4].includes(c) ? number : body)).join(''), 36));
  });
  if (!pending.length) rows.push(row(5, cell('A5', '沒有待處理事項', body), 26));
  const last = Math.max(5, pending.length + 4);
  const cols = [8, 9, 8, 35, 13, 18, 13, 32, 12].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"${i === 8 ? ' hidden="1"' : ''}/>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:I${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="36"/><cols>${cols}</cols><sheetData>${rows.join('')}</sheetData>${pending.length ? `<autoFilter ref="A4:H${last}"/>` : ''}<mergeCells count="${pending.length ? 2 : 3}"><mergeCell ref="A1:H1"/><mergeCell ref="A2:H2"/>${pending.length ? '' : '<mergeCell ref="A5:H5"/>'}</mergeCells>${pending.length ? `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="處理狀態" error="請選擇待處理或已處理" sqref="G5:G${last}"><formula1>"待處理,已處理"</formula1></dataValidation></dataValidations>` : ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  if (formats.length > oldCount) zip.file('xl/styles.xml', stylesXml.replace(section,
    setAttribute(section.replace('</cellXfs>', formats.slice(oldCount).join('') + '</cellXfs>'), 'count', formats.length)));
  await upsertSheet(zip, NAME, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function applyTaskSheet(book, tasks, userId) {
  const sheet = book.getWorksheet(NAME);
  if (!sheet) return; // Older reports without an action sheet remain uploadable.
  const known = new Map(tasks.map(task => [task.id, task]));
  const seen = new Set();
  for (let r = 5; r <= sheet.rowCount; r++) {
    const task = known.get(String(sheet.getCell(r, 9).value || ''));
    if (!task || seen.has(task.id)) continue;
    seen.add(task.id);
    const status = String(sheet.getCell(r, 7).value || '').trim();
    if (status !== '待處理' && status !== '已處理') throw Object.assign(new Error('待處理事項的處理狀態只能填「待處理」或「已處理」。'), { status: 400 });
    const done = status === '已處理';
    if (done !== task.done) Object.assign(task, { done, doneBy: done ? userId : null, doneAt: done ? new Date().toISOString() : null });
    const note = sheet.getCell(r, 8).value;
    task.notes = String(note?.result ?? note ?? '').slice(0, 2000);
  }
}

module.exports = { writeTasksSheet, applyTaskSheet, TASK_SHEET_NAME: NAME };
