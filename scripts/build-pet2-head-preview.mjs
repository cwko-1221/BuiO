import sharp from 'sharp';

const root = 'C:/Users/kochu/Documents/BuiO/pet-app/art-source/imagegen/baked-wearables/cat';
const ids = ['head-05', 'head-06', 'head-07', 'head-08', 'head-20'];
const stats = [];
const layers = [];

for (let k = 0; k < ids.length; k += 1) {
  const id = ids[k];
  const source = `${root}/${id}/${id}-pet2-dressed-atlas-v1-4096.png`;
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = info.width * info.height;
  const foreground = new Uint8Array(count);
  const seen = new Uint8Array(count);
  for (let p = 0; p < count; p += 1) foreground[p] = data[p * 4 + 3] >= 32 ? 1 : 0;
  let components = 0;
  for (let seed = 0; seed < count; seed += 1) {
    if (!foreground[seed] || seen[seed]) continue;
    components += 1;
    seen[seed] = 1;
    const stack = [seed];
    for (let q = 0; q < stack.length; q += 1) {
      const p = stack[q], x = p % info.width, y = Math.floor(p / info.width);
      const neighbors = [x ? p - 1 : -1, x + 1 < info.width ? p + 1 : -1, y ? p - info.width : -1, y + 1 < info.height ? p + info.width : -1];
      for (const next of neighbors) {
        if (next >= 0 && foreground[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
  }
  stats.push({ id, width: info.width, height: info.height, channels: info.channels, hasAlpha: true, components });
  layers.push({ input: await sharp(source).resize(768, 768).png().toBuffer(), left: (k % 3) * 768, top: Math.floor(k / 3) * 768 });
}

const preview = 'C:/Users/kochu/Documents/BuiO/artifacts/pet2-head05-head08-head20-preview.png';
await sharp({ create: { width: 2304, height: 1536, channels: 4, background: '#382f31ff' } })
  .composite(layers)
  .png()
  .toFile(preview);
console.log(JSON.stringify({ stats, preview }, null, 2));
