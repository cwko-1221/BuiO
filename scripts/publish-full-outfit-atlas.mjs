/** Publish a complete, redrawn dressed-pet atlas and add it to the runtime manifest. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [petId, stageArg, outfitArg, input] = process.argv.slice(2);
if (!petId || !stageArg || !outfitArg || !input) {
  console.error('usage: node scripts/publish-full-outfit-atlas.mjs <pet-id> <stage> <item+ids> <input.png>');
  process.exit(1);
}

const stage = Number(stageArg);
if (!Number.isInteger(stage) || stage < 1 || stage > 4) throw new Error('stage must be 1..4');
const outfit = outfitArg.split('+').filter(Boolean).sort().join('+');
if (!outfit) throw new Error('outfit must contain at least one item id');

const metadata = await sharp(input).metadata();
if (metadata.width !== 800 || metadata.height !== 640) {
  throw new Error(`${input} must be the normalized 800x640 (5x4) atlas`);
}

const encoded = await sharp(input)
  .webp({ quality: 95, alphaQuality: 100, smartSubsample: true })
  .toBuffer();
const stamp = crypto.createHash('sha256').update(encoded).digest('hex').slice(0, 10);
const safeOutfit = outfit.replaceAll('+', '--');
const fileName = `${petId}-${stage}--${safeOutfit}-${stamp}.webp`;
const folder = path.resolve('pet-app/public/assets/art/outfit-atlases');
const manifestPath = path.join(folder, 'manifest.json');
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, fileName), encoded);

let manifest = { version: 1, atlases: {} };
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* first publish */ }
manifest.version = 1;
manifest.atlases ||= {};
const key = `${petId}:${stage}:${outfit}`;
manifest.atlases[key] = `/pet/assets/art/outfit-atlases/${fileName}`;
const ordered = Object.fromEntries(Object.entries(manifest.atlases).sort(([a], [b]) => a.localeCompare(b)));
await fs.writeFile(manifestPath, `${JSON.stringify({ version: 1, atlases: ordered }, null, 2)}\n`);

console.log(`${key} -> ${fileName}`);
