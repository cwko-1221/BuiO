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
for(const character of [...HIDDEN_CHARACTERS,{id:'monchhichi'}]) {
 const generated=character.id!=='pikachu';
 const source=path.join(ROOT,'pet-app/art-source/imagegen/baked-wearables',character.id+(generated?'-perfect-v2':'-native-v1'));
 const artifact=path.join(ROOT,'artifacts/premium-character-atlases',character.id,generated?'generated-v2':'');
 const atlas=await fs.readFile(path.join(source,'pet-'+character.id+'-4096.png'));
 const meta=await sharp(atlas).metadata();
 assert.equal(meta.width,4096);assert.equal(meta.height,4096);assert.equal(meta.channels,4);assert(meta.hasAlpha);
 const report=JSON.parse(await fs.readFile(path.join(artifact,'build-report.json'),'utf8'));
 assert.equal(report.atlasHash,sha(atlas));
 assert.equal(new Set(report.frames.slice(0,32).map(f=>f.scale)).size,1,character.id+': per-frame motion scaling');
 for(let frame=0;frame<64;frame++){
 const {data}=await sharp(atlas).extract({left:frame%8*512,top:Math.floor(frame/8)*512,width:512,height:512}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let count=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){if(data[(y*512+x)*4+3]<=8)continue;count++;assert(x>=16&&x<496&&y>=16&&y<496,character.id+' '+frame+': slot boundary contamination');}
 assert(frame<37?count>3000:count===0,character.id+': incorrect populated/reserved cell '+frame);
 if(generated&&frame<37){
 const expected=await sharp(path.join(source,'processed',String(frame).padStart(2,'0')+'.png')).ensureAlpha().raw().toBuffer();
 assert.equal(sha(data),sha(expected),character.id+' '+frame+': atlas differs from normalized frame');
 }
 }
 if(generated){
 assert.deepEqual(report.errors,[],character.id+': source QA failed');
 assert.equal(report.modelHash,sha(await fs.readFile(path.join(source,'model-reference.png'))));
 assert.equal(report.promptHash,sha(await fs.readFile(path.join(source,'generation-prompts.json'))));
 const prompts=JSON.parse(await fs.readFile(path.join(source,'generation-prompts.json'),'utf8'));
 for(const group of Object.values(prompts.groups))for(const ref of group.references??[]){
  assert.equal(ref.hash,sha(await fs.readFile(path.join(source,ref.file))),character.id+': retained generation reference changed');
 }
 for(const check of Object.values(report.supportChecks)){
  assert.notEqual(check.firstPassing.sign,check.oppositePassing.sign);
  assert([1,2,3].every(p=>check.phases[p].sign===check.firstPassing.sign),character.id+': first half changes supporting foot');
  assert([5,6,7].every(p=>check.phases[p].sign===check.oppositePassing.sign),character.id+': opposite half changes supporting foot');
 }
 for(const group of report.groups)assert.equal(group.hash,sha(await fs.readFile(path.join(ROOT,group.file))),character.id+': retained raw sheet changed');
 }else{
 for(const [frame,facing,action,phase] of [[0,'front','walk',0],[8,'right','walk',0],[16,'back','walk',0],[24,'front','idle',0],[34,'front','sleep',0],[35,'front','sit',0]]){
 const filename=String(frame).padStart(2,'0')+'-'+facing+'-'+action+'-'+phase+'.png';
 const fresh=await sharp(Buffer.from(renderHiddenCharacter(character.id,facing,action,phase))).png().toBuffer();
 assert.equal(sha(fresh),sha(await fs.readFile(path.join(source,'raw',filename))));
 }
 }
 const pet=catalog.pets.find(p=>p.id===character.id);
 assert(pet?.animated);assert.equal(pet.directPrice,9999);assert(!catalog.wearablePetIds.includes(character.id));
 const atlases=[],portraits=[];
 for(let stage=1;stage<=4;stage++){
 assert.equal(sha(atlas),sha(await fs.readFile(path.join(artifact,'import','pet-'+character.id+'-'+stage+'.png'))));
 for(const [url,array] of [[pet.atlas[stage-1],atlases],[pet.art[stage-1],portraits]]){
 const relative=url.split('?')[0].replace('/pet/',''),publicBytes=await fs.readFile(path.join(ROOT,'pet-app/public',relative)),builtBytes=await fs.readFile(path.join(ROOT,'pet-app/dist',relative));
 assert.equal(sha(publicBytes),sha(builtBytes),character.id+': stale served art');array.push(sha(publicBytes));
 }
 }
 assert.equal(new Set(atlases).size,1);assert.equal(new Set(portraits).size,1);
 console.log('✓ '+character.id+': 37 complete / 27 transparent cells, retained '+(generated?'generated raster':'legacy native')+' source verified, four matching served stages');
}
