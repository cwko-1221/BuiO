import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import sharp from 'sharp';

const require = createRequire(import.meta.url), express = require('express');
const app = express();
const output = resolve('artifacts/question-import-20261028'); mkdirSync(output, { recursive: true });
app.use('/shared', express.static(resolve('shared')));
app.use('/games/js', express.static(resolve('game-hub-app/public/js')));
app.use('/games/css', express.static(resolve('game-hub-app/public/css')));
app.use('/vendor/jszip/3.10.1', express.static(resolve('node_modules/jszip/dist')));
app.use('/vendor', express.static(resolve('node_modules/exceljs/dist')));
app.get('/api/auth/me', (_req, res) => res.json({ student: { role: 'teacher' } }));
app.get('/api/games/sets', (_req, res) => res.json({ success: true, dbAvailable: true, sets: [] }));
app.get('/games/preview', (_req, res) => res.sendFile(resolve('game-hub-app/public/index.html')));
const server = await new Promise(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
const base = `http://127.0.0.1:${server.address().port}`;
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const errors = []; page.on('pageerror', error => errors.push(error.message));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function importFile(buffer, name) {
  await page.locator('#excelImportInput').setInputFiles({ name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
  await page.waitForFunction(() => !document.getElementById('excelImportBtn').disabled);
  const error = await page.locator('#editorError').textContent();
  if(error)console.error(await page.evaluate(async encoded=>{
    const {readQuestionWorkbook}=await import('/games/js/question-import.js');
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    try{await readQuestionWorkbook(new File([bytes],'debug.xlsx'),{ExcelJS,JSZip,t:BuiI18n.t});return 'Workbook reading passed; image extraction failed';}
    catch(e){return e.stack;}
  },buffer.toString('base64')));
  assert.equal(error, '', `import failed: ${error}`);
  return page.locator('.editor-question').evaluateAll(blocks => blocks.map(block => ({
    question: block.querySelector('.q-question').value,
    choices: [...block.querySelectorAll('.q-choice-input')].map(input => input.value),
    correct: Number(block.querySelector('input[type=radio]:checked')?.value),
    image: block.dataset.image,
  })));
}
try {
  await page.goto(`${base}/games/preview?role=teacher`);
  await page.locator('#newSetBtn').click();
  const workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('Questions');
  sheet.addRow(['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer', 'image']);
  sheet.addRow(['Large original picture', 'A', 'B', 'C', 'D', 'B']);
  sheet.addRow(['Second picture', 'A2', 'B2', 'C2', 'D2', 'D']);
  const large = await sharp(randomBytes(2600 * 2400 * 3), { raw: { width: 2600, height: 2400, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(large.length > 16 * 1024 * 1024, 'fixture exceeds the original 16 MB source restriction');
  const small = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#176abc' } }).png().toBuffer();
  const first = workbook.addImage({ buffer: large, extension: 'png' });
  const second = workbook.addImage({ buffer: small, extension: 'png' });
  sheet.addImage(first, { tl: { col: 6, row: 1 }, ext: { width: 4000, height: 3000 } });
  sheet.addImage(second, { tl: { col: 6, row: 2 }, ext: { width: 150, height: 90 } });
  const normal = Buffer.from(await workbook.xlsx.writeBuffer());
  const imported = await importFile(normal, 'large-images.xlsx');
  assert.equal(imported.length, 2); assert.deepEqual(imported.map(q => q.correct), [1, 3]);
  for (const question of imported) {
    assert.match(question.image, /^data:image\/jpeg;base64,/);
    assert.ok(Buffer.from(question.image.split(',')[1], 'base64').length <= 256 * 1024);
  }
  const zip = await JSZip.loadAsync(normal);
  const source = await zip.file('xl/workbook.xml').async('string');
  zip.file('xl/workbook.xml', source.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
    .replace(/<(\/?)(workbook|workbookPr|workbookProtection|bookViews|workbookView|sheets|sheet|definedNames|definedName|calcPr)(?=[\s/>])/g, '<$1x:$2'));
  const prefixed = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(new ExcelJS.Workbook().xlsx.load(prefixed), /undefined/);
  const compatible = await importFile(prefixed, 'prefixed-workbook.xlsx');
  assert.deepEqual(compatible.map(q => q.question), imported.map(q => q.question));
  assert.equal(compatible.filter(q => q.image).length, 2);
  zip.remove('xl/media/image1.png');
  await page.locator('#excelImportInput').setInputFiles({ name: 'missing-image.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await page.waitForFunction(() => !document.getElementById('excelImportBtn').disabled);
  const friendly = await page.locator('#editorError').textContent();
  assert.match(friendly, /第 2 列/); assert.doesNotMatch(friendly, /undefined|TypeError/);
  assert.equal(await page.locator('.editor-question').count(), 2, 'a failed import preserves the current editor');
  if (process.argv[2]) {
    const source = readFileSync(process.argv[2]), before = digest(source);
    const actual = await importFile(source, 'actual-question-bank.xlsx');
    assert.equal(actual.length, 10); assert.equal(actual.filter(q => q.image).length, 10);
    assert.equal(new Set(actual.map(q => q.image)).size, 10);
    assert.match(actual[0].question, /Which animal/); assert.equal(actual[0].correct, 1);
    assert.match(actual[0].choices[1], /獅子\s+Lion/, 'bilingual text keeps a readable separator');
    for (const q of actual) assert.ok(Buffer.from(q.image.split(',')[1], 'base64').length <= 256 * 1024);
    assert.equal(digest(readFileSync(process.argv[2])), before, 'the original workbook is never changed');
    await page.screenshot({ path: resolve(output, 'actual-workbook-import.png'), fullPage: true });
    console.log('Actual bilingual animal workbook: 10 questions, 10 distinct compressed images, answers and original file preserved.');
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ originalImageBytes: large.length, importedImages: imported.map(q => Buffer.from(q.image.split(',')[1], 'base64').length), checks: ['oversized source', 'oversized display', 'namespace compatibility', 'atomic error handling'], output }, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
