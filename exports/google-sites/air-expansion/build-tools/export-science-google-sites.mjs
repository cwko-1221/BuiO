#!/usr/bin/env node
// Export the existing air-expansion inquiry as readable, self-contained HTML.
// Nothing in science-lab-app/public or the platform server is modified.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { build } from '../science-lab-app/node_modules/vite/dist/node/index.js';
import { experiments } from '../science-lab-app/public/js/data/experiments.zh.js';
import { experiments as englishExperiments } from '../science-lab-app/public/js/data/experiments.en.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'science-lab-app/public');
const outputRoot = path.join(root, 'exports/google-sites/air-expansion');
const definition = experiments.find(item => item.id === 'air-expansion');
const englishDefinition = englishExperiments.find(item => item.id === 'air-expansion');
const languageController = await readFile(path.join(root, 'science-lab-app/standalone/language-controller.js'), 'utf8');
assert.ok(definition);
const normal = value => value.replaceAll('\\', '/');
const sourceFiles = new Map();
const read = relative => readFile(path.join(root, relative), 'utf8');
const replaceOnce = (source, before, after) => {
  assert.ok(source.includes(before), `Export adapter no longer matches: ${before.slice(0, 90)}`);
  return source.replace(before, () => after);
};
const replaceSection = (source, startText, endText, replacement = '') => {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `Export section no longer matches: ${startText}`);
  return source.slice(0, start) + replacement + source.slice(end);
};

const kit = await readFile(path.join(publicRoot, 'models/science-lab-kit.glb'));
const kitUrl = `data:model/gltf-binary;base64,${kit.toString('base64')}`;
const plugin = {
  name: 'buio-google-sites-standalone',
  enforce: 'pre',
  async load(id) {
    const file = normal(id.split('?')[0]);
    if (!file.startsWith(normal(publicRoot) + '/js/') || !file.endsWith('.js')) return null;
    let source = await readFile(file, 'utf8');
    const relative = normal(path.relative(root, file));
    if (file.endsWith('/data/experiments.js')) {
      source = `// The same inquiry and answer indexes in both languages.\nexport const TOPICS = ['物質'];\nconst editions = ${JSON.stringify({ 'zh-HK': definition, 'en-US': englishDefinition }, null, 2)};\nexport const experiments = [];\nexport const experimentById = new Map();\nexport function selectExperimentLanguage(language) {\n const definition = structuredClone(editions[language] || editions['zh-HK']);\n experiments.splice(0, experiments.length, definition);\n experimentById.clear(); experimentById.set(definition.id, definition);\n}\nselectExperimentLanguage(globalThis.BuiI18n?.lang);\nexport function getNextExperiment() { return null; }\n`;
    } else if (file.endsWith('/render/ExperimentScenes.js')) {
      source = `// Keep the original 3D air-expansion scene, without other stations.\nimport { buildAirExpansion } from './scenes/MatterForceScenes.js';\nexport function buildExperimentScene(definition, api) {\n  if (definition.id !== 'air-expansion') throw new Error('Unknown standalone inquiry');\n  return buildAirExpansion(api);\n}\n`;
    } else if (file.endsWith('/main.js')) {
      const start = source.indexOf('async function resolveStudentId()');
      const end = source.indexOf('\nfunction setBoot(', start);
      assert.ok(start >= 0 && end > start);
      source = source.slice(0, start) + "// No authentication or backend calls in the competition edition.\nasync function resolveStudentId() { return 'competition-air-expansion'; }\n" + source.slice(end);
      source = replaceOnce(source, "if (location.pathname.endsWith('/preview')) {", 'if (window.__BUIO_EXPORT_QA__) {');
      source = replaceOnce(source, "history.replaceState(null, '', `#${definition.id}`);", '// Embed navigation stays inside the experiment.');
      source = replaceOnce(source, "if (canonicalize) history.replaceState(null, '', `${location.pathname}${location.search}`);", '// Do not change the surrounding Google Sites URL.');
      source = replaceOnce(source, 'const id = location.hash.slice(1);', "const id = 'air-expansion';");
      source = replaceOnce(source, "addEventListener('hashchange', routeFromHash);", '// The standalone edition has a single inquiry.');
      source = replaceOnce(source, 'boot();', "boot().catch(error => window.BuiLoading.recover(error));");
      // This competition edition opens directly into its only experiment.
      // Remove the catalogue and notebook behavior along with their markup.
      source = replaceSection(source, 'function renderCards(', 'function renderProgress(');
      source = replaceSection(source, 'function showCatalog(', 'function applySettings(');
      source = replaceSection(source, "  dom.continue.addEventListener('click'", "  dom.hint.addEventListener('click'");
      source = replaceSection(source, "  dom.next.addEventListener('click'", "  dom.settingsButton.addEventListener('click'");
      source = replaceSection(source, "  $$('.filter-chip').forEach(", "  $$('[data-close-dialog]')");
      source = replaceSection(source, 'function routeFromHash()', 'function closeAllDialogs()', "function routeFromHash() {\n  if (!currentExperiment) startExperiment('air-expansion');\n}\n\n");
      source = source.replace(/^.*(?:renderCards\(|dom\.catalog\.hidden|dom\.labNumber\.textContent|dom\.labMeta\.textContent|dom\.continue\.querySelector).*\r?\n/gm, '');
      source = replaceOnce(source, "import { experiments, experimentById, getNextExperiment }", 'import { experiments, experimentById }');
      source = replaceOnce(source, "import { illustrationSvg } from './ui/illustrations.js';", '');
      for (const selector of ['catalog', 'grid', 'continue', 'tour', 'home', 'back', 'labNumber', 'labMeta', 'next', 'notebookButton', 'notebookDialog', 'notebookSummary', 'notebookEntries', 'tourDialog']) {
        source = source.replace(new RegExp(`\\b${selector}: \\$\\('#[^']+'\\),?\\s*`), '');
      }
      source = replaceOnce(source, 'import { experiments, experimentById }', 'import { experiments, experimentById, selectExperimentLanguage }');
      source = replaceOnce(source, 'function bindEvents() {', `${languageController}\nfunction bindEvents() {\n  document.querySelector('#languageSelect').addEventListener('change', event => changeLanguage(event.target.value));`);
      source = replaceOnce(source, 'dom.soundToggle.checked = settings.sound;', "document.querySelector('#languageSelect').value = window.BuiI18n.lang;\n  dom.soundToggle.checked = settings.sound;");
    } else if (file.endsWith('/persistence/ProgressStore.js')) {
      source = source.replaceAll('localStorage.', 'window.BuioStandaloneStorage.');
      source = source.replaceAll('buio-science-lab:', 'buio-sites-air-expansion:');
    } else if (file.endsWith('/render/AssetLibrary.js')) {
      source = replaceOnce(source, "new URL('../../models/science-lab-kit.glb', import.meta.url).href", JSON.stringify(kitUrl));
      // The anatomy station has been excluded, so its model must not be bundled.
      source = replaceOnce(source, "new URL('../../models/respiratory.glb', import.meta.url).href", "''");
    } else if (file.endsWith('/render/LabRenderer.js')) {
      source = "import { AirLabPresentation } from '../../../standalone/presentation.js';\n" + source;
      source = source.replaceAll('0x0b5360', '0x8fa6bc').replaceAll('0x0d6070', '0x8fa6bc').replaceAll('0x0b5260', '0x8fa6bc');
      source = replaceOnce(source, '0x85c9bd', '0x6886a2');
      source = replaceOnce(source, '0xa8e6d7', '0x8ca2b5');
      source = replaceOnce(source, 'this.#addBackgroundBubbles();', '// Air Lab uses a quiet, uncluttered studio background.');
      source = replaceOnce(source, 'this.#layOutNamePlates();', 'this.namePlateQueue = [];\n    this.airLabPresentation ||= new AirLabPresentation(this);\n    this.airLabPresentation.mount();');
      source = replaceOnce(source, 'this.renderer.render(this.scene, this.camera);', 'this.airLabPresentation?.update();\n    this.renderer.render(this.scene, this.camera);');
      source = replaceOnce(source, 'this.destroyed = true;', 'this.destroyed = true;\n    this.airLabPresentation?.dispose();');
    } else if (file.endsWith('/render/SceneKit.js')) {
      source = replaceOnce(source, '0xf2d7a5', '0xf7f5ef');
      source = replaceOnce(source, '0x34606a', '0x34495f');
      source = replaceOnce(source, 'roundedBox(12.25, .09, .18, palette.mint, .04, 2, { emissive: palette.mint, emissiveIntensity: .14 })', 'roundedBox(12.25, .09, .18, 0x34495f, .04, 2, { roughness: .7 })');
    }
    sourceFiles.set(relative, source);
    return source;
  },
};

const result = await build({
  configFile: false,
  root: path.join(root, 'science-lab-app'),
  publicDir: false,
  logLevel: 'warn',
  plugins: [plugin],
  build: {
    write: false,
    target: 'es2020',
    minify: false, // Reviewers receive readable application and library code.
    sourcemap: false,
    lib: { entry: path.join(publicRoot, 'js/main.js'), name: 'BuioAirExpansion', formats: ['iife'] },
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const chunks = outputs.filter(item => item.type === 'chunk');
assert.equal(chunks.length, 1, 'The export must have exactly one JavaScript bundle');
assert.equal(outputs.filter(item => item.type === 'asset').length, 0, 'No separate runtime assets');
assert.deepEqual(chunks[0].imports, []);
// Rolldown can retain a self-reference in metadata after inlining import().
assert.deepEqual(chunks[0].dynamicImports.filter(name => name !== chunks[0].fileName), []);

// Read the existing dictionary as data, then retain the Chinese controls only.
let dictionary;
const dictionarySource = await read('shared/i18n/science-lab.js');
vm.runInNewContext(dictionarySource, {
  BuiI18n: { register(value) { dictionary = value; } },
});
const chinese = Object.fromEntries(Object.entries(dictionary).map(([key, value]) => [key, value['zh-HK'] ?? value]));
Object.assign(chinese, {
  'sl.pageTitle': '空氣的脹與縮｜空氣研究所',
  'sl.brand': '空氣研究所',
  'sl.pageDesc': '空氣研究所：以氣球、熱水與冰水，探索空氣受熱膨脹、遇冷收縮。',
  'sl.booting': '正在打開空氣研究所…',
  'sl.bootContent': '正在整理實驗步驟…',
  'sl.bootApparatus': '正在準備氣球與水浴…',
  'sl.bootNotebook': '正在準備觀測介面…',
  'sl.bootReady': '實驗準備好了',
  'sl.catalogTitle': '空氣的脹與縮',
  'sl.catalogLead': definition.question + ' 透過氣球、熱水和冰水，親手觀察空氣體積的變化。',
  'sl.startFirst': '開始實驗',
  'sl.chooseStation': '空氣的脹與縮',
});
for (const key of Object.keys(chinese)) if (typeof chinese[key] === 'string') chinese[key] = chinese[key].replaceAll('奇趣科學島', '空氣研究所');
const bilingual = Object.fromEntries(Object.entries(chinese).map(([key, value]) => [key, { 'zh-HK': value, 'en-US': dictionary[key]?.['en-US'] || value }]));
const translated = (zh, en) => ({ 'zh-HK': zh, 'en-US': en });
Object.assign(bilingual, {
  'sl.brand': translated('空氣研究所', 'Air Lab'),
  'sl.pageTitle': translated('空氣的脹與縮｜空氣研究所', 'Air Expansion & Contraction | Air Lab'),
  'sl.pageDesc': translated(chinese['sl.pageDesc'], 'Explore how air expands and contracts using a balloon and hot and cold water.'),
  'sl.booting': translated(chinese['sl.booting'], 'Opening Air Lab…'),
  'sl.bootApparatus': translated(chinese['sl.bootApparatus'], 'Preparing the balloon and water baths…'),
  'sl.bootNotebook': translated(chinese['sl.bootNotebook'], 'Preparing the observation panel…'),
  'air.language': translated('語言／Language', 'Language / 語言'),
  'air.languageHint': translated('介面和實驗內容語言', 'Interface and experiment language'),
  'air.live': translated('即時觀測', 'LIVE OBSERVATIONS'),
  'air.room': translated('室溫', 'Room temp.'), 'air.water': translated('水溫', 'Water temp.'),
  'air.volume': translated('空氣體積變化', 'Air volume change'),
  'air.reference': translated('基準：22 °C · 500 mL 空氣', 'Reference: 22 °C · 500 mL of air'),
  'air.attach': translated('先把氣球套上樽口', 'Fit the balloon over the bottle neck'),
  'air.expands': translated('受熱膨脹 · 留意氣球的變化', 'Heating: watch the balloon expand'),
  'air.contracts': translated('遇冷收縮 · 與熱水結果比較', 'Cooling: compare with the hot-water result'),
  'air.attached': translated('氣球已套好 · 把膠樽放進水盆', 'Balloon fitted: place the bottle in a bath'),
  'air.label.balloon': translated('氣球', 'Balloon'),
  'air.label.bottle': translated('硬身膠樽', 'Rigid bottle'),
  'air.label.hot-bath-bowl': translated('熱水盆', 'Hot-water bath'),
  'air.label.ice-bath-bowl': translated('冰水盆', 'Ice-water bath'),
  'air.label.water-temperature': translated('熱水溫度掣', 'Hot-water dial'),
  'air.target.bottle-mouth': translated('樽口', 'Bottle neck'),
  'air.target.hot-bath': translated('熱水盆中', 'In the hot-water bath'),
  'air.target.ice-bath': translated('冰水盆中', 'In the ice-water bath'),
});
const sceneTranslations = dictionarySource.slice(dictionarySource.indexOf('const SCENE_LABELS ='));
const runtime = await read('science-lab-app/standalone/runtime.js');
const threeLicense = await read('science-lab-app/node_modules/three/LICENSE');
const rapierLicense = await read('science-lab-app/node_modules/@dimforge/rapier3d-compat/LICENSE');
const notices = `Third-party components bundled locally, with no CDN.\n\nthree.js 0.179.1\n${threeLicense}\n\n@dimforge/rapier3d-compat 0.20.0\n${rapierLicense}`;
const js = `/* BuiO competition edition: 空氣的脹與縮\n${notices.replaceAll('*/', '* /')}\n*/\n${runtime}\nwindow.BuiI18n.register(${JSON.stringify(bilingual, null, 2)});\n${sceneTranslations}\nwindow.BuiI18n.apply();\n${chunks[0].code}`;
let html = await read('science-lab-app/public/index.html');
html = html.replace(/\s*<script\b[^>]*src=["'][^"']+["'][^>]*>\s*<\/script>/g, '');
html = html.replace(/\s*<link\b[^>]*rel="stylesheet"[^>]*>/g, '');
html = html.replace(/\s*<a class="portal-link"[\s\S]*?<\/a>/, '');
html = html.replace(/<button id="homeButton"[^>]*>([\s\S]*?)<\/button>/, (_, contents) => `<div class="brand-button">${contents}</div>`);
html = html.replace(/\s*<button id="(?:backToCatalogButton|notebookButton|nextExperimentButton)"[^>]*>[\s\S]*?<\/button>/g, '');
html = html.replace(/\s*<section id="catalogScreen"[\s\S]*?<\/section>/, '');
html = html.replace(/\s*<dialog id="(?:notebookDialog|tourDialog)"[\s\S]*?<\/dialog>/g, '');
html = html.replace(/\s*<span id="labNumber"[^>]*>[\s\S]*?<\/span>/, '');
html = html.replace(/<p id="labMeta"><\/p>/, '');
html = html.replace(/(<h2 id="settingsTitle"[^>]*>[\s\S]*?<\/h2>)/, match => `${match}<div class="quality-row language-row"><label for="languageSelect"><b data-i18n="air.language">語言／Language</b><small data-i18n="air.languageHint">介面和實驗內容語言</small></label><select id="languageSelect"><option value="zh-HK">繁體中文</option><option value="en-US">English</option></select></div>`);
html = html.replace(/<div class="boot-orbit"[^>]*>[\s\S]*?<\/div>/, '<div class="boot-symbol" aria-hidden="true"><span>air</span><i>°</i></div>');
html = html.replace(/<span class="brand-mark"[^>]*>[\s\S]*?<\/span>/, '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="17" cy="25" r="8"/><circle cx="30" cy="23" r="12"/><path d="M23 12l4-3-1 5M32 34l-4 3 1-5"/></svg></span>');
html = html.replaceAll('奇趣科學島', '空氣研究所').replaceAll('WONDER LAB', 'AIR LAB');
const favicon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#243345"/><circle cx="24" cy="33" r="12" fill="none" stroke="#e3a577" stroke-width="2"/><circle cx="40" cy="30" r="16" fill="none" stroke="#a0c6d8" stroke-width="2"/></svg>';
html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(favicon)}"/>`);
html = html.replace(/<span><b>5<\/b> <i data-i18n="sl.proofInquiries">/, '<span><b>1</b> <i data-i18n="sl.proofInquiries">');
html = html.replace(/<span><b>5<\/b> <i data-i18n="sl.proofFields">/, '<span><b>1</b> <i data-i18n="sl.proofFields">');
html = html.replace(/(<b id="progressCount">)[^<]+/, '$10 / 1');
html = html.replace(/<button class="filter-chip"[^>]*>[\s\S]*?<\/button>/g, '');
html = html.replace(/<button id="nextExperimentButton"/, '<button hidden id="nextExperimentButton"');
html = html.replace(/<title[^>]*>[\s\S]*?<\/title>/, '<title data-i18n="sl.pageTitle">空氣的脹與縮｜空氣研究所</title>');
const css = await read('science-lab-app/public/css/science-lab.css');
const theme = await read('science-lab-app/standalone/theme.css');
const extraCss = `
/* The experiment occupies the Google Sites embed rectangle. */
html, body { min-width: 0; }
.brand-button { cursor: default; }
.lab-title-block { margin-top: 0; }
/* The notebook no longer occupies the first icon slot on phones. */
.topbar-actions #soundButton { display: grid; }
.catalog-toolbar .filter-row, #nextExperimentButton { display: none !important; }
.record-panel { max-width: calc(100vw - 24px); }
/* Keep record choices above the expanded task card on narrow embeds. */
@media (max-width: 820px) {
  .lab-screen.mission-open .record-panel { bottom: 247px; }
}
@media (max-width: 520px) {
  .lab-screen.mission-open .record-panel { bottom: 222px; }
}
`;
html = html.replace('</head>', () => `<style>\n${css}${extraCss}${theme}\n</style>\n</head>`);
// Protect HTML raw-text elements from closing sequences inside JS literals.
html = html.replace('</body>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>\n</body>`);
assert.ok(!/<(?:script|link)\b[^>]*(?:src|href)=["']\//i.test(html), 'No platform script/style paths');
assert.ok(!html.includes('/api/auth/me'), 'No login dependency');
assert.ok(!html.includes('/science-lab/assets/'), 'No hosted asset dependency');
assert.ok(!html.includes('奇趣科學島') && !html.includes('WONDER LAB'), 'No original visual branding');
assert.ok(html.length < 15_000_000, 'Fits the documented Google Sites page character quota');

await mkdir(outputRoot, { recursive: true });
// Drop the catalogue illustrations left by an older generated review package.
const legacyIllustrations = 'science-lab-app/public/js/ui/illustrations.js';
if (!sourceFiles.has(legacyIllustrations)) {
  await unlink(path.join(outputRoot, 'review-source', legacyIllustrations)).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
}
for (const [relative, source] of sourceFiles) {
  const target = path.join(outputRoot, 'review-source', relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
}
await writeFile(path.join(outputRoot, 'air-expansion.html'), html);
await writeFile(path.join(outputRoot, 'air-expansion-embed.txt'), html);
await writeFile(path.join(outputRoot, 'THIRD-PARTY-NOTICES.txt'), notices);
await writeFile(path.join(outputRoot, 'review-source/runtime.js'), runtime);
await mkdir(path.join(outputRoot, 'review-source/science-lab-app/standalone'), { recursive: true });
await writeFile(path.join(outputRoot, 'review-source/science-lab-app/standalone/presentation.js'), await read('science-lab-app/standalone/presentation.js'));
await writeFile(path.join(outputRoot, 'review-source/science-lab-app/standalone/theme.css'), theme);
await writeFile(path.join(outputRoot, '設計說明.md'), await read('science-lab-app/standalone/design-notes.md'));
await writeFile(path.join(outputRoot, 'review-source/controls.zh.json'), JSON.stringify(chinese, null, 2));
await writeFile(path.join(outputRoot, 'review-source/controls.bilingual.json'), JSON.stringify(bilingual, null, 2));
await writeFile(path.join(outputRoot, 'review-source/science-lab-app/standalone/language-controller.js'), languageController);
await writeFile(path.join(outputRoot, 'review-source/experiment.html'), html.slice(0, html.lastIndexOf('<script>')) + '\n<!-- Runtime is bundled in air-expansion.html. -->\n</body>\n</html>');
const report = {
  experiment: definition.id, characters: html.length, utf8Bytes: Buffer.byteLength(html),
  sha256: createHash('sha256').update(html).digest('hex'),
  externalRuntimeFiles: 0, minified: false,
  googleSitesPasteVerified: false,
};
await writeFile(path.join(outputRoot, 'build-report.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(outputRoot, '使用說明.md'), `# 空氣的脹與縮：Google Sites 單檔版\n\n本版沿用 BuiO 的原有實驗步驟、3D 場景、物理模擬、音效及科學解釋，只顯示這一個實驗。無需 BuiO 帳戶，也不載入外部程式、模型、CDN 或 API。\n\n## 貼入 Google Sites\n\n1. 用文字編輯器開啟 air-expansion-embed.txt，全選並複製整份內容。\n2. 在 Google Sites 選「插入 → 嵌入 → 嵌入程式碼」，貼上內容並按「下一步」。\n3. 插入後把實驗區域拉高；桌面建議至少 850 px，手機建議至少 900 px。Google Sites 的外框高度要在編輯器中調整。\n4. 預覽並發布後，再測試拖拉、溫度調校、熱水／冰水觀察、記錄及結論。\n\n這是直接嵌入程式碼，沒有另設實驗網站。Google Sites 自身仍需要網絡。Google Sites 會在獨立的嵌入環境執行程式。若瀏覽器禁止儲存，進度只保留至本次頁面重載之前；若無 WebGL，沿用原平台的簡化模式。\n\n## 交給評審的檔案\n\n- air-expansion.html：可在本機開啟的完整作品，程式碼沒有壓縮或混淆。\n- air-expansion-embed.txt：與 HTML 完全相同，可全選後貼入 Google Sites。\n- review-source/：打包時實際使用的應用原始碼（已移除登入依賴），方便閱讀。\n- THIRD-PARTY-NOTICES.txt：three.js（MIT）及 Rapier（Apache-2.0）授權；並非聲稱引擎為自行編寫。\n- build-report.json：檔案大小、SHA-256 及 Google Sites 實際貼入驗證狀態。\n\n核心科學模型在 review-source/science-lab-app/public/js/render/scenes/MatterForceScenes.js 的 buildAirExpansion() / balloonVolumeMl()：\n\n    ΔV = 500 × [(水溫 + 273.15) / (22 + 273.15) − 1] mL\n\n這是假設氣體量固定、壓力近似不變的理想化示意；氣球彈性及傳熱過程經簡化，氣球形狀為方便觀察而放大。75°C 時約 +90 mL，2°C 時約 −34 mL。真實實驗的熱水須由老師處理。\n\n## 重新產生\n\n在 BuiO 根目錄執行：node scripts/export-science-google-sites.mjs\n\n不會修改正式平台的頁面、登入及伺服器設定。Google Sites 的頁面字元上限並不保證單一嵌入區塊一定可接受這個大小；必須在實際 Sites 編輯器完成貼入、預覽與發布測試，才算驗證完成。\n`);
console.log(JSON.stringify(report, null, 2));
