import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {FIGHTERS} from '../pet-app/lib/brawl/catalog.mjs';
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8'));
const jobs=JSON.parse(await fs.readFile('pet-app/art-source/skills-v11/jobs.json','utf8'));
const evidence='artifacts/pet-playtest/skills-v11/atlas';await fs.mkdir(evidence,{recursive:true});
const report=[],partial=process.argv.includes('--partial'),kinds=FIGHTERS.flatMap(f=>f.skills.map(k=>({id:k.kind,fighter:f.id})));
assert.equal(kinds.length,50);assert.equal(jobs.length,48);
for(const {id,fighter} of kinds){
 const clip=manifest.skillFx?.[id];if(partial&&!clip)continue;assert.ok(clip,`${id}: dedicated atlas is present`);
 const file=path.join('pet-app/public',clip.url.replace('/pet/','')),meta=await sharp(file).metadata();assert.equal(meta.width,2048);assert.equal(meta.height,512);assert.ok(meta.hasAlpha);assert.equal(clip.frames,8);
 const frames=[],occupied=[];
 for(let n=0;n<8;n++){
  const {data,info}=await sharp(file).extract({left:n%4*512,top:Math.floor(n/4)*256,width:512,height:256}).raw().toBuffer({resolveWithObject:true});let count=0;
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){const alpha=data[(y*512+x)*info.channels+3];if(x<12||x>=500||y<4||y>=252)assert.equal(alpha,0,`${id}: transparent frame gutters`);if(alpha>20)count++;}
  assert.ok(count>400,`${id}: complete nonempty frame ${n}`);occupied.push(count);frames.push(crypto.createHash('sha256').update(data).digest('hex'));
 }
 assert.ok(new Set(frames).size>=7,`${id}: distinct temporal frames, not a repeated static icon`);
 report.push({id,fighter,url:clip.url,bytes:(await fs.stat(file)).size,occupied,frames:new Set(frames).size});
}
assert.equal(new Set(report.map(j=>j.url)).size,report.length);
assert.equal(manifest.skillFx['gum-pistol'].url,'/pet/assets/art/brawl/skill-gum-pistol-e1ec5d16c33e.webp');
assert.equal(manifest.skillFx['gum-gatling'].url,'/pet/assets/art/brawl/skill-gum-gatling-b184cf0edbf5.webp');
for(let offset=0;offset<report.length;offset+=12){
 const batch=report.slice(offset,offset+12),layers=[];
 for(const [n,item] of batch.entries()){
  const file=path.join('pet-app/public',item.url.replace('/pet/','')),left=n%2*768,top=Math.floor(n/2)*220;
  const label=Buffer.from(`<svg width="768" height="24"><text x="12" y="19" font-size="17" font-family="sans-serif" fill="white">${item.fighter} · ${item.id}</text></svg>`);
  layers.push({input:label,left,top},{input:await sharp(file).resize(768,192).png().toBuffer(),left,top:top+24});
 }
 await sharp({create:{width:1536,height:Math.ceil(batch.length/2)*220,channels:4,background:'#314559'}}).composite(layers).png().toFile(path.join(evidence,`review-${Math.floor(offset/12)+1}.png`));
}
await fs.writeFile(path.join(evidence,'art-validation.json'),JSON.stringify({pass:true,partial,report},null,2));
console.log(`✓ ${report.length} individual eight-frame atlases: unique artwork, alpha, clean gutters, animation changes; approved Luffy hashes retained`);
