import { readFile } from 'node:fs/promises';

const requiredFiles = ['index.html', 'src/main.js', 'src/styles.css', 'server.js'];

for (const file of requiredFiles) {
  const content = await readFile(file, 'utf8');
  if (!content.trim()) {
    throw new Error(`${file} is empty`);
  }
}

const i18n = await readFile('src/i18n.js', 'utf8');
const shell = await readFile('src/views/Shell.js', 'utf8');
const dashboard = await readFile('src/views/Dashboard.js', 'utf8');
const settings = await readFile('src/views/Settings.js', 'utf8');

if (!i18n.includes('數學練習')) throw new Error(`Missing expected marker: 數學練習`);
if (!i18n.includes('互動白板')) throw new Error(`Missing expected marker: 互動白板`);
if (!dashboard.includes('renderDashboard')) throw new Error(`Missing expected marker: renderDashboard`);
if (!settings.includes('settingsForm')) throw new Error(`Missing expected marker: settingsForm`);

console.log('Static app check passed.');
