import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sources=path.join(root,'pet-app/art-source/imagegen/brawl-v1');
const output=path.join(root,'pet-app/public/assets/art/brawl');
const evidence=path.join(root,'artifacts/pet-playtest/brawl-v1');
await Promise.all([fs.mkdir(sources,{recursive:true}),fs.mkdir(output,{recursive:true}),fs.mkdir(evidence,{recursive:true})]);
const generated=path.join(process.env.USERPROFILE,'.codex/generated_images/01a0e8d4-0f68-73c1-9a1f-5fa4a5f3b1a8');
const files={
 'starpatch-cat-a':'exec-486b60fc-b9c9-4ff0-b092-04f395690ce5.png','cloud-ear-dog-a':'exec-94a12e52-9cd4-44ac-b83f-0f2d837660fd.png','pudding-pig-a':'exec-11e0550d-0b91-4a2a-b839-d0916255baf2.png',
 'starpatch-cat-b':'exec-91e68d91-aa74-4238-b922-e8b1794d6d69.png','cloud-ear-dog-b':'exec-f7ef8409-786f-4dd7-8948-6136ed970222.png','pudding-pig-b':'exec-18593012-372d-4ff2-bebc-44ed5faebd5f.png',
 'sunny-training':'exec-9a977312-fb55-4e53-9160-3c5d8457c3ba.png','windbell-forest':'exec-fe6e77e1-1e35-44b1-a933-5bcae9f04e88.png','starcrystal-cave':'exec-eadb00b2-0e9e-4701-8f46-313b110edd77.png','enemies':'exec-e8014a96-8e0d-4354-bd89-3e64ddcc99e3.png'};
for(const [id,file] of Object.entries(files)){const target=path.join(sources,id+'.png');try{await fs.access(target);}catch{await fs.copyFile(path.join(generated,file),target);}}
// Recover whole connected sprites before assigning cells. Generated art is not assumed to
// obey uniform row gutters: cropping an approximate grid can silently cut ears or feet.
async function components(id,rows){
 const {data,info}=await sharp(path.join(sources,id+'.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),parts=[];
 for(let index=0;index<w*h;index++){
  if(seen[index]||data[index*4+3]<128)continue;let head=0,tail=1;queue[0]=index;seen[index]=1;let minX=w,minY=h,maxX=0,maxY=0;const pixels=[];
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);pixels.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const n of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(n>=0&&!seen[n]&&data[n*4+3]>=128){seen[n]=1;queue[tail++]=n;}}
  if(pixels.length>600)parts.push({minX,minY,maxX,maxY,pixels,cx:(minX+maxX)/2,cy:(minY+maxY)/2});
 }
 // A thin antialiased bridge can connect two neighbouring poses. Split only oversized
 // components at the sparsest central column/row, never invent missing animation frames.
 while(parts.length<rows*8){const merged=parts.find(p=>p.maxX-p.minX>w/8*1.6||p.maxY-p.minY>h/rows*1.65);if(!merged)break;
  const horizontal=merged.maxX-merged.minX>w/8*1.6,lo=horizontal?merged.minX:merged.minY,hi=horizontal?merged.maxX:merged.maxY;
  const counts=new Map();for(const index of merged.pixels){const value=horizontal?index%w:Math.floor(index/w);counts.set(value,(counts.get(value)||0)+1);}
  let cut=Math.round((lo+hi)/2),minimum=Infinity;for(let k=Math.round(lo+(hi-lo)*.4);k<=lo+(hi-lo)*.6;k++)if((counts.get(k)||0)<minimum){minimum=counts.get(k)||0;cut=k;}
  const groups=[[],[]];for(const index of merged.pixels)groups[(horizontal?index%w:Math.floor(index/w))<=cut?0:1].push(index);if(groups.some(g=>g.length<1000))break;
  parts.splice(parts.indexOf(merged),1);for(const pixels of groups){const xs=pixels.map(i=>i%w),ys=pixels.map(i=>Math.floor(i/w));const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);parts.push({pixels,minX,maxX,minY,maxY,cx:(minX+maxX)/2,cy:(minY+maxY)/2});}
 }
 parts.sort((a,b)=>b.pixels.length-a.pixels.length);if(parts.length<rows*8)throw new Error(`${id}: only ${parts.length} isolated sprites; expected ${rows*8}`);
 const selected=parts.slice(0,rows*8).sort((a,b)=>a.cy-b.cy),frames=[];
 for(let row=0;row<rows;row++){const group=selected.slice(row*8,row*8+8).sort((a,b)=>a.cx-b.cx);
  for(const p of group){const width=p.maxX-p.minX+1,height=p.maxY-p.minY+1,rgba=Buffer.alloc(width*height*4);
   for(const index of p.pixels){const x=index%w-p.minX,y=Math.floor(index/w)-p.minY;data.copy(rgba,(y*width+x)*4,index*4,index*4+4);}
   frames.push({rgba,width,height,source:{x:p.minX,y:p.minY,width,height}});}}
 return frames;
}
async function write(id,buffer){const hash=crypto.createHash('sha256').update(buffer).digest('hex').slice(0,12),name=`${id}-${hash}.webp`;await fs.writeFile(path.join(output,name),buffer);return `/pet/assets/art/brawl/${name}`;}
async function page(id,frames,scale){const canvas=Buffer.alloc(2048*2048*4),placements=[],metrics=[];
 for(let i=0;i<frames.length;i++){const f=frames[i],width=Math.max(1,Math.round(f.width*scale)),height=Math.max(1,Math.round(f.height*scale));if(width>224||height>224)throw new Error(`${id}: oversized sprite`);
 const image=await sharp(f.rgba,{raw:{width:f.width,height:f.height,channels:4}}).resize(width,height).png().toBuffer();const left=i%8*256+Math.round((256-width)/2),top=Math.floor(i/8)*256+230-height;placements.push({input:image,left,top});metrics.push({source:f.source,width,height,baseline:230,hash:crypto.createHash('sha256').update(image).digest('hex')});}
 const png=await sharp(canvas,{raw:{width:2048,height:2048,channels:4}}).composite(placements).png().toBuffer();await fs.writeFile(path.join(evidence,id+'.png'),png);return {url:await write(id,await sharp(png).webp({quality:92,alphaQuality:100}).toBuffer()),metrics};
}
const manifest={version:'brawl-v1',frameSize:256,fighters:{},enemies:{},backgrounds:{}},report={};
for(const id of ['starpatch-cat','cloud-ear-dog','pudding-pig']){
 const rows=id==='starpatch-cat'?7:8,a=await components(id+'-a',rows),b=await components(id+'-b',rows);const scale=220/Math.max(...[...a,...b].map(f=>Math.max(f.width,f.height)));const A=await page(id+'-a',a,scale),B=await page(id+'-b',b,scale);
 const clips={idle:{page:0,start:0,count:8},walk:{page:0,start:8,count:8},run:{page:0,start:16,count:8},attack1:{page:0,start:24,count:8},attack2:{page:0,start:32,count:8},attack3:{page:1,start:40,count:8},jump:{page:0,start:rows===7?40:48,count:8},air:{page:0,start:rows===7?48:56,count:8},guard:{page:1,start:0,count:4},break:{page:1,start:4,count:4},hit:{page:1,start:8,count:4},fall:{page:1,start:12,count:4},rise:{page:1,start:16,count:4},skill1:{page:1,start:24,count:8},skill2:{page:1,start:32,count:8},win:{page:1,start:(rows-1)*8,count:8}};
 manifest.fighters[id]={pages:[A.url,B.url],clips};report[id]={scale,pages:[A.metrics,B.metrics]};console.log(`${id}: ${a.length+b.length} normalized frames`);
}
const enemyFrames=await components('enemies',7),enemyNormalized=[];
for(let row=0;row<7;row++){const group=enemyFrames.slice(row*8,row*8+8),scale=220/Math.max(...group.map(f=>Math.max(f.width,f.height)));for(const f of group){const {data,info}=await sharp(f.rgba,{raw:{width:f.width,height:f.height,channels:4}}).resize(Math.round(f.width*scale),Math.round(f.height*scale)).raw().toBuffer({resolveWithObject:true});enemyNormalized.push({...f,rgba:data,width:info.width,height:info.height});}}
const enemies=await page('enemies',enemyNormalized,1);manifest.enemies={url:enemies.url,rows:{mushroom:0,thrower:1,shield:2,slime:3,puppet:4,squirrel:5,golem:6}};report.enemies=enemies.metrics;
for(const id of ['sunny-training','windbell-forest','starcrystal-cave'])manifest.backgrounds[id]=await write(id,await sharp(path.join(sources,id+'.png')).resize(1920,1080,{fit:'cover'}).webp({quality:88}).toBuffer());
await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));await fs.writeFile(path.join(evidence,'asset-report.json'),JSON.stringify(report,null,2));
console.log('Brawl asset manifest ready.');
