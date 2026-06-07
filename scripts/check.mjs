import { readFile } from 'node:fs/promises';

const requiredFiles = ['index.html', 'src/main.js', 'src/styles.css', 'server.js'];

for (const file of requiredFiles) {
  const content = await readFile(file, 'utf8');
  if (!content.trim()) {
    throw new Error(`${file} is empty`);
  }
}

const app = await readFile('src/main.js', 'utf8');
for (const marker of ['數學練習', '互動白板', 'renderDashboard', 'settingsForm']) {
  if (!app.includes(marker)) {
    throw new Error(`Missing expected marker: ${marker}`);
  }
}

console.log('Static app check passed.');
