// Character-specific entrypoint for source, gait, blink and all four shipping copies.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {createRequire} from 'node:module';
assert(!process.argv.some(a=>a.startsWith('--pet=')),'This test only targets RX-78-2');
process.argv.push('--pet=gundam-rx-78-2');
await import('./test-hidden-character-atlases.mjs');
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {catalog}=require('../pet-app/lib/catalog.js');
const pet=catalog.pets.find(p=>p.id==='gundam-rx-78-2');
const source=path.join(root,'pet-app/art-source/imagegen/baked-wearables/gundam-rx-78-2-perfect-v2/pet-gundam-rx-78-2-4096.png');
const tiles=[];
for(let frame=0;frame<37;frame++){
 const compressed=await sharp(source).extract({left:frame%8*512,top:Math.floor(frame/8)*512,width:512,height:512})
   .resize(160,160,{fit:'fill'}).webp({quality:92}).toBuffer();
 tiles.push({input:await sharp(compressed).png().toBuffer(),left:frame%8*160,top:Math.floor(frame/8)*160});
}
const expected=await sharp({create:{width:1280,height:800,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
 .composite(tiles).webp({quality:92}).toBuffer();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const url of pet.atlas){
 const actual=await fs.readFile(path.join(root,'pet-app/public',url.split('?')[0].replace('/pet/','')));
 assert.equal(sha(actual),sha(expected),'Runtime pixels do not match retained source/importer');
}
console.log('✓ RX-78-2: every source slot reproduces the exact four imported runtime atlases');
