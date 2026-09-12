/**
 * Remove the patch files no manifest entry points at any more.
 *
 * Publishing stamps a patch's name with the hash of its contents, so re-baking an item writes a new
 * file and leaves the old one behind. Nothing reads them — the manifest is the only way in — but
 * they go on shipping with the app.
 *
 *   node scripts/sweep-outfit-atlas-orphans.mjs [--delete]
 */
import fs from 'node:fs';
import path from 'node:path';

const DELETE = process.argv.includes('--delete');
let freed = 0, gone = 0;
for (const root of ['pet-app/public/assets/art/outfit-atlases', 'pet-app/dist/assets/art/outfit-atlases']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const used = new Set(Object.values(manifest.modular).map((e) => e.patch.split('/').pop()));
  const all = fs.readdirSync(root).filter((n) => n.endsWith('.webp'));
  const missing = [...used].filter((n) => !all.includes(n));
  if (missing.length) throw new Error(`${root}: ${missing.length} file(s) the manifest needs are not there — ${missing[0]}`);
  const orphans = all.filter((n) => !used.has(n));
  let bytes = 0;
  for (const n of orphans) {
    bytes += fs.statSync(path.join(root, n)).size;
    if (DELETE) fs.rmSync(path.join(root, n));
  }
  freed += bytes; gone += orphans.length;
  console.log(`${root}\n   ${all.length} files, ${used.size} in the manifest, ${orphans.length} orphaned (${(bytes / 1048576).toFixed(1)} MB)${DELETE ? ' — removed' : ''}`);
}
console.log(`${gone} file(s), ${(freed / 1048576).toFixed(1)} MB${DELETE ? ' removed' : ' would be removed'}`);
