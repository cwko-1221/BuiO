// Independent rebuild entry for reviewers: npm install && npm run build.
// Requires Node >= 20.19 or >= 22.12, as required by Vite 8.
import { build } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const source = path.dirname(fileURLToPath(import.meta.url));
const image = `data:image/webp;base64,${(await readFile(path.join(source, 'assets/ice-water-ice.webp'))).toString('base64')}`;
const atlas = `data:image/webp;base64,${(await readFile(path.join(source, 'assets/material-icons.webp'))).toString('base64')}`;
const result = await build({ configFile: false, root: source, publicDir: false, logLevel: 'warn',
  plugins: [{ name: 'inline-observation', enforce: 'pre', async load(id) {
    if (id.replaceAll('\\', '/').endsWith('/app.js')) {
      const code = await readFile(path.join(source, 'app.js'), 'utf8');
      return code.replace("new URL('./assets/ice-water-ice.webp', import.meta.url).href", JSON.stringify(image))
        .replace("new URL('./assets/material-icons.webp', import.meta.url).href", JSON.stringify(atlas));
    }
  } }], build: { write: false, target: 'es2020', minify: false, sourcemap: false,
    lib: { entry: path.join(source, 'app.js'), name: 'MaterialChangeLab', formats: ['iife'] },
    rolldownOptions: { output: { codeSplitting: false } } } });
const chunks = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
assert.equal(chunks.length, 1); assert.equal(chunks[0].type, 'chunk'); assert.equal(chunks[0].imports.length, 0);
let html = await readFile(path.join(source, 'index.html'), 'utf8');
html = html.replace('</head>', `<style>\n${await readFile(path.join(source, 'style.css'), 'utf8')}\n</style>\n</head>`)
  .replace('<script type="module" src="./app.js"></script>', `<script>\n${chunks[0].code.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(source, 'dist');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'material-changes.html'), html);
await writeFile(path.join(output, 'material-changes-embed.txt'), html);
console.log(`Built standalone HTML in ${output}`);
