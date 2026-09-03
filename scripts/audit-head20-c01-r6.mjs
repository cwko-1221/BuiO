/** Independent mechanical audit for the frozen-candidate handoff. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve(process.argv[2] ?? 'artifacts/head20-attempt6-per-cell/c01/v2/revision-6');
const SIZE = 160; const C = 4;
const read = (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const fileSha = async (p) => sha(await fs.readFile(p));
const basePath = path.resolve('artifacts/head20-attempt6-per-cell/c01/c01-base-original-160x160.png');
const tailPath = path.resolve('artifacts/head20-attempt6-per-cell/c01/v2/c01-tail-visible-pixels-mask.png');
const targetPath = path.join(out, 'r6-target-coordinate-locked-160x160.png');
const layerPath = path.join(out, 'r6-helmet-layer-same-coordinate-160x160.png');
const maskPath = path.join(out, 'r6-helmet-mask-same-coordinate-160x160.png');
const extensionPath = path.join(out, 'r6-left-earcup-extension-allowed-mask.png');
const [base, tail, target, layer, mask, extension] = await Promise.all([basePath, tailPath, targetPath, layerPath, maskPath, extensionPath].map(read));
const inOld = (x, y) => (x >= 38 && x < 137 && y >= 5 && y < 127) || (x >= 31 && x < 38 && y >= 28 && y < 101);
// The r6 extension is diagnostic evidence only; production support must be
// contained by the original c01 semantic union.
const allowed = (x, y) => inOld(x, y);
const same = (a, b, at) => a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3];
let targetOutsideDiff = 0; let supportMismatch = 0; let tailIntersection = 0; let bodyIntersection = 0; let outsideMask = 0; let exactCompositeMismatch = 0;
const composite = Buffer.from(base.data);
for (let p = 0; p < SIZE * SIZE; p += 1) {
  const x = p % SIZE; const y = Math.floor(p / SIZE); const at = p * C; const active = mask.data[at + 3] > 0;
  if (active) { composite[at] = layer.data[at]; composite[at + 1] = layer.data[at + 1]; composite[at + 2] = layer.data[at + 2]; composite[at + 3] = layer.data[at + 3]; }
  if (!allowed(x, y) && !same(target.data, base.data, at)) targetOutsideDiff += 1;
  if ((layer.data[at + 3] > 0) !== active) supportMismatch += 1;
  if (active && !allowed(x, y)) outsideMask += 1;
  if (active && tail.data[at + 3] >= 128) tailIntersection += 1;
  if (active && y >= 101) bodyIntersection += 1;
  if (!same(composite, target.data, at)) exactCompositeMismatch += 1;
}
const binary = new Uint8Array(SIZE * SIZE); for (let p = 0; p < binary.length; p += 1) binary[p] = mask.data[p * C + 3] > 0 ? 1 : 0;
const dirs = [[1,0],[-1,0],[0,1],[0,-1]]; const seen = new Uint8Array(binary.length); let components = 0;
for (let seed = 0; seed < binary.length; seed += 1) if (binary[seed] && !seen[seed]) { components += 1; const q=[seed]; seen[seed]=1; for(let i=0;i<q.length;i++){const p=q[i],x=p%SIZE,y=Math.floor(p/SIZE);for(const[dx,dy]of dirs){const X=x+dx,Y=y+dy,n=Y*SIZE+X;if(X>=0&&Y>=0&&X<SIZE&&Y<SIZE&&binary[n]&&!seen[n]){seen[n]=1;q.push(n)}}} }
const exterior = new Uint8Array(binary.length); const q=[]; const visit=(x,y)=>{const p=y*SIZE+x;if(!binary[p]&&!exterior[p]){exterior[p]=1;q.push(p)}}; for(let x=0;x<SIZE;x++){visit(x,0);visit(x,SIZE-1)} for(let y=0;y<SIZE;y++){visit(0,y);visit(SIZE-1,y)} for(let i=0;i<q.length;i++){const p=q[i],x=p%SIZE,y=Math.floor(p/SIZE);for(const[dx,dy]of dirs){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<SIZE&&Y<SIZE)visit(X,Y)}}
let holes=0; let pixels=0; for(let p=0;p<binary.length;p+=1){if(binary[p])pixels+=1;else if(!exterior[p])holes+=1;}
const rawCrop = [260,167,764,630];
const rawPath = path.join(out, 'r6-raw-full-dressed-imagegen-source.png');
const raw = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
const rawMarginPixels = rawCrop[0] - 0; // left crop starts at 260; source subject begins at x301 in the audited raw alpha analysis.
const report = { schemaVersion:1, job:'starpatch-cat:1:head-20', cell:'c01', revision:'r6', verdict: components===1&&holes===0&&targetOutsideDiff===0&&supportMismatch===0&&outsideMask===0&&tailIntersection===0&&bodyIntersection===0&&exactCompositeMismatch===0 ? 'PASS_MECHANICAL_PENDING_VISUAL_CRITIC' : 'REJECT', inputs:{base:{path:basePath,sha256:await fileSha(basePath)},tail:{path:tailPath,sha256:await fileSha(tailPath)},raw:{path:rawPath,sha256:await fileSha(rawPath),dimensions:[raw.info.width,raw.info.height,raw.info.channels]},semanticExtension:{path:extensionPath,sha256:await fileSha(extensionPath)}}, cropMarginEvidence:{rawHelmetCrop:rawCrop, transparentColumnsBeforeFirstSubjectAlpha:41, sourceSubjectLeftX:301, cropLeftX:260, note:'the expanded crop deliberately includes x260..300 before the raw source’s first foreground alpha at x301'}, outputs:{target:{path:targetPath,sha256:await fileSha(targetPath)},layer:{path:layerPath,sha256:await fileSha(layerPath)},mask:{path:maskPath,sha256:await fileSha(maskPath)}}, metrics:{maskPixels:pixels,components4Connected:components,enclosedHoles:holes,targetOutsideAllowedBaseDiffPixels:targetOutsideDiff,layerMaskSupportMismatchPixels:supportMismatch,maskOutsideAllowedPixels:outsideMask,tailIntersectionPixels:tailIntersection,bodyLegPawBowlIntersectionPixels:bodyIntersection,zeroTransformSourceOverExactTargetMismatchPixels:exactCompositeMismatch}, scope:'in-memory zero-transform source-over audit only; no composite image and no runtime/publish output were written', publishable:false };
await fs.writeFile(path.join(out,'r6-mechanical-audit.json'), `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify(report,null,2));
