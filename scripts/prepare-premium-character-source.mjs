// Retain generated models/provenance and create one fixed-scale seed per direction.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {connectedPoses, upperCentre} from './pet-art/generated-character-source.mjs';
const root=path.resolve(import.meta.dirname,'..');
const ids=new Set(['dynasty-warriors-zhao-yun','sword-art-online-kirito']);
assert(process.argv[2],'Pass a model selection JSON array');
const selections=JSON.parse(await fs.readFile(path.resolve(process.argv[2]),'utf8'));
for(const {id,path:input,prompt} of selections){
 assert(ids.has(id)&&prompt.length>100,'Unknown character or missing model prompt');
 const dir=path.join(root,'pet-app/art-source/imagegen/baked-wearables',id+'-perfect-v2');
 await fs.mkdir(path.join(dir,'raw'),{recursive:true});
 const bytes=await fs.readFile(input),model=path.join(dir,'model-reference.png');
 await fs.writeFile(model,bytes);
 const {frames}=await connectedPoses(bytes,3);
 const centres=await Promise.all(frames.map(f=>upperCentre(f.buffer)));
 const scale=Math.min(430/Math.max(...frames.map(f=>f.height)),230/Math.max(...frames.map((f,i)=>Math.max(centres[i],f.width-centres[i]))));
 for(const [i,name] of ['front','right','back'].entries()){
  const f=frames[i],width=Math.round(f.width*scale),height=Math.round(f.height*scale);
  const input=await sharp(f.buffer).resize(width,height).png().toBuffer();
  const seed=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input,left:Math.round(256-centres[i]*scale),top:478-height}]).png().toBuffer();
  await fs.writeFile(path.join(dir,name+'-seed.png'),seed);
  await sharp({create:{width:2048,height:1024,channels:4,background:'#00000000'}}).composite([{input:seed,left:0,top:0}]).png().toFile(path.join(dir,name+'-edit-canvas.png'));
 }
 await fs.writeFile(path.join(dir,'generation-prompts.json'),JSON.stringify({id,model:{file:'model-reference.png',prompt,tool:'built-in image_gen',hash:crypto.createHash('sha256').update(bytes).digest('hex')},groups:{},history:[]},null,2)+'\n');
 console.log(id+': retained model and three shared-scale seed canvases');
}
