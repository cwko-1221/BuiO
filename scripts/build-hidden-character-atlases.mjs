import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HIDDEN_CHARACTERS, renderHiddenCharacter } from './pet-art/hidden-character-rigs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CELL = 512, WALK_BASELINES = [475,478,475,472,475,478,475,472];
// Only the previously shipped Pikachu remains in this legacy native-rig pipeline.
// Generated raster characters must never be silently overwritten by vector artwork.
const selected = process.argv.find(a=>a.startsWith('--pet='))?.slice(6) ?? 'pikachu';
assert.equal(selected, 'pikachu', 'Use build-generated-hidden-character-atlases.mjs for the five raster characters');
assert(!selected || HIDDEN_CHARACTERS.some(c=>c.id===selected), 'Unknown character');
const characters = HIDDEN_CHARACTERS.filter(c=>!selected || c.id===selected);
const empty = (w,h,bg='#00000000') => sharp({create:{width:w,height:h,channels:4,background:bg}});
const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const specs = [
  ...['front','right','back'].flatMap(facing=>Array.from({length:8},(_,phase)=>({facing,action:'walk',phase}))),
  ...Array.from({length:8},(_,phase)=>({facing:'front',action:'idle',phase})),
  ...['eat','happy','sleep','sit','surprised'].map(action=>({facing:'front',action,phase:0})),
];

export async function measure(buffer, threshold=8) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let left=info.width,top=info.height,right=-1,bottom=-1,opaque=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    if(data[(y*info.width+x)*4+3]<=threshold) continue;
    left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);opaque++;
  }
  return right<0?null:{left,top,right,bottom,width:right-left+1,height:bottom-top+1,opaque};
}

async function components(buffer) {
  const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const labels=new Uint8Array(info.width*info.height),queue=new Int32Array(labels.length),sizes=[];
  for(let start=0;start<labels.length;start++) {
    if(labels[start] || data[start*4+3]<=16) continue;
    let head=0,tail=1;queue[0]=start;labels[start]=1;
    while(head<tail) {
      const p=queue[head++],x=p%info.width,y=Math.floor(p/info.width);
      for(const next of [x>0?p-1:-1,x<info.width-1?p+1:-1,y>0?p-info.width:-1,y<info.height-1?p+info.width:-1]) {
        if(next<0 || labels[next] || data[next*4+3]<=16) continue;
        labels[next]=1;queue[tail++]=next;
      }
    }
    sizes.push(tail);
  }
  return sizes.sort((a,b)=>b-a);
}

async function review(tiles,columns,destination,title) {
  const slot=192,label=28,rows=Math.ceil(tiles.length/columns),width=slot*columns,height=rows*(slot+label);
  const composites=[];
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  for(let i=0;i<tiles.length;i++) {
    const x=(i%columns)*slot,y=Math.floor(i/columns)*(slot+label);
    svg+=`<text x="${x+9}" y="${y+20}" fill="#34465a" font-family="Arial" font-size="13">${title} · ${i}</text><path d="M${x} ${y+label+179} h${slot}" stroke="#c6d0dd"/>`;
    composites.push({input:await sharp(tiles[i]).resize(slot,slot).png().toBuffer(),left:x,top:y+label});
  }
  composites.push({input:Buffer.from(svg+'</svg>'),left:0,top:0});
  await empty(width,height,'#eef3f8').composite(composites).png().toFile(destination);
}

async function normalize(raw,scale,baseline,label) {
  const source=await measure(raw);
  // Native source frames have real transparency, a known skull anchor and one complete model.
  // Crop only after measuring the entire pose; never infer cell boundaries from a contact sheet.
  const crop=await sharp(raw).extract({left:source.left,top:source.top,width:source.width,height:source.height}).png().toBuffer();
  const width=Math.round(source.width*scale),height=Math.round(source.height*scale);
  const resized=await sharp(crop).resize(width,height,{fit:'fill'}).png().toBuffer();
  const left=Math.round(256+(source.left-256)*scale),top=baseline-height;
  const target=Math.floor(baseline*160/CELL);
  let tile,chosenTop;
  for(const correction of [0,-1,1,-2,2,-3,3,-4,4]) {
    const y=top+correction;
    assert(left>=16 && y>=16 && left+width<=496 && y+height<=496,`${label}: normalization leaves its safety gutter`);
    const candidate=await empty(CELL,CELL).composite([{input:resized,left,top:y}]).png().toBuffer();
    const runtime=await sharp(candidate).resize(160,160).png().toBuffer();
    if((await measure(runtime,16)).bottom!==target) continue;
    tile=candidate;chosenTop=y;break;
  }
  assert(tile,`${label}: no runtime foot alignment at ${target}`);
  const islands=await components(tile);
  assert(islands.length===1 || islands.slice(1).every(size=>size<=4),`${label}: detached body components: ${islands}`);
  return {tile,source,bounds:await measure(tile),runtime:await measure(await sharp(tile).resize(160,160).png().toBuffer(),16),left,top:chosenTop,scale,hash:hash(tile)};
}

function previewHtml(character) {
  return `<!doctype html><meta charset="utf-8"><title>${character.label} motion review</title>
<style>body{font:16px system-ui;background:#eaf0f6;color:#253348;padding:20px}.grid{display:flex;flex-wrap:wrap;gap:20px}canvas{background:#f7f9fb;border-radius:16px}button{padding:10px;margin:4px}img{max-width:100%}</style>
<h1>${character.label} · native rig atlas</h1><p>Front / profile / back walk, breathe + blink idle, then all five special poses. One shared scale; fixed idle feet.</p>
<div id="buttons"></div><div class="grid" id="grid"></div><h2>Every authored frame</h2><img src="contact-sheet.png">
<script>
const groups=[['Front walk',0,8],['Right walk',8,8],['Back walk',16,8],['Idle',24,8],['Eat',32,1],['Happy',33,1],['Sleep',34,1],['Sit',35,1],['Surprised',36,1]];
const image=new Image();image.src='import/pet-${character.id}-1.png';
const idleDurations=[1000,200,800,100,100,100,200,600];
let active=true;const toggle=document.createElement('button');toggle.textContent='Pause / resume';toggle.onclick=()=>active=!active;document.querySelector('#buttons').append(toggle);
image.onload=()=>groups.forEach(([label,start,count])=>{
const box=document.createElement('div');box.innerHTML='<h3>'+label+'</h3>';const c=document.createElement('canvas');c.width=256;c.height=256;box.append(c);document.querySelector('#grid').append(box);
const ctx=c.getContext('2d');let phase=0,next=0;function draw(now){if(active&&now>=next){ctx.clearRect(0,0,256,256);const frame=start+phase;ctx.drawImage(image,(frame%8)*512,Math.floor(frame/8)*512,512,512,0,0,256,256);next=now+(start===24?idleDurations[phase]:100);phase=(phase+1)%count;}requestAnimationFrame(draw);}requestAnimationFrame(draw);
});</script>`;
}

const models=[];
for(const character of characters) {
  const sourceDir=path.join(ROOT,`pet-app/art-source/imagegen/baked-wearables/${character.id}-native-v1`);
  const rawDir=path.join(sourceDir,'raw'),processed=path.join(sourceDir,'processed');
  const artifactDir=path.join(ROOT,'artifacts/premium-character-atlases',character.id),importDir=path.join(artifactDir,'import');
  await Promise.all([rawDir,processed,importDir].map(dir=>fs.mkdir(dir,{recursive:true})));
  const raw=[];
  for(let i=0;i<specs.length;i++) {
    const {facing,action,phase}=specs[i],svg=renderHiddenCharacter(character.id,facing,action,phase);
    const filename=`${String(i).padStart(2,'0')}-${facing}-${action}-${phase}`;
    await fs.writeFile(path.join(rawDir,filename+'.svg'),svg);
    const png=await sharp(Buffer.from(svg)).png().toBuffer(),bounds=await measure(png);
    assert(bounds && bounds.left>=8 && bounds.top>=8 && bounds.right<=503 && bounds.bottom<=503,`${character.id} frame ${i}: clipped native art ${JSON.stringify(bounds)}`);
    await fs.writeFile(path.join(rawDir,filename+'.png'),png);raw.push({png,bounds});
  }
  // One scalar for every action and direction. Head/costume size never depends on pose bounds.
  const scale=Math.min(1,430/Math.max(...raw.slice(0,32).map(f=>f.bounds.height)),448/Math.max(...raw.map(f=>f.bounds.width)));
  const frames=[];
  for(let i=0;i<raw.length;i++) {
    const baseline=i<24?WALK_BASELINES[i%8]:478;
    const frame=await normalize(raw[i].png,scale,baseline,`${character.id} frame ${i}`);
    frames.push(frame);await fs.writeFile(path.join(processed,`${String(i).padStart(2,'0')}.png`),frame.tile);
  }
  for(let row=0;row<3;row++) assert.equal(new Set(frames.slice(row*8,row*8+8).map(f=>f.hash)).size,8,`${character.id}: duplicate gait phase`);
  assert(new Set(frames.slice(24,32).map(f=>f.hash)).size>=6,`${character.id}: idle missing breathe/blink`);
  assert.equal(new Set(frames.slice(24,32).map(f=>f.runtime.bottom)).size,1,'Idle baseline changed');
  assert(Math.max(...frames.slice(24,32).map(f=>f.runtime.height))-Math.min(...frames.slice(24,32).map(f=>f.runtime.height))<=3,'Idle scale changed');
  const atlas=await empty(4096,4096).composite(frames.map((f,i)=>({input:f.tile,left:(i%8)*CELL,top:Math.floor(i/8)*CELL}))).png().toBuffer();
  const atlasPath=path.join(sourceDir,`pet-${character.id}-4096.png`);await fs.writeFile(atlasPath,atlas);
  for(let stage=1;stage<=4;stage++) await fs.writeFile(path.join(importDir,`pet-${character.id}-${stage}.png`),atlas);
  const ranges=[[0,8,'front-walk'],[8,16,'right-walk'],[16,24,'back-walk'],[24,32,'front-idle'],[32,37,'specials']];
  for(const [from,to,label] of ranges) {
    await review(frames.slice(from,to).map(f=>f.tile),label==='specials'?5:4,path.join(artifactDir,label+'.png'),label);
    await empty((label==='specials'?5:4)*512,label==='specials'?512:1024).composite(raw.slice(from,to).map((f,i)=>({input:f.png,left:(i%(label==='specials'?5:4))*512,top:Math.floor(i/(label==='specials'?5:4))*512}))).png().toFile(path.join(rawDir,label+'-sheet.png'));
  }
  await review(frames.map(f=>f.tile),8,path.join(artifactDir,'contact-sheet.png'),character.label);
  await fs.writeFile(path.join(artifactDir,'preview.html'),previewHtml(character));
  const report={id:character.id,source:'Editable native SVG rig; no generated-sheet slicing',canvas:4096,cell:CELL,scale,atlasHash:hash(atlas),frames:frames.map(({tile,...f})=>f)};
  await fs.writeFile(path.join(artifactDir,'build-report.json'),JSON.stringify(report,null,2));
  models.push(frames[24].tile);console.log(`✓ ${character.id}: 37 complete poses, shared scale ${scale.toFixed(5)}, transparent 4096 atlas ${hash(atlas).slice(0,12)}`);
}
if (!selected) await review(models,3,path.join(ROOT,'artifacts/premium-character-atlases/new-hidden-characters.png'),'Hidden character');
