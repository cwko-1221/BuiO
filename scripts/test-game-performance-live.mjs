import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const output=resolve('artifacts/game-performance-20261005');
mkdirSync(output,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const reports=[];
try {
  for(const [name,width,height,touch] of [['desktop',1440,900,false],['ipad',1180,820,true],['ipad-portrait',820,1180,true]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/game/preview?preview&infiniteEnergy=1&altitude=0`);
    await page.waitForFunction(()=>window.__game?.scene.getScene('GameScene')?.player?.anims.currentAnim);
    await page.waitForTimeout(450);
    await page.screenshot({path:resolve(output,`${name}-start.png`)});
    const cdp=await context.newCDPSession(page);
    const initial=await page.evaluate(()=>{const s=window.__game.scene.getScene('GameScene');return{x:s.player.x,y:s.player.y};});
    if(touch) {
      const right=await page.locator('#btnRight').boundingBox(),jump=await page.locator('#btnJump').boundingBox();
      const r={id:1,x:right.x+right.width/2,y:right.y+right.height/2};
      const j={id:2,x:jump.x+jump.width/2,y:jump.y+jump.height/2};
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r]});
      await page.waitForTimeout(180);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r,j]});
      await page.waitForTimeout(120);
      const input=await page.evaluate(()=>{const s=window.__game.scene.getScene('GameScene');return{right:s.actions.right,vx:s.playerBody.velocity.x,vy:s.playerBody.velocity.y};});
      assert.ok(input.right&&input.vx>1&&input.vy<0,'direction and jump work together with two fingers');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    } else {
      await page.keyboard.down('ArrowRight');
      await page.keyboard.down('Space');
      await page.waitForTimeout(180);
      await page.keyboard.up('Space');
      await page.keyboard.up('ArrowRight');
    }
    const moved=await page.evaluate(()=>{const s=window.__game.scene.getScene('GameScene');return{x:s.player.x,y:s.player.y};});
    assert.ok(moved.x>initial.x+10&&moved.y<initial.y-5,'the local climber still moves and jumps');
    await page.goto(`${base}/game/preview?preview&infiniteEnergy=1&altitude=500`);
    await page.waitForFunction(()=>window.__game?.scene.getScene('GameScene')?.player?.anims.currentAnim);
    await page.waitForTimeout(500);
    await page.screenshot({path:resolve(output,`${name}-500m.png`)});
    const framing=await page.evaluate(()=>{
      const s=window.__game.scene.getScene('GameScene'),camera=s.cameras.main,v=camera.worldView;
      const visible=entry=>entry.bounds.x<=v.x+v.width&&entry.bounds.x+entry.bounds.width>=v.x
        &&entry.bounds.y<=v.y+v.height&&entry.bounds.y+entry.bounds.height>=v.y;
      return {ghostsPresent:!!s.ghosts,children:s.children.length,rendered:camera.renderList.length,
        culled:s.renderWindow.entries.filter(e=>e.object.cameraFilter&camera.id).length,
        incorrectlyCulled:s.renderWindow.entries.filter(e=>visible(e)&&(e.object.cameraFilter&camera.id)).length,
        missingArt:s.objectSprites.filter(o=>o.texture.key==='__MISSING').length};
    });
    assert.equal(framing.ghostsPresent,false);
    assert.equal(framing.incorrectlyCulled,0,'no object within the camera is culled');
    assert.equal(framing.missingArt,0);
    assert.ok(framing.rendered<framing.children/2,'the renderer no longer submits the entire course');
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const metrics=await page.evaluate(async()=>{
      const s=window.__game.scene.getScene('GameScene'),game=window.__game;
      const samples={frames:[],render:[],update:[],physics:[]};
      const wrap=(object,key,values)=>{
        const original=object[key];
        object[key]=function(...args){const start=performance.now();const result=original.apply(this,args);values.push(performance.now()-start);return result;};
        return()=>object[key]=original;
      };
      const restore=[wrap(game.renderer,'render',samples.render),wrap(s.sys,'sceneUpdate',samples.update)];
      await new Promise(resolve=>{let last=0;function sample(now){if(last)samples.frames.push(now-last);last=now;
        samples.physics.push(s.matter.world.engine.timing.lastElapsed);
        if(samples.frames.length<180)requestAnimationFrame(sample);else resolve();}requestAnimationFrame(sample);});
      restore.forEach(fn=>fn());
      return Object.fromEntries(Object.entries(samples).map(([name,values])=>{
        values.sort((a,b)=>a-b);
        return[name,{averageMs:+(values.reduce((sum,v)=>sum+v,0)/values.length).toFixed(2),p95Ms:+values[Math.floor(values.length*.95)].toFixed(2)}];
      }));
    });
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    const sweep=await page.evaluate(async()=>{
      const s=window.__game.scene.getScene('GameScene');
      const bodyCount=()=>Phaser.Physics.Matter.Matter.Composite.allBodies(s.matter.world.localWorld).length;
      const bodies=bodyCount();
      for(const cp of s.course.checkpoints) {
        s.clearContacts();s.setPlayerPosition(cp.x,cp.y-20);
        s.rapidFallTracker.reset(s.time.now,cp.altitude);
        s.cameras.main.centerOn(s.player.x,s.player.y);
        await new Promise(resolve=>setTimeout(resolve,160));
        if(bodyCount()!==bodies)throw new Error('viewport culling changed physics bodies');
        const v=s.cameras.main.worldView;
        for(const entry of s.renderWindow.entries) {
          const b=entry.bounds;
          if(b.x<=v.x+v.width&&b.x+b.width>=v.x&&b.y<=v.y+v.height&&b.y+b.height>=v.y
            &&(entry.object.cameraFilter&s.cameras.main.id))throw new Error(`visible art missing at ${cp.name}`);
        }
      }
      const trap=s.crumbleObjects.values().next().value,startY=trap.body.position.y;
      s.triggerCrumble(trap.obj.id,false);
      await new Promise(resolve=>setTimeout(resolve,300));
      if(trap.state.phase!=='falling'||trap.body.position.y<=startY+1)throw new Error('an offscreen trap did not fall after triggering');
      return{checkpoints:s.course.checkpoints.length,bodies,trapFell:true};
    });
    assert.deepEqual(errors,[],'no browser runtime errors');
    reports.push({name,viewport:{width,height},cpuThrottle:4,...framing,metrics,sweep});
    await context.close();
  }
  writeFileSync(resolve(output,'report.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({output,reports},null,2));
} finally {await browser.close();}
