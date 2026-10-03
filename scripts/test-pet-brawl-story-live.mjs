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
import {ADVENTURE,STORY_REVISION,storyText} from '../pet-app/lib/brawl/story.mjs';
import {INPUT,DIFFICULTIES,FIGHTERS} from '../pet-app/lib/brawl/catalog.mjs';
import {botInput} from './pet-brawl-bot.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-adventure-live-'));
const dbFile=path.join(temp,'db.json'),artifacts=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/adventure-story-v2');
await fs.mkdir(artifacts,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'冒險測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),repo=require('../pet-app/repositories/pet.repo.js'),store=require('../db/jsonStore.js');
await repo.ensureStudent('S001');const fixture=store.load(),petId=randomUUID();
fixture.petInstances.push({petId,studentId:'S001',speciesId:'pudding-pig',xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
for(const speciesId of ['starpatch-cat','golden-retriever-dog'])fixture.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
Object.assign(fixture.petProfiles[0],{activePetId:petId,starterEggClaimed:true});store.save();
const port=await new Promise(resolve=>{const sock=net.createServer();sock.listen(0,'127.0.0.1',()=>{const port=sock.address().port;sock.close(()=>resolve(port));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'1',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],checks=[],seen=[];const pass=label=>{checks.push(label);console.log('✓ '+label);};
const state=()=>page.evaluate(()=>structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
const shot=name=>page.screenshot({path:path.join(artifacts,name+'.png')});
const overlay=()=>page.locator('.brawl-story-overlay');
async function ready(){await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));}
async function frozen(){const before=await state();await page.keyboard.down('KeyD');await page.keyboard.press('KeyU');await page.waitForTimeout(180);await page.keyboard.up('KeyD');assert.deepEqual(await state(),before,'reading pauses timers, MP, input and enemies');}
async function readScene(scene,chapter){
  await overlay().waitFor();assert.equal(await overlay().getAttribute('data-scene'),scene.id);
  assert.equal(await page.locator('[data-brawl="story-skip"]').count(),0,'stories have no skip action');
  if(scene.kind!=='ending')assert.ok((await page.locator('.brawl-story-objective').innerText()).includes(chapter.sections.find(s=>s.id===scene.id).objective['zh-HK']));
  const start=Number(await overlay().getAttribute('data-line'));
  for(let n=start;n<scene.lines.length;n++){
    assert.equal(await page.locator('#brawlStoryLine').innerText(),storyText(scene.lines[n].text,'zh-HK',chapter.number===1?'布丁豬':chapter.number===11||chapter.number===13?'金毛犬':'星斑貓'));
    assert.ok((await page.locator('.brawl-story-counter').innerText()).includes(`${n+1} / ${scene.lines.length}`));
    if(n===start){await frozen();await shot(`${scene.id}-ipad`);}
    if(scene.kind==='boss')assert.equal((await state()).actors.some(a=>a.boss),false,'boss cannot spawn before the dialogue finishes');
    if(n===scene.lines.length-1)seen.push(scene.id);
    await page.locator('[data-brawl="story-next"]').click();
  }
  await overlay().waitFor({state:'hidden'});
  if(scene.kind==='ending')await page.locator('[data-brawl="again"]').waitFor({timeout:20000});
  else{await page.keyboard.press('Escape');await page.locator('[data-brawl="continue"]').waitFor();}
}
async function advanceToBeat(limit=36000){
  return page.evaluate(({source,I,difficulty,fighters,limit})=>{
    const bot=Function('I','DIFFICULTIES','fightersForVersion',`return (${source})`)(I,difficulty,()=>fighters),r=window.__petGame.scene.getScene('Brawl').runtime;
    for(let n=0;n<limit&&['playing','ko'].includes(r.state.status);n++){
      if(document.querySelector('.brawl-story-overlay'))break;
      r.step(bot(r.state));
    }
    return {status:r.state.status,zone:r.state.zone,tick:r.state.tick};
  },{source:botInput.toString(),I:INPUT,difficulty:DIFFICULTIES,fighters:FIGHTERS,limit});
}
try{
  const baseURL=`http://127.0.0.1:${port}`,deadline=Date.now()+20000;
  while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw Error('Server startup timed out');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({baseURL,viewport:{width:1180,height:820},hasTouch:true});
  await context.request.get('/api/auth/me');page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-fighter').first().waitFor();
  assert.equal(await page.locator('[data-brawl="mode"][data-id="campaign"]').innerText(),'冒險');
  assert.equal(await page.locator('.brawl-chapter-sections li').count(),16);
  assert.equal(await page.locator('[data-brawl="story-review"]').count(),0);
  assert.equal(await page.locator('[data-brawl="start"]:enabled').count(),1);
  await shot('adventure-lobby-ipad');pass('Adventure naming, four chapters per act and existing chapter unlocks');

  for(const [chapterIndex,chapter] of ADVENTURE.chapters.entries()){
    await page.locator(`[data-brawl="act"][data-id="${chapter.act}"]`).click();
    if(chapterIndex>0)await page.locator(`[data-brawl="fighter"][data-id="${[11,13].includes(chapter.number)?'golden-retriever-dog':'starpatch-cat'}"]`).click();
    let won=false;
    for(let attempt=0;attempt<12&&!won;attempt++){
    await page.locator(`[data-brawl="start"][data-stage="${chapter.stageId}"]`).click();await ready();await overlay().waitFor();
    assert.equal((await state()).tick,0);await frozen();
    if(chapterIndex===0&&attempt===0){
      for(const size of [[1180,820],[1024,768],[844,390],[390,844]]){
        await page.setViewportSize({width:size[0],height:size[1]});await shot('opening-'+size.join('x'));
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        const rect=await page.locator('[data-brawl="story-next"]').boundingBox();assert.ok(rect.height>=52);
        const panel=await page.locator('.brawl-story-panel').boundingBox();assert.ok(rect.y>=panel.y&&rect.y+rect.height<=panel.y+panel.height,'continue button must stay fully visible');
      }
      await page.setViewportSize({width:1180,height:820});
      await page.keyboard.press('Escape');assert.equal(await overlay().getAttribute('data-line'),'0');
      await page.keyboard.press('Enter');assert.equal(await overlay().getAttribute('data-line'),'1');
      await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true})));
      assert.equal(await overlay().getAttribute('data-line'),'1','held keys cannot consume multiple lines');
      await page.locator('[data-brawl="story-back"]').click();assert.equal(await overlay().getAttribute('data-line'),'0');
      await page.locator('[data-brawl="story-next"]').click();
      await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="resume"]').waitFor();await page.reload();
      await page.locator('[data-tab="brawl"]').click();await page.locator('[data-brawl="resume"]').click();await ready();await overlay().waitFor();
      assert.equal(await overlay().getAttribute('data-line'),'1');assert.equal((await state()).tick,0);
      pass('Large iPad buttons, portrait reading, keyboard/back navigation, exact dialogue save and reload');
    }
    let lost=false;
    for(const [n,section] of chapter.sections.entries()){
      await readScene(section.scene,chapter);
      if(attempt===0){
        await advanceToBeat(120);
        const screen=await page.addStyleTag({content:'.brawl-modal{visibility:hidden !important}'});
        await page.waitForTimeout(50);await shot('combat-chapter-'+chapter.number+'-section-'+(n+1));
        await screen.evaluate(e=>e.remove());
      }
      const result=await advanceToBeat();
      if(result.status==='lost'){lost=true;break;}
      if(n<3){assert.equal(result.zone,n+1);assert.equal(result.status,'playing');}
      else assert.equal(result.status,'won',`chapter ${chapter.number} wins with legal inputs`);
    }
    if(lost){await page.locator('[data-brawl="again"]').waitFor({timeout:20000});await page.locator('[data-brawl="again"]').click();continue;}
    won=true;
    await overlay().waitFor();assert.equal((await state()).status,'won');
    const before=JSON.parse(await fs.readFile(dbFile,'utf8'));assert.equal(before.petCurrencyLedger.filter(l=>l.kind==='brawl_win').length,Math.min(3,chapterIndex),'settlement waits for the ending');
    await readScene(chapter.ending,chapter);await shot(`chapter-${chapter.number}-result`);
    assert.equal(await page.locator('[data-brawl="nextchapter"]').count(),chapter.number<20?1:0);
    if([1,4].includes(chapter.number)){
      await page.locator('[data-brawl="nextchapter"]').click();await ready();await overlay().waitFor();
      assert.equal((await state()).stageId,ADVENTURE.chapters[chapterIndex+1].stageId);
      assert.equal((await state()).tick,0);
      await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="abandon"]').click();
      await page.locator(`[data-brawl="act"][data-id="${chapter.act}"]`).click();
      pass('Next chapter button starts the unlocked chapter, including across an act boundary');
    }else await page.locator('[data-brawl="again"]').click();
    await page.locator('.brawl-stage-card').first().waitFor();
    assert.equal(await page.locator('[data-brawl="story-review"]').count(),chapterIndex%4+1);
    pass(`Chapter ${chapter.number}: four real encounters, pre-spawn boss conversation, ending, verified reward and next unlock`);
    }
    assert.equal(won,true,`chapter ${chapter.number} completes within twelve legal attempts`);
  }
  assert.equal(new Set(seen).size,100);
  await page.locator('[data-brawl="act"][data-id="0"]').click();
  await page.locator('[data-brawl="story-review"][data-stage="starcrystal-cave"]').click();await overlay().waitFor();
  await page.locator('[data-brawl="story-review-scene"][data-scene="starcrystal-end"]').click();
  assert.equal(await page.locator('#brawlStoryLine').innerText(),ADVENTURE.chapters[2].ending.lines[0].text['zh-HK']);await shot('completed-story-review');
  await page.keyboard.press('Escape');await overlay().waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-brawl="start"]:enabled').count(),4);
  await page.locator('[data-brawl="start"]').first().click();await ready();await overlay().waitFor();
  assert.equal(await page.locator('[data-brawl="story-skip"]').count(),0);
  // An obsolete UI action must be ignored, not merely hidden.
  await page.evaluate(()=>{const b=document.createElement('button');b.dataset.brawl='story-skip';b.textContent='obsolete action';document.querySelector('.brawl-story-overlay').append(b);b.click();b.remove();});
  assert.equal(await overlay().getAttribute('data-line'),'0');assert.equal((await state()).tick,0);
  await page.keyboard.press('Escape');assert.equal(await overlay().getAttribute('data-line'),'0');
  await page.setViewportSize({width:768,height:1024});
  for(let n=1;n<ADVENTURE.chapters[0].sections[0].scene.lines.length;n++)await page.locator('[data-brawl="story-next"]').click();
  const lastLine=String(ADVENTURE.chapters[0].sections[0].scene.lines.length-1);
  await page.locator('[data-brawl="story-next"]').click();
  assert.ok((await page.locator('.brawl-story-help').innerText()).includes('橫向'));
  assert.equal(await overlay().getAttribute('data-line'),lastLine);assert.equal((await state()).tick,0);
  await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="resume"]').waitFor();await page.reload();
  await page.locator('[data-tab="brawl"]').click();await page.locator('[data-brawl="resume"]').click();await ready();await overlay().waitFor();
  assert.equal(await overlay().getAttribute('data-line'),lastLine,'save-and-return cannot complete an unread scene');
  assert.equal((await state()).tick,0);
  await page.setViewportSize({width:1180,height:820});await page.locator('[data-brawl="story-next"]').click();await overlay().waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.tick>0);
  await page.keyboard.press('Escape');await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="abandon"]').click();
  pass('Completed review, no skip button or obsolete action, Escape/repeat-key protection, portrait guard and saved mandatory dialogue');
  // Migrate an actual in-progress IndexedDB save: its old completed flag and
  // line index must not skip the rewritten story or change its combat replay.
  await page.locator('[data-brawl="start"]').first().click();await ready();await overlay().waitFor();
  for(let n=0;n<ADVENTURE.chapters[0].sections[0].scene.lines.length;n++)await page.locator('[data-brawl="story-next"]').click();
  await overlay().waitFor({state:'hidden'});await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.tick>=30);
  await page.keyboard.press('Escape');await page.locator('[data-brawl="continue"]').waitFor();
  const beforeMigration=await state();await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="resume"]').waitFor();
  await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('buio-pet-brawl',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),q=store.get('S001');q.onsuccess=()=>{const saved=q.result;saved.story={revision:1,seen:['sunny-1'],active:{id:'sunny-1',index:99}};store.put(saved);};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
  await page.reload();await page.locator('[data-tab="brawl"]').click();await page.locator('[data-brawl="resume"]').click();await ready();await overlay().waitFor();
  assert.equal(await overlay().getAttribute('data-line'),'0');assert.deepEqual(await state(),beforeMigration,'migration preserves verified combat');await frozen();
  await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="abandon"]').click();
  pass('Old IndexedDB story save rereads current dialogue from line zero while retaining the exact combat replay');

  const final=JSON.parse(await fs.readFile(dbFile,'utf8'));
  assert.equal(final.petCurrencyLedger.filter(l=>l.kind==='brawl_win').length,3);
  assert.equal(final.petInstances.reduce((total,p)=>total+p.xp,0),30);
  assert.equal(final.petBrawlRuns.filter(r=>r.result?.outcome==='won').length,20);
  assert.deepEqual(errors,[]);
  const report={pass:true,storyRevision:STORY_REVISION,chapters:20,sections:80,scenes:seen,checks,errors,physicalIpadVerified:false};
  await fs.writeFile(path.join(artifacts,'story-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({pass:false,error:error.stack,errors,logs:logs.slice(-1600)}));process.exitCode=1;}
finally{await browser?.close();server.kill();}
