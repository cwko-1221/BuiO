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
const out=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/skills-v11/all-skills');await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-elemental-browser-')),dbFile=path.join(temp,'db.json');
await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'招式驗證',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');await pets.ensureStudent('S001');
const d=store.load();for(const f of ALL_FIGHTERS)d.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId:f.id,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(d.petProfiles[0],{activePetId:d.petInstances[0].petId,starterEggClaimed:true});d.petWallets[0].balance=2500;store.save();
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),assets=require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest,ALL_FIGHTERS);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,context;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);const errors=[],failed=[],coverage=[],performance=[],animation=[],casts=[];
function stateFor(f){const s=createBattle({mode:'practice',fighterId:f.id});s.actors[0].x=32000;s.actors[1].x=62000;return s;}
try{
  const baseURL=`http://127.0.0.1:${port}`;for(let n=0;n<200;n++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({baseURL,viewport:{width:1024,height:768},hasTouch:true,recordVideo:{dir:path.join(out,'video'),size:{width:1024,height:768}}});
  assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
  const catalog=await (await context.request.get('/api/pet/brawl/catalog')).json();assert.equal(catalog.fighters.length,FIGHTERS.length);
  for(const fighter of FIGHTERS.filter(f=>f.rarity==='epic')){const pet=d.petInstances.find(p=>p.speciesId===fighter.id);assert.equal((await context.request.post('/api/pet/brawl/access',{data:{petId:pet.petId,fighterId:fighter.id,mode:'practice'}})).status(),200);}
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failed.push(r.url());});page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-fighter').first().waitFor();assert.equal(await page.locator('.brawl-fighter').count(),FIGHTERS.length);
  await page.locator('.brawl-fighter[data-id="dragon-ball-goku"]').click();await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator('[data-brawl="start"]').first().click();await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
  async function reset(f,n,manual=true,face=1){
    const token=randomUUID(),initial=stateFor(f),k=f.skills[n],p=initial.actors[0],target=initial.actors[1],distant=['fissure','rain','peel-trap','lob','tornado','field','trap','barrage','sky-shot'].includes(k.mechanic);
    p.facing=face;if(face<0)p.x=100000;target.x=Math.max(4500,Math.min(120000,p.x+face*(distant?k.range+(k.mechanic==='barrage'?100:0):k.mechanic==='rasengan'?180:260)*100));target.y=p.y+(k.spread?.[0]||0)*100;
    await page.evaluate(({initial,assets,f,token})=>{
      const scene=window.__petGame.scene.getScene('Brawl');if(scene.__normalUpdate){scene.update=scene.__normalUpdate;scene.sys.sceneUpdate=scene.update;}
      const runtime={...scene.runtime};Object.assign(runtime.state,initial);runtime.assets=assets;runtime.qaToken=token;scene.scene.restart(runtime);
      // Isolated effect-position fixture; public owned selection is verified separately.
      document.querySelector('.brawl-player-hud>b').textContent=f.name['zh-HK'];
      document.querySelectorAll('.brawl-skill .brawl-skill-name').forEach((el,n)=>el.textContent=f.skills[n].name['zh-HK']);
      f.skills.forEach((k,n)=>document.getElementById('brawlCost'+n).textContent=k.mp+' MP');
    },{initial,assets,f,token});
    try{await page.waitForFunction(({id,token})=>{const scene=window.__petGame.scene.getScene('Brawl');return scene.runtime.qaToken===token&&scene.views.get(1)?.sprite.texture.key.includes(id)&&scene.elemental&&window.__petGame.scene.isActive('Brawl');},{id:f.id,token});}catch(error){const snapshot=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');return {active:window.__petGame.scene.isActive('Brawl'),token:scene.runtime?.qaToken,kind:scene.runtime?.state.actors[0].kind,views:[...scene.views.entries()].map(([id,v])=>({id,texture:v.sprite.texture.key})),failed:scene.loadFailed,body:document.body.innerText.slice(-1500)};});await fs.writeFile(path.join(out,'reset-failure.json'),JSON.stringify({fighter:f.id,token,snapshot,errors,failed},null,2));await page.screenshot({path:path.join(out,'reset-failure.png')});throw error;}
    if(manual)await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__normalUpdate=scene.update;scene.update=(_time,delta)=>scene.draw(Math.min(delta,50));scene.sys.sceneUpdate=scene.update;});
  }
  for(const face of [1,-1])for(const f of ALL_FIGHTERS)for(const [n,k] of f.skills.entries()){
    await reset(f,n,true,face);let tick=Number(k.windup||12)+20;
    if(['fissure','rain'].includes(k.mechanic))tick=12+k.arm+(k.columns-1)*k.interval+2;
    if(k.mechanic==='peel-trap')tick=Number(k.windup)+k.flight+k.arm+8;
    if(k.mechanic==='lob')tick=12+Math.floor(k.flight*.55);
    if(k.mechanic==='rasengan')tick=Number(k.windup)+16;
    if(k.mechanic==='beam')tick=Number(k.windup)+10;
    if(k.mechanic==='trap')tick=12+k.arm+3;
    if(k.mechanic==='barrage')tick=12+k.arm+20;
    const classic=k.kind==='kamehameha';
    const info=await page.evaluate(({n,tick,classic,windup})=>{const scene=window.__petGame.scene.getScene('Brawl');let chargeFrames=[];scene.runtime.step(n?256:128);for(let i=0;i<tick;i++){scene.runtime.step(0);scene.draw(16);if(classic&&scene.runtime.state.actors[0].actionTick>0&&scene.runtime.state.actors[0].actionTick<windup)chargeFrames=scene.elemental.sprites.filter(s=>s.visible&&s.texture.key==='brawl-elemental').map(s=>Number(s.frame.name));}return {...scene.elemental.stats,texture:scene.views.get(1).sprite.texture.key,atlas:scene.textures.exists('brawl-elemental'),tick:scene.runtime.state.tick,chargeFrames,beamHeads:classic?scene.elemental.sprites.filter(s=>s.visible&&s.texture.key==='brawl-elemental'&&s.displayWidth>200).map(s=>({x:s.x,flipX:s.flipX})):[],playerX:scene.runtime.state.actors[0].x/100};},{n,tick,classic,windup:Number(k.windup||12)});
    assert.ok(info.atlas&&info.texture.includes(f.id));
    const textures=await page.evaluate(()=>window.__petGame.textures.getTextureKeys().filter(k=>k.startsWith('brawl-skill-')));
    assert.equal(textures.length,f.id==='dragon-ball-goku'?1:2,'only active dedicated textures for the selected fighter load');assert.ok(info.peak<=72);
    if(classic){
      assert.equal(info.atlasFrames[k.kind],undefined);assert.ok(!textures.includes('brawl-skill-kamehameha'));
      assert.ok(info.chargeFrames.includes(assets.elementalFx.frames['gold-aura'])&&info.chargeFrames.includes(assets.elementalFx.frames['ki-head']),'original aura and charge orb: '+JSON.stringify(info.chargeFrames));
      assert.equal(info.beamWidth,150);assert.ok(info.beamHeads.some(s=>Math.abs(s.x-(info.playerX+face*(k.range-12)))<1&&s.flipX===(face<0)),'original beam head position and direction');
    }else{
      assert.ok(info.atlasFrames[k.kind]?.length>=2,JSON.stringify({skill:k.kind,info}));
      const mirrored=await page.evaluate(kind=>window.__petGame.scene.getScene('Brawl').elemental.sprites.filter(s=>s.visible&&s.texture.key==='brawl-skill-'+kind).map(s=>s.flipX),k.kind);
      if(face<0&&['beam','flamethrower','stretch','rasengan'].includes(k.mechanic))assert.ok(mirrored.includes(true),k.kind+': correct mirror');
    }
    if(k.kind==='flame-breath')assert.ok(info.flameLength>290);if(k.kind==='rasengan'||k.mechanic==='scan'||k.mechanic==='buff')assert.ok(info.peak>=1);
    await page.screenshot({path:path.join(out,f.id+`-skill${n+1}${face<0?'-left':''}.png`)});coverage.push({fighter:f.id,skill:k.kind,face,...info});
  }
  console.log('✓ All 55 active dedicated skill textures animate; thick Kamehameha keeps its mirrored beam head; the public roster and owned API open all 28 fighters');
  // Exercise every declared pose against the live renderer, at actual simulation times.
  for(const face of [1,-1])for(const f of ALL_FIGHTERS.filter(f=>f.id!=='pikachu'))for(const [n,k] of f.skills.entries()){
    const clip=assets.fighters[f.id].clips['skill'+(n+1)];assert.equal(clip.count,8);assert.equal(clip.emitters.length,8);
    await reset(f,n,true,face);await page.evaluate(n=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[1].y=scene.runtime.state.actors[0].y-10000;scene.runtime.step(n?256:128);scene.draw(0);scene.__castTick=scene.runtime.state.tick-scene.runtime.state.actors[0].actionTick;scene.__playedCast=[Number(scene.views.get(1).sprite.frame.name)-scene.runtime.assets.fighters[scene.runtime.state.fighterId].clips['skill'+(n+1)].start];},n);
    const duration=k.mechanic==='flight'?k.life+Number(k.windup||12):await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].actionDuration);
    const release=k.kind==='blink'?6:k.kind==='flurry'?16:k.mechanic==='sky-shot'?Number(k.windup||12)+Math.floor((duration-Number(k.windup||12)-8)*.45):Number(k.windup||12);
    const targets=face>0?[1,Math.max(2,Math.floor(release*.65)),release+2,duration-2]:[release+2,duration-2];
    for(const [phase,target] of targets.entries()){
      const snap=await page.evaluate(({target,start,flight})=>{
        const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state,a=s.actors[0];let safety=0;
        while((flight?s.tick-scene.__castTick:a.actionTick)<target&&safety++<300){scene.runtime.step(0);scene.draw(16);const v=scene.views.get(a.id).sprite;if(a.action.startsWith('skill')||a.flightUntil>s.tick)scene.__playedCast.push(Number(v.frame.name)-start);}
        scene.draw(0);const v=scene.views.get(a.id).sprite;
        return {action:a.action,tick:a.actionTick,pose:Number(v.frame.name)-start,texture:v.texture.key,width:v.displayWidth,height:v.displayHeight,angle:v.angle,flip:v.flipX,footY:v.y,expectedFoot:a.y/100-(a.flightUntil>s.tick?Math.min(a.z/100,a.y/100-300)*(q=>q*q*(3-2*q))(Math.max(0,Math.min(1,(s.tick-(a.flightUntil-240))/8))):a.z/100),played:[...new Set(scene.__playedCast)],emitter:scene.elemental.stats.emitters};
      },{target,start:clip.start,flight:k.mechanic==='flight'});
      assert.ok(snap.action.startsWith('skill')||k.mechanic==='flight',JSON.stringify({fighter:f.id,skill:k.kind,target,snap}));assert.equal(snap.texture,'brawl-'+f.id+'-'+clip.page);assert.equal(snap.width,clip.displaySize||180);assert.equal(snap.height,clip.displaySize||180);assert.equal(snap.angle,0);assert.equal(snap.flip,face<0);assert.ok(Math.abs(snap.footY-snap.expectedFoot)<.1);
      if(phase===targets.length-1)assert.deepEqual(snap.played.sort((a,b)=>a-b),[0,1,2,3,4,5,6,7],f.id+': all casting poses play');
      if(face>0||phase===0)await page.screenshot({path:path.join(out,'cast-'+f.id+'-skill'+(n+1)+'-'+(face>0?'right':'left')+'-'+phase+'.png')});
      casts.push({fighter:f.id,skill:k.kind,face,phase,...snap});
    }
  }
  console.log('✓ All 54 skills of the 27 redrawn characters play eight poses in both directions, at fixed scale and foot anchor');
  // Remote movement is interpolated; held effects must follow the rendered hand.
  const naruto=ALL_FIGHTERS.find(f=>f.id==='naruto-uzumaki');await reset(naruto,1,true);
  const remoteAnchor=await page.evaluate(wind=>{
    const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state,a=s.actors[0];s.actors[1].y=a.y-10000;scene.runtime.step(256);
    for(let n=0;n<wind+6;n++){scene.runtime.step(0);scene.draw(16);}s.mode='pvp';const v=scene.views.get(a.id);v.x-=40;v.y+=10;scene.draw(16);
    const emitter=scene.elemental.stats.emitters.rasengan,point=scene.runtime.assets.fighters[a.kind].clips.skill2.emitters[emitter.index];
    const orb=scene.elemental.sprites.find(i=>i.visible&&i.texture.key==='brawl-skill-rasengan');
    return {offset:v.x-a.x/100,emitter,orb:{x:orb.x,y:orb.y},expected:{x:v.x+a.facing*point.x,y:v.y-v.z+point.y}};
  },Number(naruto.skills[1].windup));
  assert.ok(Math.abs(remoteAnchor.offset)>10);assert.ok(Math.hypot(remoteAnchor.orb.x-remoteAnchor.expected.x,remoteAnchor.orb.y-remoteAnchor.expected.y)<.1);await page.screenshot({path:path.join(out,'pvp-hand-anchor.png')});
  console.log('✓ Held Rasengan follows the interpolated character hand during remote movement');
  const goku=ALL_FIGHTERS.find(f=>f.id==='dragon-ball-goku'),poseClip=assets.fighters[goku.id].clips.skill1;
  assert.equal(poseClip.count,8);assert.equal(poseClip.page,1);assert.equal(poseClip.emitters.length,8);
  for(const face of [1,-1]){
    await reset(goku,0,true,face);await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[1].y=scene.runtime.state.actors[0].y-10000;scene.runtime.step(128);});const played=new Set();
    for(const target of [3,10,18,27,32,34,38,43,49,56,70,84,96,99,101,105,107]){
      const snap=await page.evaluate(({target,face,emitters})=>{
        const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state,p=s.actors[0];let safety=0;
        while(p.action==='skill1'&&p.actionTick<target&&safety++<250){scene.runtime.step(0);scene.draw(16);}
        scene.draw(0);const view=scene.views.get(p.id).sprite,pose=Number(view.frame.name),emitter=emitters[pose],rect=scene.game.canvas.getBoundingClientRect(),width=scene.game.scale.gameSize.width,height=scene.game.scale.gameSize.height;
        const start=emitter?p.x/100+face*emitter.x:0,y=emitter?p.y/100-p.z/100+emitter.y:0,end=p.x/100+face*(760-12);
        return {target,face,action:p.action,tick:p.actionTick,texture:view.texture.key,pose,flip:view.flipX,angle:view.angle,footY:view.y,width:view.displayWidth,height:view.displayHeight,
          headCount:scene.elemental.sprites.filter(i=>i.visible&&i.texture.key==='brawl-elemental'&&Number(i.frame.name)===6).length,
          samples:[.28,.38,.48,.58,.68,.78].map(q=>({x:Math.round(rect.left+(start+(end-start)*q-scene.cameras.main.scrollX)*rect.width/width),y:Math.round(rect.top+y*rect.height/height)}))};
      },{target,face,emitters:poseClip.emitters});
      if(snap.action==='skill1'){played.add(snap.pose);assert.ok(snap.texture.endsWith('-1'));assert.equal(snap.angle,0);assert.equal(snap.flip,face<0);assert.equal(snap.width,180);assert.equal(snap.height,180);}
      const file=path.join(out,`goku-cast-${face>0?'right':'left'}-${String(target).padStart(3,'0')}.png`),screen=await page.screenshot({path:file});
      if([43,56,70,84].includes(target)){
        assert.equal(snap.headCount,1,'one beam head and no repeated tiles');
        const {data,info}=await sharp(screen).removeAlpha().raw().toBuffer({resolveWithObject:true});
        snap.coreColors=snap.samples.map(({x,y})=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)]);
        assert.ok(snap.coreColors.every(c=>c.length===3&&c[0]>210&&c[1]>240&&c[2]>240),'continuous white core: '+JSON.stringify(snap));
      }
      animation.push(snap);
    }
    assert.deepEqual([...played].sort(),[0,1,2,3,4,5,6,7],'anticipation, charge, release, hold and recovery all play');
  }
  await page.evaluate(()=>localStorage.setItem('pet-reduced-motion','1'));await reset(goku,0,true);
  const reduced=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.step(128);for(let n=0;n<55;n++){scene.runtime.step(0);scene.draw(16);}return {enabled:scene.reduced&&scene.elemental.reduced,beamWidth:scene.elemental.stats.beamWidth};});
  assert.equal(reduced.enabled,true);assert.equal(reduced.beamWidth,150);await page.screenshot({path:path.join(out,'goku-reduced-motion.png')});await page.evaluate(()=>localStorage.removeItem('pet-reduced-motion'));
  console.log('✓ Eight planted character poses in both directions, 34 timeline screenshots, an uninterrupted white core at four sustained moments and reduced-motion rendering');
  for(const [id,n] of [['spark-hamster',0],['snowfeather-penguin',0],['thunderhorn-goat',1],['coral-seal',0],['dragon-ball-goku',0],['naruto-uzumaki',1]]){
    const f=ALL_FIGHTERS.find(f=>f.id===id);await reset(f,n,false);
    await page.evaluate(duration=>{window.__fxFrameTimes=[];const end=performance.now()+duration;function frame(t){window.__fxFrameTimes.push(t);if(t<end)requestAnimationFrame(frame);}requestAnimationFrame(frame);},id==='dragon-ball-goku'?2100:1400);
    if(id==='dragon-ball-goku'){await page.locator('[data-battle-key="128"]').tap();await page.waitForTimeout(2200);}else{await page.keyboard.down(n?'KeyI':'KeyU');await page.waitForTimeout(85);await page.keyboard.up(n?'KeyI':'KeyU');await page.waitForTimeout(1350);}
    const measured=await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl'),times=window.__fxFrameTimes;return {fps:(times.length-1)*1000/(times.at(-1)-times[0]),ticks:scene.runtime.state.tick,casts:scene.feedback.casts,hits:scene.feedback.hits,peak:scene.elemental.stats.peak};});
    assert.ok(measured.ticks>=45&&measured.casts>0&&measured.fps>=25,JSON.stringify({id,...measured}));performance.push({id,...measured});
  }
  console.log('✓ Real keyboard and touch casts at normal simulation speed; all six heavy effects maintain at least 25fps in Chrome touch emulation');
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');window.__disposedVfx=scene.elemental;scene.scene.stop();});await page.waitForFunction(()=>window.__disposedVfx.sprites.length===0);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);assert.equal(JSON.parse(await fs.readFile(dbFile,'utf8')).petWallets[0].balance,2500);
  const picks=['spark-hamster-skill1','snowfeather-penguin-skill1','dragon-ball-goku-skill1','naruto-uzumaki-skill2'];
  const panels=await Promise.all(picks.map(async (name,n)=>({input:await sharp(path.join(out,name+'.png')).resize(768,576).toBuffer(),left:n%2*768,top:Math.floor(n/2)*576})));
  await sharp({create:{width:1536,height:1152,channels:4,background:'#142337'}}).composite(panels).png().toFile(path.join(out,'showcase.png'));
  for(const name of ['reset-failure.json','reset-failure.png','failure.txt'])await fs.rm(path.join(out,name),{force:true});
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,coverage,casts,remoteAnchor,animation,performance,errors,failed,publicFighters:FIGHTERS.length},null,2));
  await context.close();context=undefined;await page.video().saveAs(path.join(out,'elemental-showcase.webm'));
  console.log('✓ Clean scene disposal, no page/asset failures, unchanged wallet and captured screenshots/video');
}catch(error){await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}finally{await context?.close();await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));assert.ok(path.resolve(temp).startsWith(path.join(os.tmpdir(),'buio-elemental-browser-')));await fs.rm(temp,{recursive:true,force:true});}
