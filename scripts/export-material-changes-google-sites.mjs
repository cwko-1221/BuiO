#!/usr/bin/env node
// Build readable, self-contained competition HTML. No CDN, login or API.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { build } from '../science-lab-app/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'science-lab-app/material-changes');
const output = path.join(root, 'exports/google-sites/material-changes');
await mkdir(output, { recursive: true });
const observation = `data:image/webp;base64,${(await readFile(path.join(source, 'assets/ice-water-ice.webp'))).toString('base64')}`;
const materialAtlas = `data:image/webp;base64,${(await readFile(path.join(source, 'assets/material-icons.webp'))).toString('base64')}`;
const result = await build({ configFile: false, root: path.join(root, 'science-lab-app'), publicDir: false, logLevel: 'warn',
  plugins: [{ name: 'material-changes-inline-image', enforce: 'pre', async load(id) {
    if (id.replaceAll('\\', '/').endsWith('/material-changes/app.js')) {
      const code = await readFile(path.join(source, 'app.js'), 'utf8');
      const marker = "new URL('./assets/ice-water-ice.webp', import.meta.url).href";
      assert.ok(code.includes(marker)); return code.replace(marker, JSON.stringify(observation))
        .replace("new URL('./assets/material-icons.webp', import.meta.url).href", JSON.stringify(materialAtlas));
    }
  } }],
  build: { write: false, target: 'es2020', minify: false, sourcemap: false,
    lib: { entry: path.join(source, 'app.js'), name: 'MaterialChangeLab', formats: ['iife'] },
    rolldownOptions: { output: { codeSplitting: false } } },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
assert.equal(outputs.length, 1); const js = outputs[0]; assert.equal(js.type, 'chunk'); assert.deepEqual(js.imports, []);
assert.equal(js.dynamicImports.filter(name => name !== js.fileName).length, 0);
const css = await readFile(path.join(source, 'style.css'), 'utf8');
let html = await readFile(path.join(source, 'index.html'), 'utf8');
html = html.replace('</head>', `<style>\n${css}\n</style>\n</head>`).replace('<script type="module" src="./app.js"></script>', `<script>\n${js.code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
assert.ok(!/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=["']https?:/i.test(html));
assert.ok(html.includes('data:image/webp;base64,'));
await Promise.all([
  writeFile(path.join(output, 'material-changes.html'), html),
  writeFile(path.join(output, 'material-changes-embed.txt'), html),
]);
await mkdir(path.join(output, 'review-source'), { recursive: true });
await cp(source, path.join(output, 'review-source/material-changes'), { recursive: true });
await cp(path.join(root, 'scripts/export-material-changes-google-sites.mjs'), path.join(output, 'review-source/export-material-changes-google-sites.mjs'));
await cp(path.join(root, 'scripts/test-material-changes-google-sites.mjs'), path.join(output, 'review-source/test-material-changes-google-sites.mjs'));
const reviewFolder = path.join(output, 'review-source/material-changes');
const unitTests = await readFile(path.join(root, 'tests/material-changes.test.mjs'), 'utf8');
await writeFile(path.join(reviewFolder, 'simulation.test.mjs'), unitTests.replaceAll('../science-lab-app/material-changes/', './'));
const reviewPackage = JSON.parse(await readFile(path.join(reviewFolder, 'package.json'), 'utf8'));
reviewPackage.scripts.test = 'node --test simulation.test.mjs';
await writeFile(path.join(reviewFolder, 'package.json'), JSON.stringify(reviewPackage, null, 2) + '\n');
await cp(path.join(root, 'science-lab-app/node_modules/three/LICENSE'), path.join(output, 'THREE-LICENSE.txt'));
await cp(path.join(root, 'science-lab-app/art-source/material-changes/README.md'), path.join(output, 'IMAGE-PROMPT.md'));
await cp(path.join(root, 'science-lab-app/art-source/material-changes/MATERIAL-ICONS-PROMPT.md'), path.join(output, 'MATERIAL-ICONS-PROMPT.md'));
await writeFile(path.join(output, '使用說明.md'), `# 可逆及不可逆變化｜變化研究所\n\n1. 直接開啟 material-changes.html 即可試玩，不需伺服器或登入。\n2. Google Sites 編輯頁選「插入 → 嵌入 → 嵌入程式碼」，貼入 material-changes-embed.txt 全文。\n3. 使用整頁嵌入，或把嵌入區塊拉闊、拉高，再預覽及發布。桌面建議高度至少 720px。\n4. 右上角設定可切換繁體中文／English、縮時速度、提示音及減少動態效果；切換語言保留實驗狀態。\n5. 六種材料可自由選擇次序。拖動材料器皿到加熱區，再拖到冷卻區或冷凍區；水必須冷凍才會重新結冰。六種材料均可冷凍。完成加熱或冷卻／冷凍後會自動出現 A／B／C 觀察題；正確確認後保存這一步，最後回答可逆性判斷才解鎖其他材料。關閉浮窗後可按提示卡「繼續回答」。拿起或移離處理區時溫度與狀態會暫存，放回處理區才繼續變化。至少完成三種，並包含炭、蛋白或麵包，再進入分析。\n\nHTML 和 TXT 完全相同，程式、Three.js、樣式和圖片均內嵌，不連線其他網站。程式碼沒有壓縮或混淆。\n\n供評審查看：HTML 全文，以及 review-source/material-changes 裏的 data.js、simulation.js、scene.js、app.js、style.css。Three.js 授權見 THREE-LICENSE.txt；圖片提示詞見 IMAGE-PROMPT.md。\n\n要從分拆原始碼重新建置：進入 review-source/material-changes，安裝 Node 22.12 或以上，執行 npm install，然後 npm run build。新檔案產生在該目錄 dist 裏。根目錄的另一份 export-material-changes-google-sites.mjs 是 BuiO 工作區的包裝工具。\n\n本機驗證包含 allow-scripts 沙盒、無法使用 localStorage 的環境、封鎖外部網路、桌面、手機直向及橫向、中文及英文。實際 Google Sites 帳戶的貼入和發布仍需使用者預覽確認。\n\n畫面是定性縮時模型，溫度和時間不是實測數據，也不是烹調指引。\n`);
const report = { title: '可逆及不可逆變化', characters: html.length, utf8Bytes: Buffer.byteLength(html),
  sha256: createHash('sha256').update(html).digest('hex'), externalRuntimeFiles: 0, minified: false,
  googleSitesPasteVerified: false, materials: 6, languages: ['zh-Hant', 'en'], buildTime: new Date().toISOString() };
await writeFile(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
