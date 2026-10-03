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
import sharp from 'sharp';
import {ALL_FIGHTERS,FIGHTERS} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle} from '../pet-app/lib/brawl/simulation.mjs';
const out=path.resolve('artifacts/pet-playtest/brawl-v7/elemental-browser');await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-elemental-browser-')),dbFile=path.join(temp,'db.json');
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'招式驗證',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');await pets.ensureStudent('S001');
const d=store.load();for(const f of ALL_FIGHTERS)d.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId:f.id,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(d.petProfiles[0],{activePetId:d.petInstances[0].petId,starterEggClaimed:true});d.petWallets[0].balance=2500;store.save();
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),assets=require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest,ALL_FIGHTERS);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,context;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);const errors=[],failed=[],coverage=[],performance=[];
function stateFor(f){const s=createBattle({mode:'practice',fighterId:f.id});s.actors[0].x=32000;s.actors[1].x=62000;return s;}
try{
  const baseURL=`http://127.0.0.1:${port}`;for(let n=0;n<200;n++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({baseURL,viewport:{width:1024,height:768},hasTouch:true,recordVideo:{dir:path.join(out,'video'),size:{width:1024,height:768}}});
  assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
  const catalog=await (await context.request.get('/api/pet/brawl/catalog')).json();assert.equal(catalog.fighters.length,25);
  for(const fighter of FIGHTERS.filter(f=>f.rarity==='epic')){const pet=d.petInstances.find(p=>p.speciesId===fighter.id);assert.equal((await context.request.post('/api/pet/brawl/access',{data:{petId:pet.petId,fighterId:fighter.id,mode:'practice'}})).status(),200);}
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failed.push(r.url());});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-fighter').first().waitFor();assert.equal(await page.locator('.brawl-fighter').count(),25);
  await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator('[data-brawl="start"]').first().click();await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
  async function reset(f,n,manual=true){
    const token=randomUUID(),initial=stateFor(f),k=f.skills[n],p=initial.actors[0],target=initial.actors[1],distant=['fissure','rain','lob','tornado','field','trap','barrage','sky-shot'].includes(k.mechanic);
    target.x=Math.min(110000,p.x+(distant?k.range+(k.mechanic==='barrage'?100:0):k.mechanic==='rasengan'?180:260)*100);target.y=p.y+(k.spread?.[0]||0)*100;
    await page.evaluate(({initial,assets,f,token})=>{
      const scene=window.__petGame.scene.getScene('Brawl');if(scene.__normalUpdate)scene.update=scene.__normalUpdate;
      const runtime={...scene.runtime};Object.assign(runtime.state,initial);runtime.assets=assets;runtime.qaToken=token;scene.scene.restart(runtime);
      // Isolated effect-position fixture; public owned selection is verified separately.
      document.querySelector('.brawl-player-hud>b').textContent=f.name['zh-HK'];
      document.querySelectorAll('.brawl-skill span').forEach((el,n)=>el.textContent=f.skills[n].name['zh-HK']);
    },{initial,assets,f,token});
    try{await page.waitForFunction(({id,token})=>{const scene=window.__petGame.scene.getScene('Brawl');return scene.runtime.qaToken===token&&scene.views.get(1)?.sprite.texture.key.includes(id)&&scene.elemental&&window.__petGame.scene.isActive('Brawl');},{id:f.id,token});}catch(error){const snapshot=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');return {active:window.__petGame.scene.isActive('Brawl'),token:scene.runtime?.qaToken,kind:scene.runtime?.state.actors[0].kind,views:[...scene.views.entries()].map(([id,v])=>({id,texture:v.sprite.texture.key})),failed:scene.loadFailed,body:document.body.innerText.slice(-1500)};});await fs.writeFile(path.join(out,'reset-failure.json'),JSON.stringify({fighter:f.id,token,snapshot,errors,failed},null,2));await page.screenshot({path:path.join(out,'reset-failure.png')});throw error;}
    if(manual)await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__normalUpdate=scene.update;scene.update=(_time,delta)=>scene.draw(Math.min(delta,50));});
  }
  for(const f of ALL_FIGHTERS)for(const [n,k] of f.skills.entries()){
    await reset(f,n);let tick=Number(k.windup||12)+20;
    if(['fissure','rain'].includes(k.mechanic))tick=12+k.arm+(k.columns-1)*k.interval+2;
    if(k.mechanic==='lob')tick=12+Math.floor(k.flight*.55);
    if(k.mechanic==='rasengan')tick=Number(k.windup)+16;
    if(k.mechanic==='beam')tick=Number(k.windup)+10;
    if(k.mechanic==='trap')tick=12+k.arm+3;
    if(k.mechanic==='barrage')tick=12+k.arm+20;
    const info=await page.evaluate(({n,tick})=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.step(n?256:128);for(let i=0;i<tick;i++){scene.runtime.step(0);scene.draw(16);}return {...scene.elemental.stats,texture:scene.views.get(1).sprite.texture.key,atlas:scene.textures.exists('brawl-elemental'),tick:scene.runtime.state.tick};},{n,tick});
    assert.ok(info.atlas&&info.texture.includes(f.id));assert.ok(info.peak<=72);if(k.kind==='kamehameha')assert.equal(info.beamWidth,150);if(k.kind==='flame-breath')assert.ok(info.flameLength>290);if(k.kind==='rasengan'||k.mechanic==='scan'||k.mechanic==='buff')assert.ok(info.peak>=1);
    await page.screenshot({path:path.join(out,f.id+`-skill${n+1}.png`)});coverage.push({fighter:f.id,skill:k.kind,...info});
  }
  console.log('✓ All 50 kits render, including 150px Kamehameha and a large held Rasengan; the public roster and owned API open all 25 fighters');
  for(const [id,n] of [['spark-hamster',0],['snowfeather-penguin',0],['thunderhorn-goat',1],['coral-seal',0],['dragon-ball-goku',0],['naruto-uzumaki',1]]){
    const f=ALL_FIGHTERS.find(f=>f.id===id);await reset(f,n,false);
    await page.evaluate(()=>{window.__fxFrameTimes=[];const end=performance.now()+1400;function frame(t){window.__fxFrameTimes.push(t);if(t<end)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
    await page.keyboard.down(n?'KeyI':'KeyU');await page.waitForTimeout(85);await page.keyboard.up(n?'KeyI':'KeyU');await page.waitForTimeout(1350);
    const measured=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl'),times=window.__fxFrameTimes;return {fps:(times.length-1)*1000/(times.at(-1)-times[0]),ticks:scene.runtime.state.tick,casts:scene.feedback.casts,hits:scene.feedback.hits,peak:scene.elemental.stats.peak};});
    assert.ok(measured.ticks>=45&&measured.casts>0&&measured.fps>=25,JSON.stringify({id,...measured}));performance.push({id,...measured});
  }
  console.log('✓ Real keyboard casts at normal simulation speed; all six heavy effects maintain at least 25fps in Chrome touch emulation');
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');window.__disposedVfx=scene.elemental;scene.scene.stop();});await page.waitForFunction(()=>window.__disposedVfx.sprites.length===0);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).petWallets[0].balance,2500);
  const picks=['spark-hamster-skill1','snowfeather-penguin-skill1','dragon-ball-goku-skill1','naruto-uzumaki-skill2'];
  const panels=await Promise.all(picks.map(async (name,n)=>({input:await sharp(path.join(out,name+'.png')).resize(768,576).toBuffer(),left:n%2*768,top:Math.floor(n/2)*576})));
  await sharp({create:{width:1536,height:1152,channels:4,background:'#142337'}}).composite(panels).png().toFile(path.join(out,'showcase.png'));
  for(const name of ['reset-failure.json','reset-failure.png','failure.txt'])await fs.rm(path.join(out,name),{force:true});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,coverage,performance,errors,failed,publicFighters:FIGHTERS.length},null,2));
  await context.close();context=undefined;await page.video().saveAs(path.join(out,'elemental-showcase.webm'));
  console.log('✓ Clean scene disposal, no page/asset failures, unchanged wallet and captured screenshots/video');
}catch(error){await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}finally{await context?.close();await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));assert.ok(path.resolve(temp).startsWith(path.join(os.tmpdir(),'buio-elemental-browser-')));await fs.rm(temp,{recursive:true,force:true});}
