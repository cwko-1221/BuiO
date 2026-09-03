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
  const before=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const target=scene.course.checkpoints[1];
    const sensor=scene.course.sensors.slice().sort((a,b)=>Math.abs(a.altitude-target.altitude)-Math.abs(b.altitude-target.altitude))[0];
    scene.reachProgress(sensor);
    scene.progress=1;
    scene.rapidFallTracker.reset(scene.time.now,target.altitude);
    scene.clearContacts();
    scene.setPlayerPosition(target.x+360,target.y-50);
    scene.setPlayerVelocity(0,0);
    const body=scene.checkpointBodies[1];
    return {
      targetId:target.id,
      checkpointId:scene.checkpoint.id,
      triggerWidth:body.bounds.max.x-body.bounds.min.x,
      triggerHeight:body.bounds.max.y-body.bounds.min.y
    };
  });
  await page.waitForTimeout(350);
  const bypass=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return {checkpointId:scene.checkpoint.id,progress:scene.progress};
  });
  if(before.checkpointId!=='checkpoint-0'||bypass.checkpointId!=='checkpoint-0'){
    throw new Error(`altitude/progress bypass unlocked ${bypass.checkpointId}`);
  }
  if(before.triggerWidth>65||before.triggerHeight>91){
    throw new Error(`flag sensor exceeds painted flag: ${before.triggerWidth}x${before.triggerHeight}`);
  }

  const touchedFlags=[];
  for(let index=1;index<8;index++){
    const targetId=await page.evaluate(index=>{
      const scene=window.__game.scene.getScene('GameScene');
      const target=scene.course.checkpoints[index];
      scene.rapidFallTracker.reset(scene.time.now,target.altitude);
      scene.clearContacts();
      scene.setPlayerPosition(target.x+20*(target.flagSide===-1?-1:1),target.y-43);
      scene.setPlayerVelocity(0,0);
      return target.id;
    },index);
    await page.waitForFunction(targetId=>window.__game.scene.getScene('GameScene').checkpoint.id===targetId,targetId,{timeout:2000});
    touchedFlags.push(targetId);
  }
  const touched=await page.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    const target=scene.checkpoint;
    scene.resetToCheckpoint('manual');
    return {
      checkpointId:scene.checkpoint.id,
      x:scene.playerBody.position.x,y:scene.playerBody.position.y,
      expectedX:target.x,expectedY:target.y-20
    };
  });
  if(touched.checkpointId!==touchedFlags.at(-1)||Math.abs(touched.x-touched.expectedX)>1||Math.abs(touched.y-touched.expectedY)>1){
    throw new Error(`touch/reset mismatch: ${JSON.stringify(touched)}`);
  }
  await page.waitForTimeout(350);
  const screenshot=join(tmpdir(),'buio-flag-contact-checkpoint.png');
  await page.screenshot({path:screenshot});
  if(errors.length)throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({bypass,touchedFlags,touched,sensor:{w:before.triggerWidth,h:before.triggerHeight},screenshot},null,2));
} finally {
  await browser.close();
}
