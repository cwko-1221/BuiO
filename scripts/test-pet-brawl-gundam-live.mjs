import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';
import {INPUT as I,VERSION} from '../pet-app/lib/brawl/catalog.mjs';
const id='gundam-rx-78-2',out=path.resolve('artifacts/pet-playtest/gundam-brawl/browser');await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-gundam-live-')),dbFile=path.join(temp,'db.json');
await fs.writeFile(dbFile,JSON.stringify({users:['S001','S002'].map(studentid=>({studentid,name:studentid==='S001'?'高達測試':'未購買測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'})),studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');
for(const studentId of ['S001','S002'])await pets.ensureStudent(studentId);const fixture=store.load();
for(const [studentId,speciesId] of [['S001',id],['S002','starpatch-cat']]){const petId=randomUUID();fixture.petInstances.push({petId,studentId,speciesId,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(fixture.petProfiles.find(p=>p.studentId===studentId),{activePetId:petId,starterEggClaimed:true});fixture.petWallets.find(w=>w.studentId===studentId).balance=2500;}store.save();
const port=await new Promise(resolve=>{const l=net.createServer();l.listen(0,'127.0.0.1',()=>{const p=l.address().port;l.close(()=>resolve(p));});});
const baseURL=`http://127.0.0.1:${port}`,server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],failures=[],checks=[],pass=label=>{checks.push(label);console.log('✓ '+label);};
const shot=name=>page.screenshot({path:path.join(out,name+'.png')});
const state=()=>page.evaluate(()=>structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
const visual=()=>page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl'),a=s.runtime.state.actors[0],v=s.views.get(a.id);return {actor:{key:v.sprite.texture.key,frame:v.sprite.frame.name,width:v.sprite.displayWidth,originY:v.sprite.originY,flip:v.sprite.flipX},fx:s.elemental.sprites.filter(i=>i.visible).map(i=>({key:i.texture.key,frame:i.frame.name,width:i.displayWidth,flip:i.flipX,x:i.x,y:i.y})),stats:structuredClone(s.elemental.stats)};});
async function start(facing=1,distance=70000){
  if(await page.locator('[data-brawl="pause"]').count()){await page.locator('[data-brawl="pause"]').click();await page.locator('[data-brawl="lobby"]').click();}
  await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator(`[data-brawl="fighter"][data-id="${id}"]`).click();await page.locator('[data-brawl="start"]').first().click();
  await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
  await page.evaluate(({facing,distance})=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__normalUpdate??=scene.update;scene.update=(_t,dt)=>scene.draw(Math.min(dt,50));scene.sys.sceneUpdate=scene.update;const [a,b]=scene.runtime.state.actors;a.x=facing>0?30000:100000;a.facing=facing;b.x=a.x+facing*distance;a.y=b.y=45500;for(let n=0;n<10;n++)scene.draw(16);},{facing,distance});
}
const ticks=n=>page.evaluate(n=>{const scene=window.__petGame.scene.getScene('Brawl'),samples=[];for(let i=0;i<n;i++){scene.runtime.step();scene.draw(16);const a=scene.runtime.state.actors[0],v=scene.views.get(a.id);samples.push({tick:scene.runtime.state.tick,action:a.action,frame:v.sprite.frame.name,key:v.sprite.texture.key,projectiles:scene.runtime.state.projectiles.length});}return samples;},n);
const tap=async bit=>{const box=await page.locator(`[data-battle-key="${bit}"]`).boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await ticks(1);};
try{
  const deadline=Date.now()+20000;while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw Error('server startup timeout');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({baseURL,viewport:{width:1194,height:834},hasTouch:true});
  await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}});
  const catalog=await (await context.request.get('/api/pet/brawl/catalog')).json();assert.equal(catalog.version,VERSION);assert.equal(catalog.fighters.at(-1).id,id);assert.ok(catalog.assets.fighters[id].clips.skill1.emitters);
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failures.push(r.url());});
  await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator(`[data-brawl="fighter"][data-id="${id}"]`).click();
  assert.match(await page.locator(`[data-brawl="fighter"][data-id="${id}"]`).innerText(),/光束步槍連射/);await shot('01-owned-gundam-lobby');
  await start();await tap(I.SKILL1);let samples=await ticks(17);await shot('02-rifle-aim');assert.ok((await visual()).actor.key.includes(id));
  samples.push(...await ticks(33));await shot('03-rifle-three-bolts');let v=await visual();
  assert.ok(v.fx.some(f=>f.key==='brawl-skill-rx-beam-rifle'&&[3,4,5].includes(Number(f.frame))&&f.width>=200));
  assert.ok(samples.some(s=>s.projectiles===3));assert.match(await page.locator('#brawlCooldown0').innerText(),/\d/);
  samples.push(...await ticks(54));assert.equal((await state()).actors[1].maxHp-(await state()).actors[1].hp,36);
  assert.ok(new Set(samples.filter(s=>s.action==='skill1').map(s=>s.frame)).size>=6);pass('Owned Gundam uses generated aiming/recoil/recovery poses, three large animated rifle bolts, real damage and a visible cooldown');
  await start(-1);await tap(I.SKILL1);await ticks(38);await shot('04-rifle-left');v=await visual();assert.ok(v.actor.flip);assert.ok(v.fx.some(f=>f.key==='brawl-skill-rx-beam-rifle'&&f.flip));
  await start(1,14000);await tap(I.SKILL2);samples=await ticks(22);await shot('05-saber-downstroke');v=await visual();assert.ok(v.fx.some(f=>f.key==='brawl-skill-rx-beam-saber'));assert.ok(v.actor.key.includes(id));
  samples.push(...await ticks(13));await shot('06-saber-rising-cut');
  for(let n=0;n<40&&(await state()).actors[0].actionTick<46;n++)samples.push(...await ticks(1));
  await shot('07-saber-thrust');samples.push(...await ticks(35));
  assert.equal((await state()).actors[1].maxHp-(await state()).actors[1].hp,32);assert.ok(new Set(samples.filter(s=>s.action==='skill2').map(s=>s.frame)).size>=6);
  await start(-1,14000);await tap(I.SKILL2);await ticks(36);await shot('08-saber-left');assert.ok((await visual()).fx.some(f=>f.key==='brawl-skill-rx-beam-saber'&&f.flip));pass('Both saber directions use three distinct slash/thrust poses with the new pink slash atlas and 32 actual damage; left-facing art and effects mirror together');
  await start(1,5500);await tap(I.ATTACK);await ticks(5);await shot('09-basic-saber-attack');assert.ok((await visual()).actor.key.includes(id));await ticks(25);assert.ok((await state()).actors[1].hp<99999);
  await page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl');s.runtime.state.actors[0].mp=0;s.runtime.state.actors[0].cooldowns=[0,0];s.runtime.changed();});
  assert.match(await page.locator('#brawlCooldown0').innerText(),/MP 不足/);assert.equal(await page.locator(`[data-battle-key="${I.SKILL1}"]`).getAttribute('aria-disabled'),'true');
  const buttons=await page.locator('.brawl-buttons button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {w:b.width,h:b.height};}));assert.ok(buttons.every(b=>b.w>=64&&b.h>=64));pass('Normal attacks use timed saber poses; zero MP disables skills, with large iPad controls');
  await start(1,55000);await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.update=scene.__normalUpdate;scene.sys.sceneUpdate=scene.update;window.__gundamTimes=[];const start=performance.now();const sample=t=>{window.__gundamTimes.push(t);if(t-start<1400)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await page.keyboard.press('KeyU');await page.waitForTimeout(1600);await shot('10-live-keyboard-rifle');
  const performanceSample=await page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl'),t=window.__gundamTimes;return {fps:(t.length-1)*1000/(t.at(-1)-t[0]),casts:s.feedback.casts,ticks:s.runtime.state.tick};});assert.ok(performanceSample.fps>=25&&performanceSample.casts>0&&performanceSample.ticks>=60,JSON.stringify(performanceSample));
  await page.setViewportSize({width:1024,height:768});await shot('11-ipad-landscape');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));pass('Normal-speed keyboard skill simulation and iPad resize render without overflow at >=25fps');
  const unowned=await browser.newContext({baseURL,viewport:{width:1194,height:834}});await unowned.request.post('/api/auth/login',{data:{studentId:'S002',password:'test'}});const unownedPage=await unowned.newPage();await unownedPage.goto('/pet');await unownedPage.locator('[data-tab="brawl"]').click();await unownedPage.locator('[data-brawl="filter"][data-id="all"]').click();await unownedPage.locator(`[data-brawl="fighter"][data-id="${id}"]`).click();
  assert.equal(await unownedPage.locator('[data-brawl="start"]:enabled').count(),0);await unownedPage.screenshot({path:path.join(out,'12-unowned-gundam-locked.png')});await unowned.close();pass('Unpurchased Gundam is locked in the real lobby and cannot start a battle');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);assert.ok(JSON.parse(await fs.readFile(dbFile,'utf8')).petWallets.every(w=>w.balance===2500));
  await fs.writeFile(out+'/results.json',JSON.stringify({pass:true,version:VERSION,checks,errors,failures,performanceSample,physicalIpadVerified:false,postgresVerified:false},null,2)+'\n');
}catch(error){if(page)await shot('failure').catch(()=>{});await fs.writeFile(out+'/failure.txt',error.stack+'\n'+logs);throw error;}
finally{await browser?.close();if(server.exitCode===null){const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;}assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
