import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {STAGES} from '../pet-app/lib/brawl/catalog.mjs';
import {battleViewportWidth,battleCameraScroll,panoramaPlacement,FLOOR_TOP} from '../pet-app/src/brawl/panorama-layout.mjs';
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8'));
assert.equal(Object.keys(manifest.panoramas).length,20);
const devices=[[1024,768],[1194,834],[1280,720],[844,390],[1920,810],[2560,720],[768,1024]];
for(const stage of STAGES){
 const p=manifest.panoramas[stage.id],meta=await sharp(path.join('pet-app/public',p.url.slice('/pet/'.length))).metadata();
 assert.equal(meta.width,p.width);assert.equal(meta.height,p.height);assert.ok(p.width<=2048);assert.ok(p.width/p.height>=2.7);
 for(const [w,h] of devices){const vw=battleViewportWidth(w,h);
  for(const world of [1280,5120])for(const x of [0,640,1280,2560,3840,5120]){
   const scroll=battleCameraScroll(x,vw,world,90),l=panoramaPlacement(p.width,p.height,vw,scroll,world,p.floorLine);
   assert.ok(l.x<=.0001);assert.ok(l.x+l.width>=vw-.0001);assert.ok(l.y<=.0001);assert.ok(l.y+l.height>=720-.0001);
   assert.ok(Math.abs(l.y+p.height*p.floorLine*l.scale-FLOOR_TOP)<.0001,'Painted floor remains aligned');
   assert.ok(Math.abs(l.width/l.height-p.width/p.height)<1e-9,'Uniform image scaling');
   if(world>vw){assert.ok(Math.abs(l.x+scroll)<.0001,'The entire scene tracks world camera movement pixel-for-pixel');}
   if(vw>=world)assert.equal(scroll,(world-vw)/2);
   else assert.ok(scroll>=0&&scroll<=world-vw);
  }
 }
}
assert.equal(battleViewportWidth(1024,768),960);
assert.equal(battleViewportWidth(1280,720),1280);
assert.ok(battleViewportWidth(1920,810)>1280);
console.log('✓ Twenty complete panoramas retain native aspect, cover seven device sizes, align the fighting floor, and keep both arena and campaign camera bounds valid');
