// Copy a verified local build into the development preview, retaining old chunks.
import fs from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('.'), source = path.resolve(process.argv[2] || 'artifacts/pet-park-adventure-build'), destination = path.join(root, 'pet-app/dist');
if (!source.startsWith(path.join(root, 'artifacts') + path.sep)) throw Error('Preview build must be inside this workspace artifacts directory');
const files = (await fs.readdir(path.join(source, 'assets'), { withFileTypes: true })).filter(e => e.isFile()).map(e => 'assets/' + e.name);
const battleManifest = 'assets/art/brawl/manifest.json';
try {
  const battle = JSON.parse(await fs.readFile(path.join(source, battleManifest), 'utf8'));
  files.push(battleManifest);
  for (const fighter of Object.values(battle.fighters || {})) if (fighter.runtimePacked) {
    for (const url of fighter.pages) {
      if (!url.startsWith('/pet/assets/art/brawl/')) throw Error('Unexpected packed battle asset path');
      files.push(url.slice('/pet/'.length));
    }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [manifest, directory] of [['wish-plaza-assets.json', 'wish-plaza-v1'], ['world-art-assets.json', 'full-park-v1'], ['adventure-art-assets.json', 'adventure-v2'], ['storybook-art-assets.json', 'storybook-v3'], ['modular-art-assets.json', 'modular-v4'], ['sky-art-assets.json', 'sky-patrol-v2'], ['leisure-art-assets.json', 'leisure-v1'], ['community-art-assets.json', 'community-v1'], ['fishing-art-assets.json', 'fishing-v2'], ['market-art-assets.json', 'market-v1']]) {
  const data = JSON.parse(await fs.readFile(path.join(root, 'pet-app/src/park', manifest), 'utf8'));
  for (const asset of Object.values(data.assets)) files.push(`assets/art/park/${directory}/${asset.file}`);
}
let copied = 0;
for (const file of [...new Set(files), 'index.html']) {
  const target = path.resolve(destination, file);
  if (!target.startsWith(destination + path.sep)) throw Error('Preview destination escaped its directory');
  const buffer = await fs.readFile(path.join(source, file));
  let current; try { current = await fs.readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (current?.equals(buffer)) continue;
  await fs.mkdir(path.dirname(target), { recursive: true });
  // Replace the entry atomically: Windows preview/AV readers may briefly hold it.
  const temporary = target + `.preview-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, buffer);
    for (let attempt = 0; ; attempt++) {
      try { await fs.rename(temporary, target); break; }
      catch (error) { if (attempt >= 8 || !['EPERM', 'EBUSY', 'UNKNOWN'].includes(error.code)) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
    }
  } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  copied++;
}
const html = await fs.readFile(path.join(destination, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\/pet\/([^"?]+)(?:\?[^"]*)?"/g)) await fs.access(path.join(destination, match[1]));
console.log(JSON.stringify({ destination, changedFiles: copied, retainedExistingChunks: true }));
