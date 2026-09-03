import sharp from 'sharp';
import path from 'node:path';
import process from 'node:process';

const outDir=path.join(process.cwd(),'game-app/public/images/v2/props');
const navy='#17233f', green='#42c85a', yellow='#ffd743', cream='#fff7c7';

async function render(id,width,height,markup) {
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>.zh{font-family:"Microsoft JhengHei","Noto Sans CJK TC",Arial,sans-serif;font-weight:900;paint-order:stroke;stroke:${navy};stroke-width:18px;stroke-linejoin:round}</style>
    ${markup}
  </svg>`);
  await sharp(svg).resize(512,256,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:94,alphaQuality:100}).toFile(path.join(outDir,`${id}.webp`));
}

await render('ref-jump-arrow',512,512,`
  <path d="M86 402 C142 354 184 304 212 236 L154 258 L270 92 L388 174 L326 180 C298 286 222 374 130 430 Z" fill="${green}" stroke="${navy}" stroke-width="18" stroke-linejoin="round"/>
  <path d="M116 382 C174 332 208 278 228 216" fill="none" stroke="#9bf3a9" stroke-width="18" stroke-linecap="round" opacity=".75"/>
`);

await render('ref-run-jump-sign',1024,320,`
  <text class="zh" x="512" y="130" text-anchor="middle" font-size="76" fill="${yellow}">跑動時起跳</text>
  <text class="zh" x="512" y="235" text-anchor="middle" font-size="76" fill="${yellow}">跳得更遠！</text>
`);

await render('ref-double-jump-sign',640,420,`
  <path d="M110 300 L188 208 L151 214 L225 104 L302 180 L262 184 L188 300 Z" fill="${green}" stroke="${navy}" stroke-width="14"/>
  <path d="M276 300 L354 208 L317 214 L391 104 L468 180 L428 184 L354 300 Z" fill="${green}" stroke="${navy}" stroke-width="14"/>
  <text class="zh" x="320" y="385" text-anchor="middle" font-size="72" fill="${yellow}">二段跳！</text>
`);

await render('ref-zone-title',920,360,`
  <text class="zh" x="460" y="112" text-anchor="middle" font-size="58" fill="${cream}">高峰 1/6</text>
  <text class="zh" x="460" y="245" text-anchor="middle" font-size="102" fill="#55ef78">熔城攀登</text>
`);

console.log('Generated 4 deterministic reference signage assets.');
