import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out=path.resolve('artifacts/head20-attempt6-per-cell/c03/revision-9');
const rawPath=path.join(out,'c03-r9-raw-full-dressed-imagegen-source.png');
const normalizedPath=path.join(out,'c03-r9-normalized-rgb-1254x1254.png');
const hash=async p=>crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const input=await sharp(rawPath).metadata();
await sharp(rawPath)
  .resize(1254,1254,{fit:'fill',kernel:sharp.kernel.lanczos3})
  .flatten({background:{r:255,g:255,b:255}})
  .removeAlpha()
  .png({compressionLevel:9})
  .toFile(normalizedPath);
const output=await sharp(normalizedPath).metadata();
const evidence={schemaVersion:1,cell:'c03',revision:'r9',stage:'RAW_NORMALIZATION_PRE_CANDIDATE',input:{path:rawPath,sha256:await hash(rawPath),dimensions:[input.width,input.height,input.channels]},output:{path:normalizedPath,sha256:await hash(normalizedPath),dimensions:[output.width,output.height,output.channels]},steps:'resize transparent 1230x1278 ImageGen raw to the existing 1254x1254 normalized coordinate reference with Lanczos3; flatten only transparent exterior to white so the established border-connected checker/white cleanup can remove it. No pet/base, previous target, mask, layer or composite was read.',verdict:'PASS_NORMALIZED_SOURCE_FOR_CANDIDATE_ONLY'};
await fs.writeFile(path.join(out,'c03-r9-normalization-evidence.json'),`${JSON.stringify(evidence,null,2)}\n`);
console.log(JSON.stringify(evidence,null,2));
