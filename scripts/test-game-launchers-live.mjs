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
    return scene.course.routes.main.filter(edge=>edge.type==='launcher').map(edge=>{
      const from=nodes.get(edge.from),to=nodes.get(edge.to);
      return {fromAltitude:from.altitude,toAltitude:to.altitude,fromX:from.x,fromY:from.y,toX:to.x,toY:to.y,direction:Math.sign(to.x-from.x)};
    });
  });
  if(crossings.length!==10)throw new Error(`expected 10 launcher crossings, got ${crossings.length}`);
  const selectedCrossings=process.env.LAUNCHER_ALTITUDE
    ? crossings.filter(item=>item.fromAltitude===Number(process.env.LAUNCHER_ALTITUDE))
    : crossings;

  const results=[];
  for(const crossing of selectedCrossings){
    let landed=false,last=null,usedHoldMs=null;
    const trace=[];
    // A human may correct the timing after one miss. Try a few ordinary
    // counter-steer timings through the same action map as keyboard and touch.
    for(const holdMs of [1250,1330,1170,1410]){
      await page.evaluate(({fromX,fromY})=>{
        const scene=window.__game.scene.getScene('GameScene');
        scene.setAction('left',false);scene.setAction('right',false);scene.clearContacts();
        scene.launcherBoostUntil=0;
        scene.setPlayerPosition(fromX,fromY-125);
        scene.setPlayerVelocity(0,5);
      },crossing);
      await page.waitForFunction(()=>{
        const scene=window.__game.scene.getScene('GameScene');
        return scene.launcherBoostUntil>scene.time.now;
      },null,{timeout:3500});
      const launchedAt=Date.now();
      let held=null;
      while(Date.now()-launchedAt<3900){
        last=await page.evaluate(()=>{
          const scene=window.__game.scene.getScene('GameScene');
          return {x:scene.player.x,y:scene.player.y,vx:scene.playerBody.velocity.x,vy:scene.playerBody.velocity.y,grounded:scene.grounded,boostMs:scene.launcherBoostUntil-scene.time.now,left:scene.actions.left,right:scene.actions.right};
        });
        if(process.env.DEBUG_LAUNCHER&&trace.length<80)trace.push({t:Date.now()-launchedAt,...last});
        const desired=Date.now()-launchedAt<holdMs?(crossing.direction>0?'right':'left'):null;
        if(desired!==held){
          await page.evaluate(({previous,next})=>{
            const scene=window.__game.scene.getScene('GameScene');
            if(previous)scene.setAction(previous,false);
            if(next)scene.setAction(next,true);
          },{previous:held,next:desired});
          held=desired;
        }
        if(Date.now()-launchedAt>650&&last.grounded&&Math.abs(last.x-crossing.toX)<75){landed=true;usedHoldMs=holdMs;break;}
        if(Date.now()-launchedAt>900&&last.y>Math.max(crossing.fromY,crossing.toY)+320)break;
        await page.waitForTimeout(20);
      }
      if(held)await page.evaluate(action=>window.__game.scene.getScene('GameScene').setAction(action,false),held);
      if(landed)break;
    }
    results.push({from:crossing.fromAltitude,to:crossing.toAltitude,landed,holdMs:usedHoldMs,x:Number(last?.x.toFixed(1)),targetX:Number(crossing.toX.toFixed(1))});
    if(!landed)throw new Error(`${crossing.fromAltitude}m launcher did not land on ${crossing.toAltitude}m target: ${JSON.stringify(last)} trace=${JSON.stringify(trace)}`);
  }

  // Leave the camera on a launcher so the captured frame also verifies that
  // the directional arrow is visibly above it and points toward the landing.
  const sample=crossings[5];
  await page.evaluate(({fromX,fromY})=>window.__game.scene.getScene('GameScene').setPlayerPosition(fromX,fromY-55),sample);
  await page.waitForTimeout(500);
  const screenshot=join(tmpdir(),'buio-ten-launcher-arrows.png');
  await page.screenshot({path:screenshot});
  if(errors.length)throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({results,screenshot},null,2));
} finally {
  await browser.close();
}
