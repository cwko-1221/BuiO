import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg,outArg]=process.argv.slice(2);if(!baseArg||!outArg)throw new Error('usage: node scripts/derive-head20-c02-left-ear-extension.mjs <base160> <out>');
const SIZE=160,C=4,basePath=path.resolve(baseArg),out=path.resolve(outArg);const {data:base,info}=await sharp(basePath).ensureAlpha().raw().toBuffer({resolveWithObject:true});if(info.width!==SIZE||info.height!==SIZE)throw new Error('base must be 160');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');const hashFile=async p=>sha(await fs.readFile(p));const mask=Buffer.alloc(SIZE*SIZE*C);let pixels=0,bounds=[SIZE,SIZE,-1,-1];
// Only c02 head/ear pixels outside the native c02 x>=36 helmet permission.
for(let y=31;y<=70;y++)for(let x=26;x<36;x++){const at=(y*SIZE+x)*C;if(base[at+3]>=128){mask[at]=mask[at+1]=mask[at+2]=mask[at+3]=255;pixels++;bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x),Math.max(bounds[3],y)];}}
await fs.mkdir(out,{recursive:true});const maskPath=path.join(out,'c02-left-natural-ear-occlusion-extension.png');await sharp(mask,{raw:{width:SIZE,height:SIZE,channels:C}}).png({compressionLevel:9}).toFile(maskPath);
const evidence={schemaVersion:1,job:'starpatch-cat:1:head-20',cell:'c02',purpose:'minimal c02 left natural-ear/head-edge occlusion outside native [36,5,134,127] helmet permission; no tail, chest, legs, or raised-paw pixels',inputs:{basePath,baseSha256:await hashFile(basePath)},output:{path:maskPath,sha256:await hashFile(maskPath),pixels,boundsInclusive:bounds},constraints:{nativeHelmetZone:[36,5,134,127],selection:[26,31,36,71],bodyChestLegsPawsExcludedByYMin:71,tailScreenRightExcluded:true},verdict:'PASS_PROPOSED_C02_LEFT_EAR_EXTENSION'};await fs.writeFile(path.join(out,'c02-left-ear-extension-evidence.json'),`${JSON.stringify(evidence,null,2)}\n`);console.log(JSON.stringify(evidence,null,2));
