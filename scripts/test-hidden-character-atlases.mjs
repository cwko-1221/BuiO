import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {HIDDEN_CHARACTERS,renderHiddenCharacter} from './pet-art/hidden-character-rigs.mjs';

const ROOT=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {catalog}=require('../pet-app/lib/catalog.js');
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
for(const character of HIDDEN_CHARACTERS) {
  const source=path.join(ROOT,`pet-app/art-source/imagegen/baked-wearables/${character.id}-native-v1`);
  const atlas=await fs.readFile(path.join(source,`pet-${character.id}-4096.png`));
  const metadata=await sharp(atlas).metadata();
  assert.equal(metadata.width,4096);assert.equal(metadata.height,4096);
  assert.equal(metadata.channels,4);assert(metadata.hasAlpha);
  const report=JSON.parse(await fs.readFile(path.join(ROOT,`artifacts/premium-character-atlases/${character.id}/build-report.json`),'utf8'));
  assert.equal(report.atlasHash,sha(atlas),'Source and report differ');
  assert.equal(new Set(report.frames.map(f=>f.scale)).size,1,`${character.id}: per-frame scaling`);
  for(let frame=0;frame<64;frame++) {
    const {data}=await sharp(atlas).extract({left:(frame%8)*512,top:Math.floor(frame/8)*512,width:512,height:512})
      .ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let count=0;
    for(let y=0;y<512;y++) for(let x=0;x<512;x++) {
      const alpha=data[(y*512+x)*4+3];
      if(alpha<=8) continue;
      count++;
      assert(x>=16 && x<496 && y>=16 && y<496,`${character.id} ${frame}: contaminated slot boundary`);
    }
    assert(frame<37?count>3000:count===0,`${character.id}: wrong populated/reserved slot ${frame}`);
  }
  // Raw artwork must be reproducible from the retained editable rig, not an older compiled atlas.
  for(const [frame,facing,action,phase] of [[0,'front','walk',0],[8,'right','walk',0],[16,'back','walk',0],
    [24,'front','idle',0],[34,'front','sleep',0],[35,'front','sit',0]]) {
    const filename=`${String(frame).padStart(2,'0')}-${facing}-${action}-${phase}.png`;
    const fresh=await sharp(Buffer.from(renderHiddenCharacter(character.id,facing,action,phase))).png().toBuffer();
    assert.equal(sha(fresh),sha(await fs.readFile(path.join(source,'raw',filename))),'Native artwork is stale');
  }
  const pet=catalog.pets.find(p=>p.id===character.id);
  assert(pet?.animated);assert.equal(pet.directPrice,9999);assert(!catalog.wearablePetIds.includes(character.id));
  const stageAtlases=[],portraits=[];
  for(let stage=1;stage<=4;stage++) {
    const imported=await fs.readFile(path.join(ROOT,`artifacts/premium-character-atlases/${character.id}/import/pet-${character.id}-${stage}.png`));
    assert.equal(sha(imported),sha(atlas),'A growth stage changed source artwork');
    for(const [url,array] of [[pet.atlas[stage-1],stageAtlases],[pet.art[stage-1],portraits]]) {
      const relative=url.split('?')[0].replace('/pet/','');
      const published=await fs.readFile(path.join(ROOT,'pet-app/public',relative));
      const built=await fs.readFile(path.join(ROOT,'pet-app/dist',relative));
      assert.equal(sha(built),sha(published),`${character.id} stage ${stage}: served art is stale`);
      array.push(sha(published));
    }
  }
  assert.equal(new Set(stageAtlases).size,1,'Atlas changed between stages');
  assert.equal(new Set(portraits).size,1,'Portrait changed between stages');
  console.log(`✓ ${character.id}: 4096 RGBA, 37 complete / 27 empty slots, one scale, reproducible rig and four matching served stages`);
}
