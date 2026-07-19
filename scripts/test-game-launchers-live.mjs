import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const executablePath=[
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
  if(response.status()<400)return;
  const url=new URL(response.url());
  if((url.pathname==='/api/auth/me'&&response.status()===401)||url.pathname==='/favicon.ico')return;
  errors.push(`${response.status()} ${url.pathname}`);
});

try {
  await page.goto(`${base}/game/preview?preview=1&infiniteEnergy=1`,{waitUntil:'networkidle'});
  await page.waitForSelector('#gameScreen.active canvas',{timeout:10000});
  const crossings=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const nodes=new Map(scene.course.nodes.map(node=>[node.id,node]));
    const objects=new Map(scene.course.objects.map(object=>[object.id,object]));
    return scene.course.routes.main.map(edge=>{
      if(edge.type!=='launcher')return null;
      const from=nodes.get(edge.from),to=nodes.get(edge.to);
      const launcher=objects.get(from.objectId);
      return {fromAltitude:from.altitude,toAltitude:to.altitude,fromX:from.x,fromY:from.y,toX:to.x,toY:to.y,power:launcher.behavior.power,hasAirSpeed:'airSpeed' in launcher.behavior,direction:Math.sign(to.x-from.x)};
    }).filter(Boolean);
  });
  if(crossings.length!==6)throw new Error(`expected 6 launcher crossings, got ${crossings.length}`);
  if(crossings.some(item=>item.power!==20||item.hasAirSpeed))throw new Error(`launchers must use power 20 without faster air control: ${JSON.stringify(crossings)}`);
  const selectedCrossings=process.env.LAUNCHER_ALTITUDE
    ? crossings.filter(item=>item.fromAltitude===Number(process.env.LAUNCHER_ALTITUDE))
    : crossings;

  const results=[];
  for(const crossing of selectedCrossings){
    if(results.length){
      await page.reload({waitUntil:'networkidle'});
      await page.waitForSelector('#gameScreen.active canvas',{timeout:10000});
    }
    let landed=false,last=null,usedHoldMs=null,minY=Infinity;
    const trace=[],attempts=[];
    // A human may correct the timing after one miss. Try a few ordinary
    // counter-steer timings through the same action map as keyboard and touch.
    const holdOptions=process.env.LAUNCHER_HOLD?[Number(process.env.LAUNCHER_HOLD)]:[300,450,600,750,900,1050,1200,1400];
    for(const holdMs of holdOptions){
      await page.evaluate(({fromX,fromY,fromAltitude})=>{
        const scene=window.__game.scene.getScene('GameScene');
        scene.setAction('left',false);scene.setAction('right',false);scene.clearContacts();
        scene.launcherBoostUntil=0;
        scene.invulnerableUntil=scene.time.now+500;
        scene.rapidFallTracker.reset(scene.time.now,fromAltitude);
        scene.setPlayerPosition(fromX,fromY-125);
        scene.setPlayerVelocity(0,5);
      },crossing);
      try {
        await page.waitForFunction(()=>{
          const scene=window.__game.scene.getScene('GameScene');
          return scene.launcherBoostUntil>scene.time.now;
        },null,{timeout:3500});
      } catch (error) {
        throw new Error(`${crossing.fromAltitude}m launcher did not trigger: ${error.message}`);
      }
      const launchedAt=Date.now();
      let held=null,closest=null;
      while(Date.now()-launchedAt<3600){
        last=await page.evaluate(()=>{
          const scene=window.__game.scene.getScene('GameScene');
          return {x:scene.player.x,y:scene.player.y,vx:scene.playerBody.velocity.x,vy:scene.playerBody.velocity.y,grounded:scene.grounded,finished:scene.finished,boostMs:scene.launcherBoostUntil-scene.time.now,left:scene.actions.left,right:scene.actions.right};
        });
        if(process.env.DEBUG_LAUNCHER&&trace.length<80)trace.push({t:Date.now()-launchedAt,...last});
        minY=Math.min(minY,last.y);
        if(last.vy>0&&Math.abs(last.y-crossing.toY)<150&&(!closest||Math.abs(last.x-crossing.toX)<Math.abs(closest.x-crossing.toX))) closest={x:last.x,y:last.y,vy:last.vy};
        const desired=Date.now()-launchedAt<holdMs?(crossing.direction>0?'right':'left'):null;
        if(desired!==held){
          await page.evaluate(({previous,next})=>{
            const scene=window.__game.scene.getScene('GameScene');
            if(previous)scene.setAction(previous,false);
            if(next)scene.setAction(next,true);
          },{previous:held,next:desired});
          held=desired;
        }
        if(Date.now()-launchedAt>500&&((last.grounded&&Math.abs(last.x-crossing.toX)<75)||(crossing.toAltitude===1500&&last.finished))){landed=true;usedHoldMs=holdMs;break;}
        if(Date.now()-launchedAt>900&&last.y>Math.max(crossing.fromY,crossing.toY)+320)break;
        await page.waitForTimeout(20);
      }
      if(held)await page.evaluate(action=>window.__game.scene.getScene('GameScene').setAction(action,false),held);
      attempts.push({holdMs,closest});
      if(landed)break;
    }
    results.push({from:crossing.fromAltitude,to:crossing.toAltitude,power:crossing.power,normalAirControl:!crossing.hasAirSpeed,landed,holdMs:usedHoldMs,x:Number(last?.x.toFixed(1)),targetX:Number(crossing.toX.toFixed(1)),apexY:Number(minY.toFixed(1))});
    if(!landed)throw new Error(`${crossing.fromAltitude}m launcher did not land on ${crossing.toAltitude}m target: ${JSON.stringify(last)} attempts=${JSON.stringify(attempts)} trace=${JSON.stringify(trace)}`);
  }

  // Leave the camera on a launcher so the captured frame also verifies that
  // the directional arrow is visibly above it and points toward the landing.
  const sample=crossings[5];
  await page.evaluate(({fromX,fromY})=>window.__game.scene.getScene('GameScene').setPlayerPosition(fromX,fromY-55),sample);
  await page.waitForTimeout(500);
  const screenshot=join(tmpdir(),'buio-six-launcher-arrows.png');
  await page.screenshot({path:screenshot});
  if(errors.length)throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({results,screenshot},null,2));
} finally {
  await browser.close();
}
