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
import {FIGHTERS,STAGES} from '../pet-app/lib/brawl/catalog.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-roster-browser-')),dbFile=path.join(temp,'db.json'),out=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/basic-attacks-v1-live');await fs.mkdir(out,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:['S001','S002','S003'].map((id,n)=>({studentid:id,name:['全角色測試','稀有對戰測試','未購買測試'][n],passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'})),studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');for(const id of ['S001','S002','S003'])await pets.ensureStudent(id);
const fixture=store.load();for(const [id,roster] of [['S001',FIGHTERS],['S002',FIGHTERS.filter(f=>f.id==='monchhichi')]]){for(const f of roster)fixture.petInstances.push({petId:randomUUID(),studentId:id,speciesId:f.id,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(fixture.petProfiles.find(p=>p.studentId===id),{activePetId:fixture.petInstances.find(p=>p.studentId===id).petId,starterEggClaimed:true});fixture.petWallets.find(w=>w.studentId===id).balance=2500;}store.save();
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});let logs='',browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],failed=[],results=[];const pass=label=>{console.log('✓ '+label);results.push(label);};const balances=async()=>{const d=JSON.parse(await fs.readFile(dbFile,'utf8'));return ['S001','S002'].map(id=>d.petWallets.find(p=>p.studentId===id).balance);};
const ready=async p=>p.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
const leave=async p=>{await p.keyboard.press('Escape');await p.locator('[data-brawl="lobby"]').click();await p.locator('.brawl-roster-head').waitFor();};
try{
 const baseURL='http://127.0.0.1:'+port;for(let n=0;n<200;n++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({baseURL,viewport:{width:1194,height:834},hasTouch:true});
 assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failed.push(r.url());});
 await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-roster-head').waitFor();await page.locator('[data-brawl="mode"][data-id="practice"]').click();
 const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),roster=FIGHTERS.filter(f=>!process.env.BRAWL_ATTACK_PARTIAL||manifest.fighterAttackAnimations[f.id]);const reports=[];
 for(const f of roster){
  await page.locator(`[data-brawl="fighter"][data-id="${f.id}"]`).click();await page.locator('[data-brawl="start"]').first().click();await ready(page);
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__attackUpdate=scene.sys.sceneUpdate;scene.sys.sceneUpdate=(_t,d)=>scene.draw(Math.min(d,50));const p=scene.runtime.state.actors[0];p.x=52000;p.y=45500;scene.runtime.state.actors[1].x=95000;scene.draw(16);});
  const frames=[];
  for(const action of ['attack1','attack2','attack3','air'])for(const face of [1,-1]){
   const row=await page.evaluate(({action,face})=>{const scene=window.__petGame.scene.getScene('Brawl'),p=scene.runtime.state.actors[0],c=scene.runtime.assets.fighters[p.kind].clips[action];p.action=action;p.facing=face;p.windup=action==='attack3'?10:6;p.actionDuration=action==='attack3'?30:action==='air'?24:20;p.z=action==='air'?10000:0;const seen=[];for(let t=0;t<p.actionDuration;t++){p.actionTick=t;scene.draw(16);const v=scene.views.get(p.id);seen.push({t,page:v.sprite.texture.key,frame:Number(v.sprite.frame.name),width:v.sprite.frame.width,height:v.sprite.frame.height,displayWidth:v.sprite.displayWidth,origin:v.sprite.originY,flip:v.sprite.flipX,missing:v.sprite.texture.key==='__MISSING'});}p.actionTick=p.windup+2;scene.draw(16);return {clip:c,seen};},{action,face});
   assert.equal(row.clip.poseTimeline,'strike',f.id+' '+action);assert.ok(row.seen.every(r=>!r.missing&&r.flip===(face<0)));assert.equal(new Set(row.seen.map(r=>r.displayWidth)).size,1,'No procedural body stretching');
   for(const i of row.seen)assert.ok(i.frame>=0&&Number.isFinite(i.origin));
   frames.push({action,face,...row});if(face===1)await page.screenshot({path:path.join(out,`${f.id}-${action}.png`)});
  }
  reports.push({id:f.id,frames});
  if(f.id==='doraemon'||f.id==='naruto-uzumaki'){
   const utility=await page.evaluate(({id,skill})=>{const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state,p=s.actors[0],t=s.actors[1];Object.assign(p,{x:52000,y:45500,z:0,vz:0,action:'idle',actionTick:0,actionDuration:0,lastMask:0,mp:10000,cooldowns:[0,0],stop:0,knock:0,facing:1});Object.assign(t,{x:58000,y:45500,z:0,vz:0,stop:0,invuln:0});s.freeze=0;scene.runtime.step(skill===0?128:256);for(let i=0;i<70;i++){scene.runtime.step(0);scene.draw(16);}if(id==='doraemon'){p.action='air';scene.draw(16);const frame=scene.frame(p);return {flight:p.flightUntil>s.tick,pose:frame.cast?.poseTimeline,page:frame.key,expectedPage:'brawl-'+p.kind+'-'+scene.runtime.assets.fighters[p.kind].clips.skill2.page};}const clones=s.actors.filter(a=>a.cloneOwner);return {clones:clones.length,frames:clones.map(a=>{a.action='attack1';a.actionTick=6;a.windup=6;a.actionDuration=20;scene.draw(16);const frame=scene.frame(a),v=scene.views.get(a.id);return {pose:frame.cast?.poseTimeline,page:frame.key,missing:v.sprite.texture.key==='__MISSING',label:v.status.visible};})};},{id:f.id,skill:f.id==='doraemon'?1:f.skills.findIndex(k=>k.mechanic==='summon')});
   if(f.id==='doraemon'){assert.equal(utility.flight,true);assert.equal(utility.pose,'cast');assert.equal(utility.page,utility.expectedPage,'Flying ray retains its flying cast pose');}
   else{assert.equal(utility.clones,2);assert.ok(utility.frames.every(r=>r.pose==='strike'&&!r.missing&&!r.label),'Clones use leader normal sprites without labels');}
   await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors=scene.runtime.state.actors.filter(a=>!a.cloneOwner);scene.runtime.state.actors[0].flightUntil=0;});
  }
  // Held input exercises the real simulation and render loop, not pose fixtures.
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl'),p=scene.runtime.state.actors[0];Object.assign(p,{x:52000,y:45500,z:0,vz:0,action:'idle',actionTick:0,actionDuration:0,lastMask:0,queued:false,bufferUntil:-1,stop:0,knock:0,facing:1});scene.__actions=[];scene.sys.sceneUpdate=(t,d)=>{scene.__attackUpdate(t,d);scene.__actions.push({action:p.action,rush:!!p.rush,frame:scene.views.get(p.id).sprite.frame.name});};});
  await page.keyboard.down('KeyJ');await page.waitForTimeout(1200);await page.keyboard.up('KeyJ');
  const combo=await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').__actions.map(r=>r.action));assert.ok(['attack1','attack2','attack3'].every(a=>combo.includes(a)),f.id+' held three-hit chain');
  await page.waitForTimeout(450);await page.keyboard.press('KeyK');await page.waitForTimeout(100);await page.keyboard.press('KeyJ');await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').__actions.some(r=>r.action==='air')),f.id+' actual aerial attack');
  await page.waitForFunction(()=>{const p=window.__petGame.scene.getScene('Brawl').runtime.state.actors[0];return p.z===0&&p.action==='idle';});await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyD');await page.waitForTimeout(100);await page.keyboard.press('KeyJ');await page.waitForTimeout(100);await page.keyboard.up('KeyD');await page.keyboard.up('ShiftLeft');
  assert.ok(await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').__actions.some(r=>r.rush&&r.action.startsWith('attack'))),f.id+' actual running strike');
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.sys.sceneUpdate=scene.__attackUpdate;});await leave(page);console.log('  normal attacks '+f.id);
 }
 pass('All fighters render four normal attacks in both directions with stable body scale and correct pages');
 pass('Real held input completes every three-hit combo, jumping attack and running strike');
 if(!process.env.BRAWL_ATTACK_PARTIAL){
  await page.locator('[data-brawl="fighter"][data-id="dragon-ball-goku"]').click();await page.locator('[data-brawl="mode"][data-id="duel"]').click();await page.locator('#brawlOpponent').selectOption('dynasty-warriors-zhao-yun');await page.locator('[data-brawl="start"]').first().click();await ready(page);
  const opponent=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state;scene.__aiUpdate=scene.sys.sceneUpdate;scene.sys.sceneUpdate=(_t,d)=>scene.draw(Math.min(d,50));const a=s.actors[1],frames=[];for(const action of ['attack1','attack2','attack3','air']){Object.assign(a,{action,actionTick:action==='attack3'?10:6,windup:action==='attack3'?10:6,actionDuration:30,facing:-1,z:action==='air'?10000:0});scene.draw(16);const f=scene.frame(a),v=scene.views.get(a.id);frames.push({action,pose:f.cast?.poseTimeline,page:f.key,missing:v.sprite.texture.key==='__MISSING',flip:v.sprite.flipX});}return {team:a.team,human:!!a.human,frames};});
  assert.equal(opponent.team,1);assert.equal(opponent.human,false);assert.ok(opponent.frames.every(r=>r.pose==='strike'&&!r.missing&&r.flip),'AI fighters use the same contact timeline and dedicated pages');await page.screenshot({path:path.join(out,'ai-left-facing-air.png')});await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.sys.sceneUpdate=scene.__aiUpdate;});await leave(page);pass('AI opponents load their own four attack clips and face correctly');
 }
 assert.deepEqual(await balances(),[2500,2500]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,fighters:reports.length,results,reports,errors,failed},null,2));
}catch(error){await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}
finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));assert.ok(path.resolve(temp).startsWith(path.join(os.tmpdir(),'buio-roster-browser-')));await fs.rm(temp,{recursive:true,force:true});}
