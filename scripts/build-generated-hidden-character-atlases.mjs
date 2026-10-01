import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {connectedPoses,upperCentre,bounds} from './pet-art/generated-character-source.mjs';
import {oppositeSaitamaLegs} from './pet-art/saitama-opposite-legs.mjs';

const ROOT=path.resolve(import.meta.dirname,'..'),CELL=512;
const IDS=['dragon-ball-frieza','one-piece-luffy','spy-family-anya','one-punch-saitama','naruto-uzumaki'];
const GROUPS=['front-walk','right-walk','back-walk','front-idle','specials'];
const WALK=[475,478,475,472,475,478,475,472];
// Whole-sheet generation can return otherwise coherent poses out of temporal order.
// Reorder complete poses, never crop/mirror costume details to conceal a bad gait.
const FRAME_ORDERS={
 'dragon-ball-frieza':{'front-walk':[0,1,2,7,4,5,6,3],'back-walk':[0,1,6,3,7,5,2,4]},
 'one-punch-saitama':{'back-walk':[0,1,2,4,3,5,6,7]},
 'spy-family-anya':{
  'front-walk':[0,1,2,7,4,5,6,3],
  'back-walk':[0,7,2,5,4,1,6,3],
 },
};
const selected=process.argv.find(a=>a.startsWith('--pet='))?.slice(6);
assert(!selected||IDS.includes(selected),'Unknown generated character');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const empty=(w,h,bg='#00000000')=>sharp({create:{width:w,height:h,channels:4,background:bg}});
const median=vs=>[...vs].sort((a,b)=>a-b)[Math.floor(vs.length/2)];

async function idleShape(tile) {
 const image=await sharp(tile).resize(160,160).png().toBuffer(),b=await bounds(image,16);
 const {data}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let bootArea=0,bootWidth=0,headWidth=0;
 for(let y=b.top;y<=b.bottom;y++){let n=0;for(let x=b.left;x<=b.right;x++)if(data[(y*160+x)*4+3]>16)n++;
 if(y>=b.bottom-9){bootArea+=n;bootWidth=Math.max(bootWidth,n);}if(y<b.top+b.height*.35)headWidth=Math.max(headWidth,n);}
 return {...b,bootArea,bootWidth,headWidth};
}
async function supportSide(tile) {
 const image=await sharp(tile).resize(160,160).png().toBuffer(),b=await bounds(image,16);
 const {data}=await sharp(image).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let left=0,right=0;
 for(let y=b.bottom-8;y<=b.bottom;y++)for(let x=0;x<160;x++){
  if(data[(y*160+x)*4+3]<=16)continue;
  if(x<80)left++;else right++;
 }
 return {left,right,sign:Math.sign(left-right)};
}
async function tile(frame,scale,baseline,label) {
 const width=Math.round(frame.width*scale),height=Math.round(frame.height*scale);
 const left=Math.round(256-await upperCentre(frame.buffer)*scale),top=baseline-height;
 assert(left>=16&&top>=16&&left+width<=496&&top+height<=496,label+': pose exceeds safety gutter');
 const input=await sharp(frame.buffer).resize(width,height).png().toBuffer(),target=Math.floor(baseline*160/512);
 for(const correction of [0,-1,1,-2,2,-3,3,-4,4]){
  const y=top+correction;assert(y>=16&&y+height<=496);
  const output=await empty(512,512).composite([{input,left,top:y}]).png().toBuffer();
  const runtime=await bounds(await sharp(output).resize(160,160).png().toBuffer(),16);
  if(runtime.bottom===target)return {tile:output,left,top:y,scale,baseline,bounds:await bounds(output),runtime,hash:hash(output)};
 }
 throw new Error(label+': no runtime foot baseline alignment');
}
async function review(frames,columns,file,title) {
 const slot=256,label=30,width=columns*slot,height=Math.ceil(frames.length/columns)*(slot+label),layers=[];
 let svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'">';
 for(let i=0;i<frames.length;i++){
 const x=i%columns*slot,y=Math.floor(i/columns)*(slot+label);
 layers.push({input:await sharp(frames[i].tile).resize(slot,slot).png().toBuffer(),left:x,top:y+label});
 svg+='<text x="'+(x+8)+'" y="'+(y+21)+'" fill="#334155" font-family="Arial" font-size="14">'+title+' '+i+'</text><path d="M'+x+' '+(y+label+239)+' h256" stroke="#b7c5d4"/>';
 }
 layers.push({input:Buffer.from(svg+'</svg>'),left:0,top:0});
 await empty(width,height,'#edf2f7').composite(layers).png().toFile(file);
}
function preview(id) {
 return '<!doctype html><meta charset="utf-8"><title>'+id+' generated animation QA</title><style>body{font:16px system-ui;padding:20px;background:#edf2f7}.grid{display:flex;flex-wrap:wrap;gap:18px}canvas{background:#fff;border-radius:12px}img{max-width:100%}</style><h1>'+id+' · generated raster v2</h1><button id="pause">Pause / resume</button><div class="grid" id="grid"></div><img src="contact-sheet.png"><script>const groups=[["Front",0,8],["Right profile",8,8],["Back",16,8],["Idle",24,8],["Eat",32,1],["Happy",33,1],["Sleep",34,1],["Sit",35,1],["Surprised",36,1]],timing=[1000,200,800,100,100,100,200,600];let active=true;pause.onclick=()=>active=!active;const image=new Image();image.src="import/pet-'+id+'-1.png";image.onload=()=>groups.forEach(([name,start,count])=>{const box=document.createElement("div"),c=document.createElement("canvas");c.width=256;c.height=256;box.innerHTML="<h3>"+name+"</h3>";box.append(c);grid.append(box);const ctx=c.getContext("2d");let p=0,next=0;function draw(now){if(active&&now>=next){ctx.clearRect(0,0,256,256);const f=start+p;ctx.drawImage(image,f%8*512,Math.floor(f/8)*512,512,512,0,0,256,256);next=now+(start===24?timing[p]:100);p=(p+1)%count;}requestAnimationFrame(draw);}requestAnimationFrame(draw);});</script>';
}

for(const id of IDS.filter(id=>!selected||id===selected)){
 const source=path.join(ROOT,'pet-app/art-source/imagegen/baked-wearables',id+'-perfect-v2');
 const artifact=path.join(ROOT,'artifacts/premium-character-atlases',id,'generated-v2');
 await fs.mkdir(path.join(artifact,'import'),{recursive:true});await fs.mkdir(path.join(source,'processed'),{recursive:true});
 const groups=[];
 for(const name of GROUPS) {
  const file=path.join(source,'raw',name+'-raw.png'),raw=await fs.readFile(file);
  const poses=await connectedPoses(raw,name==='specials'?5:8,name==='specials'?1:2);
  // Convert generated raster pixel density to 512px logical source units.
  // This is ONE uniform conversion for the entire sheet, never per-frame resizing.
  const density=name==='specials'?1:1024/poses.sourceHeight;
  const order=FRAME_ORDERS[id]?.[name]??poses.frames.map((_,i)=>i);
  assert.equal(new Set(order).size,poses.frames.length,'Invalid complete-pose ordering');
  const frames=await Promise.all(order.map(async sourcePhase=>{
   const f=poses.frames[sourcePhase];
   return {...f,sourcePhase,buffer:density===1?f.buffer:await sharp(f.buffer).resize(Math.round(f.width*density),Math.round(f.height*density)).png().toBuffer(),width:Math.round(f.width*density),height:Math.round(f.height*density)};
  }));
  groups.push({name,file:path.relative(ROOT,file),hash:hash(raw),density,order,backgroundCleanup:poses.backgroundCleanup,frames,dimensions:[poses.sourceWidth,poses.sourceHeight]});
 }
 const motion=groups.slice(0,4).flatMap(g=>g.frames);
 const extents=await Promise.all(motion.map(async f=>{const c=await upperCentre(f.buffer);return Math.max(c,f.width-c);}));
 const motionScale=Math.min(430/Math.max(...motion.map(f=>f.height)),238/Math.max(...extents));
 const upright=groups[4].frames.filter((_,i)=>[0,1,4].includes(i));
 const specialExtents=await Promise.all(groups[4].frames.map(async f=>{const c=await upperCentre(f.buffer);return Math.max(c,f.width-c);}));
 const specialScale=Math.min(median(groups[0].frames.map(f=>f.height))*motionScale/median(upright.map(f=>f.height)),238/Math.max(...specialExtents),430/Math.max(...groups[4].frames.map(f=>f.height)));
 const frames=[];
 for(let row=0;row<5;row++)for(let phase=0;phase<groups[row].frames.length;phase++){
  const normalized=await tile(groups[row].frames[phase],row===4?specialScale:motionScale,row<3?WALK[phase]:478,id+' '+GROUPS[row]+' '+phase);
  const index=row*8+phase;frames.push({...normalized,index,group:GROUPS[row],sourcePhase:groups[row].frames[phase].sourcePhase,sourceBounds:groups[row].frames[phase].sourceBounds});
  await fs.writeFile(path.join(source,'processed',String(index).padStart(2,'0')+'.png'),normalized.tile);
 }
 // One generated front down-pose repeats the first supporting foot. The skill
 // permits a garment-safe opposite-leg correction; never apply it behind a cape.
 if(id==='one-punch-saitama'){
  const f=frames[5];f.tile=await oppositeSaitamaLegs(frames[1].tile,f.tile);
  f.bounds=await bounds(f.tile);f.runtime=await bounds(await sharp(f.tile).resize(160,160).png().toBuffer(),16);
  f.hash=hash(f.tile);f.oppositeLegCorrection=true;
  await fs.writeFile(path.join(source,'processed','05.png'),f.tile);
 }
 for(let row=0;row<5;row++)await review(frames.filter(f=>f.group===GROUPS[row]),row===4?5:4,path.join(artifact,GROUPS[row]+'.png'),GROUPS[row]);
 await review(frames,8,path.join(artifact,'contact-sheet.png'),id);
 const idle=await Promise.all(frames.slice(24,32).map(f=>idleShape(f.tile)));
 const spread=k=>Math.max(...idle.map(f=>f[k]))-Math.min(...idle.map(f=>f[k]));
 const errors=[];
 const supportChecks={};
 for(const row of [0,2]) {
  const supports=await Promise.all(frames.slice(row*8,row*8+8).map(f=>supportSide(f.tile)));
  const first=supports[2],second=supports[6];
  supportChecks[GROUPS[row]]={firstPassing:first,oppositePassing:second,phases:supports};
  if(first.sign===0||second.sign===0||first.sign===second.sign)errors.push(GROUPS[row]+': passing phases do not exchange supporting feet');
  if(![1,2,3].every(p=>supports[p].sign===first.sign)||![5,6,7].every(p=>supports[p].sign===second.sign))errors.push(GROUPS[row]+': supporting foot changes mid-half-step');
 }
 for(let r=0;r<3;r++)if(new Set(frames.slice(r*8,r*8+8).map(f=>f.hash)).size!==8)errors.push('duplicate walk frames row '+r);
 if(new Set(frames.slice(24,32).map(f=>f.hash)).size<6)errors.push('missing idle phases');
 if(spread('bottom')!==0)errors.push('idle baseline changed');
 if(spread('height')>3)errors.push('idle size drift');
 if(spread('headWidth')>2)errors.push('idle head size drift');
 if(spread('bootWidth')>3||Math.max(...idle.map(f=>f.bootArea))/Math.min(...idle.map(f=>f.bootArea))>1.2)errors.push('idle boots changed');
 // Copy normalized RGBA pixels exactly: alpha compositing can round antialiased
 // RGB channels even against an empty canvas and break source/runtime provenance.
 const packed=Buffer.alloc(4096*4096*4);
 for(const f of frames){
  const bytes=await sharp(f.tile).ensureAlpha().raw().toBuffer();
  const x=f.index%8*512,y=Math.floor(f.index/8)*512;
  for(let line=0;line<512;line++)bytes.copy(packed,((y+line)*4096+x)*4,line*512*4,(line+1)*512*4);
 }
 const atlas=await sharp(packed,{raw:{width:4096,height:4096,channels:4}}).png().toBuffer();
 await fs.writeFile(path.join(source,'pet-'+id+'-4096.png'),atlas);
 for(let stage=1;stage<=4;stage++)await fs.writeFile(path.join(artifact,'import','pet-'+id+'-'+stage+'.png'),atlas);
 await fs.writeFile(path.join(artifact,'preview.html'),preview(id));
 const report={id,source:'Built-in image_gen whole-sheet edits of one approved three-view raster model',motionScale,specialScale,atlasHash:hash(atlas),modelHash:hash(await fs.readFile(path.join(source,'model-reference.png'))),promptHash:hash(await fs.readFile(path.join(source,'generation-prompts.json'))),groups:groups.map(({frames,...g})=>g),idle,supportChecks,errors,frames:frames.map(({tile,...f})=>f)};
 await fs.writeFile(path.join(artifact,'build-report.json'),JSON.stringify(report,null,2)+'\n');
 assert.deepEqual(errors,[],id+': inspect previews and regenerate inconsistent source set');
 console.log('✓ '+id+': complete 37-pose raster atlas, fixed idle baseline, retained source hashes '+hash(atlas).slice(0,12));
}
