import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const sources=[
  {file:'pet-app/art-source/imagegen/brawl-v7/elemental-fx.png',rows:3,names:['fire-plume','fireball','fire-eruption','ice-crystal','blizzard','lightning','ki-head','spiral-orb','gold-aura','tidal-wave','leaf-storm','cosmic-burst']},
  {file:'pet-app/art-source/imagegen/brawl-v7/character-fx.png',rows:2,names:['wind-tornado','rock-eruption','mud-ball','moon-disc','ribbon-bow','root-eruption','bloodflame','pressure-wave']}
];
const frames=sources.flatMap(s=>s.names);
const layers=[];
let index=0;
for(const source of sources){
  const meta=await sharp(source.file).metadata();if(!meta.hasAlpha)throw new Error('Generated sheet must preserve alpha');
  const w=Math.floor(meta.width/4),h=Math.floor(meta.height/source.rows);
  for(let n=0;n<source.names.length;n++,index++){
    const image=await sharp(source.file).extract({left:n%4*w,top:Math.floor(n/4)*h,width:w,height:h}).resize(224,224,{fit:'contain'}).toBuffer();
    layers.push({input:image,left:index%4*256+16,top:Math.floor(index/4)*256+16});
  }
}
const image=await sharp({create:{width:1024,height:Math.ceil(frames.length/4)*256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(layers).webp({lossless:true}).toBuffer();
const name='elemental-'+createHash('sha256').update(image).digest('hex').slice(0,12)+'.webp';
const folder='pet-app/public/assets/art/brawl';await fs.mkdir(folder,{recursive:true});
const output=path.join(folder,name);
const identical=await fs.readFile(output).then(previous=>previous.equals(image)).catch(()=>false);
if(!identical)await fs.writeFile(output,image);
const file=path.join(folder,'manifest.json'),manifest=JSON.parse(await fs.readFile(file,'utf8'));
manifest.elementalFx={url:'/pet/assets/art/brawl/'+name,frameSize:256,frames:Object.fromEntries(frames.map((f,n)=>[f,n]))};
const json=JSON.stringify(manifest,null,2)+'\n';
try{await fs.writeFile(file,json);}catch(error){
  if(process.platform!=='win32'||!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;
  // Windows may keep a preview file mapped. Preserve it before replacing the entry.
  const backup=path.resolve('artifacts/pet-playtest/brawl-v7/manifest-before-'+Date.now()+'.json');
  const workspace=path.resolve('.')+path.sep;
  if(!path.resolve(file).startsWith(workspace)||!backup.startsWith(workspace))throw new Error('Publish outside workspace');
  await fs.mkdir(path.dirname(backup),{recursive:true});await fs.rename(file,backup);await fs.writeFile(file,json);
}
console.log(name+' — '+frames.length+' alpha frames, 16px gutters, '+image.length+' bytes');
