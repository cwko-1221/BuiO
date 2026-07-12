// Hand-crafted 2D platform blocks in flat-cartoon style (thick navy outline,
// clean flat tops) — modelled on Gimkit DLD's themed slab platforms.
// Regenerates the block webps in game-app/public/images/v2/props/.
// After changing a block, run: npm run build:game-assets
import path from 'node:path';
import sharp from 'sharp';

const OUT = path.join(process.cwd(), 'game-app', 'public', 'images', 'v2', 'props');
const O = '#2a3142';   // outline

const svgs = {};

// ---- grass-ledge: earth slab with a scalloped grass cap (forest/farm long)
svgs['grass-ledge'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="208" viewBox="0 0 512 208">
  <rect x="14" y="58" width="484" height="136" rx="26" fill="#a9743f" stroke="${O}" stroke-width="11"/>
  <g fill="#8a5a2e">
    <circle cx="90" cy="130" r="9"/><circle cx="200" cy="155" r="11"/><circle cx="330" cy="128" r="8"/>
    <circle cx="428" cy="152" r="10"/><circle cx="260" cy="112" r="6"/>
  </g>
  <path d="M14 88 Q20 44 66 46 Q86 20 122 34 Q150 12 186 30 Q222 10 254 30 Q288 12 322 32 Q356 14 390 32 Q424 16 452 40 Q494 44 498 88 L498 96 Q470 78 440 90 Q404 70 366 86 Q330 68 294 84 Q258 66 222 84 Q186 68 150 86 Q112 70 76 88 Q40 76 14 96 Z"
        fill="#5fc24e" stroke="${O}" stroke-width="11" stroke-linejoin="round"/>
  <path d="M40 70 Q120 52 250 54 Q380 52 472 70" fill="none" stroke="#8ae06f" stroke-width="14" stroke-linecap="round" opacity=".9"/>
</svg>`;

// ---- stone-ledge: mossy grey slab (forest medium)
svgs['stone-ledge'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="176" viewBox="0 0 512 176">
  <rect x="12" y="34" width="488" height="130" rx="24" fill="#9aa5b4" stroke="${O}" stroke-width="11"/>
  <rect x="12" y="34" width="488" height="34" rx="17" fill="#c2ccd9"/>
  <rect x="12" y="34" width="488" height="130" rx="24" fill="none" stroke="${O}" stroke-width="11"/>
  <g stroke="#6b7688" stroke-width="7" fill="none" stroke-linecap="round">
    <path d="M120 74 L150 108 L138 140"/><path d="M300 80 L282 118"/><path d="M400 76 L424 112 L410 142"/>
  </g>
  <g fill="#5fae4d" stroke="${O}" stroke-width="7">
    <ellipse cx="70" cy="38" rx="30" ry="13"/><ellipse cx="345" cy="36" rx="24" ry="11"/>
  </g>
</svg>`;

// ---- wood-deck: plank platform with posts (farm/market medium)
svgs['wood-deck'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="168" viewBox="0 0 512 168">
  <rect x="36" y="86" width="26" height="72" fill="#8a5a28" stroke="${O}" stroke-width="9"/>
  <rect x="450" y="86" width="26" height="72" fill="#8a5a28" stroke="${O}" stroke-width="9"/>
  <rect x="10" y="26" width="492" height="66" rx="18" fill="#c08a4a" stroke="${O}" stroke-width="11"/>
  <rect x="10" y="26" width="492" height="20" rx="10" fill="#dfa963"/>
  <rect x="10" y="26" width="492" height="66" rx="18" fill="none" stroke="${O}" stroke-width="11"/>
  <g stroke="#8a5a28" stroke-width="8"><path d="M110 30 L110 88"/><path d="M210 30 L210 88"/><path d="M310 30 L310 88"/><path d="M410 30 L410 88"/></g>
  <g fill="#6f4419">
    <circle cx="60" cy="58" r="6"/><circle cx="160" cy="60" r="6"/><circle cx="260" cy="58" r="6"/><circle cx="360" cy="60" r="6"/><circle cx="455" cy="58" r="6"/>
  </g>
</svg>`;

// ---- hay-block: strapped bale (farm step/thick)
svgs['hay-block'] = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280">
  <rect x="14" y="40" width="372" height="226" rx="30" fill="#e3b64e" stroke="${O}" stroke-width="12"/>
  <g stroke="#b98a2c" stroke-width="6" opacity=".85">
    <path d="M30 90 L370 70"/><path d="M30 140 L370 120"/><path d="M30 190 L370 172"/><path d="M30 236 L370 222"/>
    <path d="M80 48 L60 258"/><path d="M330 48 L348 258"/>
  </g>
  <rect x="118" y="40" width="34" height="226" fill="#9a6b2f" stroke="${O}" stroke-width="9"/>
  <rect x="248" y="40" width="34" height="226" fill="#9a6b2f" stroke="${O}" stroke-width="9"/>
  <path d="M20 56 Q60 22 110 40 Q160 16 205 38 Q255 18 300 40 Q350 24 382 54" fill="none" stroke="#f4d689" stroke-width="16" stroke-linecap="round"/>
</svg>`;

// ---- ice-slab: glossy platform with icicles (snow medium)
svgs['ice-slab'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="190" viewBox="0 0 512 190">
  <g stroke="${O}" stroke-width="10" fill="#bfe3f8" stroke-linejoin="round">
    <path d="M120 128 L138 178 L156 128 Z"/><path d="M280 128 L294 168 L308 128 Z"/><path d="M400 128 L416 184 L432 128 Z"/>
  </g>
  <rect x="12" y="22" width="488" height="116" rx="24" fill="#cfe9fb" stroke="${O}" stroke-width="11"/>
  <rect x="12" y="22" width="488" height="30" rx="15" fill="#eef8ff"/>
  <rect x="12" y="22" width="488" height="116" rx="24" fill="none" stroke="${O}" stroke-width="11"/>
  <g stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity=".9">
    <path d="M80 96 L150 66"/><path d="M330 108 L420 70"/>
  </g>
  <g stroke="#93c5e8" stroke-width="7" stroke-linecap="round"><path d="M210 60 L245 100"/><path d="M255 100 L268 116"/></g>
</svg>`;

// ---- snow-ledge: snowdrift cap over icy body (snow long)
svgs['snow-ledge'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="208" viewBox="0 0 512 208">
  <rect x="14" y="66" width="484" height="128" rx="26" fill="#b9d7ec" stroke="${O}" stroke-width="11"/>
  <g stroke="#8fb6d6" stroke-width="7" fill="none" stroke-linecap="round">
    <path d="M110 110 L140 146"/><path d="M300 116 L282 150"/><path d="M420 108 L400 148"/>
  </g>
  <path d="M14 96 Q10 52 64 54 Q92 26 140 42 Q186 20 232 40 Q278 22 324 42 Q370 26 416 44 Q470 34 498 74 L498 100 Q460 82 420 96 Q378 78 336 94 Q294 76 252 94 Q210 78 168 96 Q126 80 84 98 Q46 84 14 102 Z"
        fill="#f6fbff" stroke="${O}" stroke-width="11" stroke-linejoin="round"/>
</svg>`;

// ---- metal-deck: industrial deck with light top rail (factory long)
svgs['metal-deck'] = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="176" viewBox="0 0 512 176">
  <rect x="12" y="46" width="488" height="118" rx="14" fill="#5b6373" stroke="${O}" stroke-width="11"/>
  <g stroke="#454c5c" stroke-width="7"><path d="M140 52 L140 158"/><path d="M270 52 L270 158"/><path d="M400 52 L400 158"/></g>
  <g fill="#3a4152">
    <rect x="52" y="86" width="52" height="36" rx="7"/><rect x="182" y="92" width="46" height="30" rx="7"/>
    <rect x="308" y="86" width="52" height="36" rx="7"/><rect x="432" y="92" width="42" height="30" rx="7"/>
  </g>
  <g fill="#8be3c8"><circle cx="70" cy="72" r="6"/><circle cx="250" cy="72" r="6"/><circle cx="430" cy="72" r="6"/></g>
  <rect x="6" y="20" width="500" height="30" rx="12" fill="#9aa5b5" stroke="${O}" stroke-width="10"/>
  <g stroke="#6e7889" stroke-width="7"><path d="M90 24 L90 46"/><path d="M200 24 L200 46"/><path d="M310 24 L310 46"/><path d="M420 24 L420 46"/></g>
</svg>`;

// ---- metal-bracket: small wall shelf with strut (factory step)
svgs['metal-bracket'] = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
  <path d="M60 58 L110 150 L150 150" fill="none" stroke="${O}" stroke-width="26" stroke-linecap="round"/>
  <path d="M60 58 L110 150 L150 150" fill="none" stroke="#7b8494" stroke-width="14" stroke-linecap="round"/>
  <rect x="10" y="22" width="280" height="38" rx="12" fill="#9aa5b5" stroke="${O}" stroke-width="10"/>
  <rect x="10" y="22" width="280" height="14" rx="7" fill="#c2ccd9"/>
  <rect x="10" y="22" width="280" height="38" rx="12" fill="none" stroke="${O}" stroke-width="10"/>
  <g fill="#3a4152"><circle cx="40" cy="42" r="6"/><circle cx="150" cy="42" r="6"/><circle cx="260" cy="42" r="6"/></g>
</svg>`;

const names = Object.keys(svgs);
for (const id of names) {
  await sharp(Buffer.from(svgs[id])).webp({ quality: 92, alphaQuality: 96 }).toFile(path.join(OUT, `${id}.webp`));
}
console.log(`Generated ${names.length} block sprites: ${names.join(', ')}`);
