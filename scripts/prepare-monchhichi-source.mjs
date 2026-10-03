// Retain the approved raster model and produce transparent whole-set edit canvases.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {connectedPoses, upperCentre} from './pet-art/generated-character-source.mjs';
const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'pet-app/art-source/imagegen/baked-wearables/monchhichi-perfect-v2');
assert(process.argv[2], 'Pass the selected three-view model PNG');
await fs.mkdir(path.join(source,'raw'),{recursive:true});
await fs.copyFile(path.resolve(process.argv[2]),path.join(source,'model-reference.png'));
const {frames}=await connectedPoses(path.join(source,'model-reference.png'),3);
const centres=await Promise.all(frames.map(f=>upperCentre(f.buffer)));
const scale=Math.min(430/Math.max(...frames.map(f=>f.height)),230/Math.max(...frames.map((f,i)=>Math.max(centres[i],f.width-centres[i]))));
for(const [i,name] of ['front','right','back'].entries()){
 const frame=frames[i],width=Math.round(frame.width*scale),height=Math.round(frame.height*scale);
 const input=await sharp(frame.buffer).resize(width,height).png().toBuffer();
 const seed=await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input,left:Math.round(256-centres[i]*scale),top:478-height}]).png().toBuffer();
 await fs.writeFile(path.join(source,name+'-seed.png'),seed);
 await sharp({create:{width:2048,height:1024,channels:4,background:'#00000000'}}).composite([{input:seed,left:0,top:0}]).png().toFile(path.join(source,name+'-edit-canvas.png'));
}
console.log('Retained Monchhichi model; three fixed-scale seeds and 4x2 transparent edit canvases prepared.');
