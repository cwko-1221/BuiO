import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
process.env.NODE_ENV='development';
const require=createRequire(import.meta.url),{petDistDirectory}=require('../pet-app/lib/published-dist.cjs');
const {getCatalog}=require('../pet-app/repositories/brawl.repo.js');
const saved=process.env.PET_APP_DIST_DIR,temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-published-brawl-'));
try{
 await fs.mkdir(path.join(temp,'assets/art/brawl'),{recursive:true});
 const fixture={version:'brawl-v2',frameSize:256,fighters:{},backgrounds:{'sunny-training':'/pet/assets/published-only.webp'}};
 await fs.writeFile(path.join(temp,'assets/art/brawl/manifest.json'),JSON.stringify(fixture));
 process.env.PET_APP_DIST_DIR=temp;
 assert.equal(petDistDirectory(),temp);
 assert.equal((await getCatalog()).assets.backgrounds['sunny-training'],fixture.backgrounds['sunny-training'],'API chooses the same isolated published build as static routing');
 delete process.env.PET_APP_DIST_DIR;
 assert.equal(petDistDirectory(),path.resolve('pet-app/dist'));
 const manifest=JSON.parse(await fs.readFile('pet-app/dist/assets/art/brawl/manifest.json','utf8'));
 const catalog=await getCatalog();assert.deepEqual(catalog.assets.backgrounds,manifest.backgrounds);
 for(const url of [...Object.values(manifest.backgrounds),...Object.values(manifest.panoramas||{}).map(p=>p.url)])await fs.access(path.join(petDistDirectory(),url.slice('/pet/'.length)));
 console.log('✓ API uses the served build manifest; every published chapter cover and background exists, independently of unfinished public assets');
}finally{if(saved===undefined)delete process.env.PET_APP_DIST_DIR;else process.env.PET_APP_DIST_DIR=saved;await fs.rm(temp,{recursive:true,force:true});}
