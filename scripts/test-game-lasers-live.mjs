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

try {
  await page.goto(`${base}/game/preview?preview=1&infiniteEnergy=1&altitude=752`,{waitUntil:'networkidle'});
  await page.waitForSelector('#gameScreen.active canvas',{timeout:10000});
  const manifest=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return scene.hazardBodies.map(item=>({id:item.hazard.id,altitude:item.hazard.altitude,cycleMs:item.hazard.cycleMs,activeMs:item.hazard.activeMs}));
  });
  if(manifest.length!==5)throw new Error(`expected 5 live laser gates, got ${manifest.length}`);
  if(manifest.some(item=>item.altitude<=700||item.cycleMs!==4000||item.activeMs!==2000))throw new Error(`invalid laser manifest: ${JSON.stringify(manifest)}`);

  // An inactive beam must be invisible and completely non-colliding.
  await page.waitForFunction(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return scene.hazardBodies[0]?.active===false;
  },null,{timeout:5000});
  const safePose=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const item=scene.hazardBodies[0];
    scene.invulnerableUntil=0;
    scene.rapidFallTracker.reset(scene.time.now,750);
    scene.clearContacts();scene.setPlayerPosition(item.hazard.x,item.hazard.y);scene.setPlayerVelocity(0,0);
    return {x:item.hazard.x,y:item.hazard.y,visible:item.beam.visible,mask:item.body.collisionFilter.mask};
  });
  await page.waitForTimeout(120);
  const afterSafe=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return {x:scene.player.x,y:scene.player.y};
  });
  if(safePose.visible||safePose.mask!==0)throw new Error(`open laser still renders/collides: ${JSON.stringify(safePose)}`);
  if(Math.abs(afterSafe.x-safePose.x)>30||Math.abs(afterSafe.y-safePose.y)>60)throw new Error(`open passage reset the player: ${JSON.stringify({safePose,afterSafe})}`);

  // Touching the active beam must use the already-unlocked nearest checkpoint.
  await page.waitForFunction(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return scene.hazardBodies[0]?.active===true;
  },null,{timeout:5000});
  await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const item=scene.hazardBodies[0];
    scene.invulnerableUntil=scene.time.now+500;
    scene.clearContacts();scene.setPlayerPosition(item.hazard.x-120,item.hazard.y+80);scene.setPlayerVelocity(0,0);
    scene.cameras.main.stopFollow();scene.cameras.main.centerOn(item.hazard.x,item.hazard.y);
  });
  await page.waitForTimeout(80);
  const screenshot=join(tmpdir(),'buio-timed-laser-gate.png');
  await page.screenshot({path:screenshot});
  const checkpoint=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const cp=scene.course.checkpoints.find(item=>item.altitude===704);
    scene.unlockCheckpoint(cp);scene.invulnerableUntil=0;
    const item=scene.hazardBodies[0];
    scene.clearContacts();scene.setPlayerPosition(item.hazard.x,item.hazard.y);scene.setPlayerVelocity(0,0);
    return {x:cp.x,y:cp.y-20,visible:item.beam.visible,mask:item.body.collisionFilter.mask};
  });
  await page.waitForFunction(({x,y})=>{
    const scene=window.__game.scene.getScene('GameScene');
    return Math.abs(scene.player.x-x)<35&&Math.abs(scene.player.y-y)<70;
  },checkpoint,{timeout:2500});
  if(!checkpoint.visible||checkpoint.mask===0)throw new Error(`active laser is not visible/colliding: ${JSON.stringify(checkpoint)}`);

  if(errors.length)throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({manifest,safePassage:true,activeHitResetTo:704,screenshot},null,2));
} finally {
  await browser.close();
}
