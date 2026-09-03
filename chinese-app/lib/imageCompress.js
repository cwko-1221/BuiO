'use strict';

// Shrink uploaded images before they hit storage. Aim is "fits a 800x800
// box, JPEG q75" — typical phone photo drops from a few MB to ~50–150 KB.
// Stretches Supabase's 1 GB / GitHub repo size a LOT further.

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }

const MAX_DIM = 800;
const JPEG_QUALITY = 75;
const SKIP_BELOW_BYTES = 50 * 1024;   // already small — don't waste CPU

async function compressForUpload(buffer, contentType) {
  if (!sharp) return { buffer, contentType: contentType || 'image/jpeg' };
  if (!buffer || buffer.length < SKIP_BELOW_BYTES) {
    return { buffer, contentType: contentType || 'image/jpeg' };
  }
  // Preserve GIFs (could be animated) and SVGs (vector; sharp would rasterise).
  const mt = String(contentType || '').toLowerCase();
  if (mt.includes('gif') || mt.includes('svg')) {
    return { buffer, contentType };
  }
  try {
    const out = await sharp(buffer)
      .rotate()                       // honour EXIF orientation
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
    return { buffer: out, contentType: 'image/jpeg' };
  } catch (e) {
    console.warn('[imageCompress] fell back to original:', e.message);
    return { buffer, contentType: contentType || 'image/jpeg' };
  }
}

module.exports = { compressForUpload };
