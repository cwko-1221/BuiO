import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
const source = path.resolve('artifacts/park-art/modular-v4');
const destination = path.resolve('pet-app/public/assets/art/park/modular-v4');
await fs.mkdir(destination, { recursive: true });
const assets = {};
for (const key of ['grass', 'stone', 'soil', 'water', 'sprout', 'crop-tulips', 'crop-sunflowers', 'crop-daisies', 'border-flowers', 'border-lavender', 'waterworks', 'bank-rocks']) {
  const input = path.join(source, `${key}-source.png`);
  try { await fs.access(input); } catch { if (!['grass','stone','soil'].includes(key)) continue; throw Error(`Missing ${input}`); }
  const image = sharp(input);
  if (!['grass','stone','soil','water'].includes(key)) image.trim().resize({width: key.startsWith('border') ? 768 : 384, withoutEnlargement:true});
  const {data:buffer,info} = await image.webp({ quality: 94, effort: 6 }).toBuffer({resolveWithObject:true});
  const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12), file = `${key}-${hash}.webp`;
  await fs.writeFile(path.join(destination, file), buffer);
  assets[key] = { file, width: info.width, height: info.height, bytes: buffer.length };
}
await fs.writeFile('pet-app/src/park/modular-art-assets.json', JSON.stringify({ version:'modular-v4', generator:'Built-in ImageGen; native-size Sharp WebP packaging only', assets }, null, 2) + '\n');
console.log(JSON.stringify(assets));
