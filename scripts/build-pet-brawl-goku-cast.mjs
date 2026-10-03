import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {findCells,keepPose} from './sheet-cells.mjs';
function write(file,bytes){try{fs.writeFileSync(file,bytes);}catch(error){if(!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;const backup=path.resolve('artifacts/pet-playtest/kamehameha-smooth/manifest-before-'+Date.now()+'.json');assert.ok(backup.startsWith(path.resolve('.')+path.sep));fs.renameSync(file,backup);fs.writeFileSync(file,bytes);}}
const source='pet-app/art-source/goku-kamehameha-v2',out='pet-app/public/assets/art/brawl';
const evidence='artifacts/pet-playtest/kamehameha-smooth';
fs.mkdirSync(path.join(evidence,'poses'),{recursive:true});
const meta=await sharp(source+'/raw.png').metadata();assert.ok(meta.hasAlpha);
// Artist-selected palm centres in each generated source cell (before scaling).
const palms=[[335,230],[165,254],[157,265],[150,251],[421,214],[396,192],[403,193],[345,222]];
const poses=[],cells=await findCells(source+'/raw.png',4,2);
for(let n=0;n<8;n++){
 const detected=cells[n];assert.ok(detected,'missing generated pose '+n);
 const left=Math.max(0,detected.left-3),top=Math.max(0,detected.top-3),box={left,top,width:Math.min(meta.width-left,detected.width+6),height:Math.min(meta.height-top,detected.height+6)};
 const input=await keepPose(source+'/raw.png',box,await sharp(source+'/raw.png').extract(box).png().toBuffer());
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let l=info.width,r=-1,t=info.height,b=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>16){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 assert.ok(r>l&&b>t,'empty pose '+n);
 let fl=info.width,fr=-1;
 // Anchor on the planted boots rather than the changing reach of the arms.
 for(let y=b-22;y<=b;y++)for(let x=l;x<=r;x++)if(data[(y*info.width+x)*4+3]>32){fl=Math.min(fl,x);fr=Math.max(fr,x);}
 const foot=(fl+fr)/2;poses.push({input,l,r,t,b,foot,width:r-l+1,height:b-t+1,palm:[Math.round(n%4*meta.width/4)+palms[n][0]-left,Math.round(Math.floor(n/4)*meta.height/2)+palms[n][1]-top]});
}
const maxLeft=Math.max(...poses.map(p=>p.foot-p.l)),maxRight=Math.max(...poses.map(p=>p.r-p.foot));
const scale=Math.min(135/Math.max(...poses.map(p=>p.height)),72/maxLeft,72/maxRight);
const layers=[],emitters=[],report=[];
for(const [n,p] of poses.entries()){
 const width=Math.round(p.width*scale),height=Math.round(p.height*scale),left=Math.round(80-(p.foot-p.l)*scale),top=150-height;
 const input=await sharp(p.input).extract({left:p.l,top:p.t,width:p.width,height:p.height}).resize(width,height,{kernel:'lanczos3'}).png().toBuffer();
 assert.ok(left>=7&&left+width<=153&&top>=8&&top+height<=150,'pose outside safe cell '+n);
 const frame=await sharp({create:{width:160,height:160,channels:4,background:'#00000000'}}).composite([{input,left,top}]).png().toBuffer();
 fs.writeFileSync(path.join(evidence,'poses',String(n+1).padStart(2,'0')+'.png'),frame);
 layers.push({input:frame,left:n%4*160,top:Math.floor(n/4)*160});
 emitters.push({x:Number(((p.palm[0]-p.foot)*scale*180/160).toFixed(2)),y:Number(((p.palm[1]-p.b-1)*scale*180/160).toFixed(2))});
 report.push({frame:n,scale,left,top,width,height,footAnchor:{x:80,y:150},emitter:emitters[n]});
}
const bytes=await sharp({create:{width:640,height:320,channels:4,background:'#00000000'}}).composite(layers).webp({lossless:true}).toBuffer();
const hash=createHash('sha256').update(bytes).digest('hex'),name='goku-kamehameha-poses-'+hash.slice(0,12)+'.webp';
const target=path.join(out,name);if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))fs.writeFileSync(target,bytes);
const manifest=JSON.parse(fs.readFileSync(out+'/manifest.json'));
manifest.fighterSkillAnimations??={};manifest.fighterSkillAnimations['dragon-ball-goku']={url:'/pet/assets/art/brawl/'+name,frameWidth:160,frameHeight:160,clips:{skill1:{start:0,count:8,emitters}}};
write(out+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(evidence+'/pose-report.json',JSON.stringify({hash,name,frames:report,sourceHash:createHash('sha256').update(fs.readFileSync(source+'/raw.png')).digest('hex')},null,2));
console.log(JSON.stringify({name,bytes:bytes.length,scale,emitters}));
