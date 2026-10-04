import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';
import {STAGES} from '../pet-app/lib/brawl/catalog.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-chapter-entry-')),dbFile=path.join(temp,'db.json'),out=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/chapter-entry');
await fs.mkdir(out,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'章節進入測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');await pets.ensureStudent('S001');
const fixture=store.load(),petId=randomUUID();fixture.petInstances.push({petId,studentId:'S001',speciesId:'starpatch-cat',xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
Object.assign(fixture.petProfiles[0],{activePetId:petId,starterEggClaimed:true});fixture.petWallets[0].balance=2500;fixture.petBrawlProgress=[{studentId:'S001',state:Object.fromEntries(STAGES.map(s=>[s.id+':normal',{stars:1,clears:1,seconds:60}]))}];store.save();
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);const errors=[],failed=[],report=[];
try{
 const baseURL='http://127.0.0.1:'+port;for(let n=0;n<200;n++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({baseURL,viewport:{width:1194,height:834},hasTouch:true});
 assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
 await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-roster-head').waitFor();await page.locator('[data-brawl="mode"][data-id="campaign"]').click();
 for(const [index,stage] of STAGES.entries()){
  await page.locator('[data-brawl="act"][data-id="'+Math.floor(index/4)+'"]').click();
  await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.brawl-stage-card img')];return images.length===4&&images.every(n=>n.complete&&n.naturalWidth>0);});
  await page.locator('[data-brawl="start"][data-stage="'+stage.id+'"]').click();
  await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
  await page.locator('.brawl-story-overlay').waitFor();assert.equal(await page.locator('[data-brawl="story-skip"]').count(),0);
  while(await page.locator('.brawl-story-overlay').count())await page.locator('[data-brawl="story-next"]').click();
  await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.tick>0);
  const info=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');return {stage:scene.runtime.state.stageId,missing:scene.children.list.filter(o=>o.texture?.key==='__MISSING').length,background:scene.background.texture.key,tick:scene.runtime.state.tick};});
  assert.equal(info.stage,stage.id);assert.equal(info.missing,0);assert.equal(info.background,'brawl-bg-'+stage.id);
  await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,`${String(index+1).padStart(2,'0')}-${stage.id}.png`)});
  await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="abandon"]').click();await page.locator('.brawl-roster-head').waitFor();
  report.push(info);console.log('✓ Chapter '+(index+1)+' opens, completes its mandatory opening and starts battle');
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).petWallets[0].balance,2500);
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,chapters:report.length,report,errors,failed},null,2)+'\n');
}catch(error){await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}
finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));await fs.rm(temp,{recursive:true,force:true});}
