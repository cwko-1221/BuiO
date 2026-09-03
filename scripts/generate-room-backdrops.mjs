/** Build the shared black starfield shown beyond every contained 16:9 room. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog');
const [inputPath = 'pet-app/art-source/imagegen/room-backdrops/universal-black-starfield-v1.png'] = process.argv.slice(2);
const SIZE = 2048;
const outputRoot = path.resolve('pet-app/public/assets/art/room-backdrops');
const proofRoot = path.resolve('artifacts/pet-room-backdrops');
await fs.mkdir(outputRoot, { recursive: true });
await fs.mkdir(proofRoot, { recursive: true });

const urls = new Set(catalog.rooms.map((room) => room.backdrop));
if (urls.size !== 1) throw new Error('Every room must use the same starfield backdrop.');
const publicUrl = [...urls][0];
const fileName = new URL(publicUrl, 'https://local.invalid').pathname.split('/').pop();
const outputPath = path.join(outputRoot, fileName);
await sharp(inputPath)
  .resize(SIZE, SIZE, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
  .webp({ quality: 90, effort: 5 })
  .toFile(outputPath);
await sharp(outputPath).png().toFile(path.join(proofRoot, 'universal-black-starfield.png'));
const stat = await fs.stat(outputPath);
const output = { id: 'universal-black-starfield', publicUrl, outputPath, bytes: stat.size };
await fs.writeFile(path.join(proofRoot, 'room-backdrops.json'), `${JSON.stringify({ source: inputPath, size: [SIZE, SIZE], rooms: catalog.rooms.map((room) => room.id), output }, null, 2)}\n`);
console.log(JSON.stringify({ count: 1, rooms: catalog.rooms.length, size: [SIZE, SIZE], proof: path.join(proofRoot, 'universal-black-starfield.png') }, null, 2));
