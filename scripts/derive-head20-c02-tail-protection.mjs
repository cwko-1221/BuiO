/**
 * c02-only visible tail protection.  The polygon follows the separately
 * visible curl on the frame's screen-right; it deliberately stops before the
 * merged haunch/chest so those remain protected by their own lower-body rule.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, outArg] = process.argv.slice(2);
if (!baseArg || !outArg) throw new Error('usage: node scripts/derive-head20-c02-tail-protection.mjs <base160> <out-dir>');
const SIZE=160, C=4; const basePath=path.resolve(baseArg), out=path.resolve(outArg);
const {data:base,info}=await sharp(basePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
if(info.width!==SIZE||info.height!==SIZE)throw new Error('expected 160x160 base');
const sha=(v)=>crypto.createHash('sha256').update(v).digest('hex'); const hashFile=async(p)=>sha(await fs.readFile(p));
// Clockwise outer tail contour, then return along the tail/body separation.
const polygon=[[123,27],[133,24],[143,28],[150,37],[153,48],[153,57],[149,66],[143,73],[136,78],[128,82],[122,80],[121,75],[125,68],[129,61],[130,54],[128,47],[124,40]];
const inside=(x,y)=>{let hit=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [xi,yi]=polygon[i],[xj,yj]=polygon[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)hit=!hit;}return hit;};
const mask=Buffer.alloc(SIZE*SIZE*C);let pixels=0,bounds=[SIZE,SIZE,-1,-1];
for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const at=(y*SIZE+x)*C;if(inside(x+.5,y+.5)&&base[at+3]>=128){mask[at]=mask[at+1]=mask[at+2]=mask[at+3]=255;pixels++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x),Math.max(bounds[3],y)];}}
await fs.mkdir(out,{recursive:true});const maskPath=path.join(out,'c02-tail-visible-pixels-mask.png');await sharp(mask,{raw:{width:SIZE,height:SIZE,channels:C}}).png({compressionLevel:9}).toFile(maskPath);
const evidence={schemaVersion:1,job:'starpatch-cat:1:head-20',cell:'c02',purpose:'exact c02 visible tail alpha pixels only, derived from the independent original c02 base; no c01 artifact used',inputs:{basePath,baseSha256:await hashFile(basePath)},method:{tailContourPolygon:polygon,selection:'inside polygon AND original base alpha >=128',exclusions:'merged haunch/chest and all raised-paw pixels are not classified as tail'},output:{path:maskPath,sha256:await hashFile(maskPath),pixels,boundsInclusive:bounds},protectedCompanions:{bodyChestLegsAndPaws:[0,101,160,160],raisedPaw:[59,91,106,160]},verdict:'PASS_C02_VISIBLE_TAIL_PROTECTION'};
await fs.writeFile(path.join(out,'c02-tail-protection-evidence.json'),`${JSON.stringify(evidence,null,2)}\n`);console.log(JSON.stringify(evidence,null,2));
