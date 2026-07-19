import sharp from 'sharp';

const root = 'C:/Users/kochu/.codex/attachments/e2b27733-5ce6-4f15-9ae7-0b04cd1ebb0c';
const cellW = 480;
const cellH = 300;
const cols = 3;
const rows = 5;
const composites = [];
for (let index = 1; index <= 14; index += 1) {
  const thumb = await sharp(`${root}/image-${index}.png`)
    .resize(cellW - 16, cellH - 42, { fit: 'contain', background: '#17233f' })
    .png()
    .toBuffer();
  const x = ((index - 1) % cols) * cellW + 8;
  const y = Math.floor((index - 1) / cols) * cellH + 34;
  composites.push({ input: thumb, left: x, top: y });
  composites.push({
    input: Buffer.from(`<svg width="${cellW}" height="34"><rect width="100%" height="100%" fill="#11182e"/><text x="16" y="24" fill="white" font-size="22" font-family="Arial">image-${index}.png</text></svg>`),
    left: x - 8,
    top: y - 34,
  });
}
await sharp({ create: { width: cellW * cols, height: cellH * rows, channels: 4, background: '#0b1024' } })
  .composite(composites)
  .png()
  .toFile('tmp/reference-contact-sheet.png');
