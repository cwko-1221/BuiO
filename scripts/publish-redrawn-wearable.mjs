/** Publish registered per-item redraw layers and add them to the shared outfit manifest. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [
  petId, stageArg, wearableId, slot, patchPath, erasePath, rearPath = '', frontPath = '', occludesArg = '',
  frontErasePath = '',
] = process.argv.slice(2);
if (!petId || !stageArg || !wearableId || !slot) {
  console.error('usage: node scripts/publish-redrawn-wearable.mjs <pet-id> <stage> <wearable-id> <slot> <patch|-> [erase|-] [rear|-] [front|-] [occluded-slots] [front-erase|-]');
  process.exit(1);
}
const stage = Number(stageArg);
if (!Number.isInteger(stage) || stage < 1 || stage > 4) throw new Error(`invalid stage: ${stageArg}`);

const workspace = process.cwd();
const outputFolder = path.join(workspace, 'pet-app', 'public', 'assets', 'art', 'outfit-atlases');
const manifestPath = path.join(outputFolder, 'manifest.json');
await fs.mkdir(outputFolder, { recursive: true });

const publish = async (kind, input) => {
  if (!input || input === '-') return undefined;
  const buffer = await sharp(input).ensureAlpha().webp({ lossless: true, alphaQuality: 100 }).toBuffer();
  const stamp = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 10);
  const name = `${petId}-${stage}--${wearableId}--${kind}-${stamp}.webp`;
  await fs.writeFile(path.join(outputFolder, name), buffer);
  return `/pet/assets/art/outfit-atlases/${name}`;
};

const [patch, erase, rear, front, frontErase] = await Promise.all([
  publish('patch', patchPath), publish('erase', erasePath), publish('rear', rearPath), publish('front', frontPath),
  publish('front-erase', frontErasePath),
]);
let manifest = { version: 2, atlases: {}, modular: {} };
try { manifest = { ...manifest, ...JSON.parse(await fs.readFile(manifestPath, 'utf8')) }; } catch { /* first asset */ }
manifest.version = Math.max(2, Number(manifest.version) || 0);
manifest.atlases ??= {};
manifest.modular ??= {};
manifest.modular[`${petId}:${stage}:${wearableId}`] = {
  slot,
  ...occludesArg && occludesArg !== '-' && { occludes: occludesArg.split(',').map((value) => value.trim()).filter(Boolean) },
  ...patch && { patch },
  ...erase && { erase },
  ...rear && { rear },
  ...frontErase && { frontErase },
  ...front && { front },
};
manifest.atlases = Object.fromEntries(Object.entries(manifest.atlases).sort(([a], [b]) => a.localeCompare(b)));
manifest.modular = Object.fromEntries(Object.entries(manifest.modular).sort(([a], [b]) => a.localeCompare(b)));
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ key: `${petId}:${stage}:${wearableId}`, ...manifest.modular[`${petId}:${stage}:${wearableId}`] }, null, 2));
