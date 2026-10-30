import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { configuration } from './config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { settings, capacitor } = await configuration({
  backendUrl: process.env.BUIO_APP_URL,
  development: process.argv.includes('--dev')
});
const output = path.join(root, 'www');
await mkdir(output, { recursive: true });
await writeFile(path.join(root, 'capacitor.config.json'), JSON.stringify(capacitor, null, 2) + '\n');
for (const file of ['offline.html', 'offline.css', 'offline.js']) {
  await copyFile(path.join(root, 'web', file), path.join(output, file));
}
const mobileCSS = await readFile(path.join(root, 'web/mobile.css'), 'utf8');
const runtime = (await readFile(path.join(root, 'web/runtime.js'), 'utf8'))
  .replace("/* BUIO_MOBILE_CSS */ ''", JSON.stringify(mobileCSS).replaceAll('<', '\\u003c'));
await writeFile(path.join(output, 'runtime.js'), runtime);
// A real local index is required by Capacitor. It also provides a useful
// fallback if the native bridge is started without a network connection.
await copyFile(path.join(root, 'web/offline.html'), path.join(output, 'index.html'));
await writeFile(path.join(output, 'settings.js'),
  `window.BuiOAppSettings = Object.freeze(${JSON.stringify({ backendUrl: settings.backendUrl, version: settings.version }).replaceAll('<', '\\u003c')});\n`);
const modules = JSON.parse(await readFile(path.join(root, 'modules.json'), 'utf8'));
await writeFile(path.join(output, 'pilot-manifest.json'), JSON.stringify({
  version: settings.version,
  mode: 'online-compatibility-pilot',
  backendUrl: settings.backendUrl,
  bundledAssets: ['index.html', 'offline.html', 'offline.css', 'offline.js', 'runtime.js', 'settings.js'],
  modules
}, null, 2) + '\n');
console.log(`Prepared ${settings.appName} ${settings.version}: ${settings.backendUrl}`);
console.log('Online pilot: website modules still load over HTTPS; no offline/game-performance claim.');

