import { chromium } from 'playwright';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const installedBrowsers=[
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);
const executablePath=installedBrowsers.find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1280,height:720}});
context.on('page',page=>page.on('dialog',dialog=>void dialog.dismiss().catch(()=>{})));
const host=await context.newPage();
let roomCode=null;

try {
  await host.goto(`${base}/game/preview`);
  roomCode=await host.evaluate(()=>new Promise((resolve,reject)=>{
    const socket=window.__qaHost=window.io('/game');
    socket.on('connect',()=>socket.emit('host:create',{setId:'demo',durationSec:480,hostName:'LatencyQA'},response=>{
      if (response?.ok) resolve(response.code);
      else reject(new Error(response?.message||'host create failed'));
    }));
  }));

  const driver=await context.newPage();
  const viewer=await context.newPage();
  await Promise.all([driver.goto(`${base}/game/preview`),viewer.goto(`${base}/game/preview`)]);
  await Promise.all([driver.waitForSelector('.room-row',{timeout:7000}),viewer.waitForSelector('.room-row',{timeout:7000})]);
  await Promise.all([driver.locator('.room-row').first().click(),viewer.locator('.room-row').first().click()]);
  await Promise.all([driver.waitForSelector('#lobbyScreen.active'),viewer.waitForSelector('#lobbyScreen.active')]);
  const started=await host.evaluate(()=>new Promise(resolve=>window.__qaHost.emit('host:start',resolve)));
  if (!started?.ok) throw new Error('host start failed');
  await Promise.all([
    driver.waitForSelector('#gameScreen.active canvas',{timeout:10000}),
    viewer.waitForSelector('#gameScreen.active canvas',{timeout:10000})
  ]);
  await driver.waitForTimeout(1800);

  await driver.keyboard.down('ArrowRight');
  const samples=[];
  for (let index=0;index<32;index++) {
    await driver.waitForTimeout(25);
    const [local,remote]=await Promise.all([
      driver.evaluate(()=>{const scene=window.__game.scene.getScene('GameScene');return{x:scene.player.x,vx:scene.playerBody.velocity.x};}),
      viewer.evaluate(()=>{const scene=window.__game.scene.getScene('GameScene');const ghost=[...scene.ghosts.values()][0];return ghost?{x:ghost.sprite.x,count:scene.ghosts.size}:null;})
    ]);
    samples.push({
      timeMs:(index+1)*25,driverX:local.x,driverVx:local.vx,
      ghostX:remote?.x??null,lagPx:remote?Math.abs(local.x-remote.x):null
    });
  }
  await driver.keyboard.up('ArrowRight');
  await driver.waitForTimeout(180);

  const [localGround,remoteGround]=await Promise.all([
    driver.evaluate(()=>window.__game.scene.getScene('GameScene').player.y),
    viewer.evaluate(()=>[...window.__game.scene.getScene('GameScene').ghosts.values()][0]?.sprite.y)
  ]);
  await driver.keyboard.down('Space');
  await driver.waitForTimeout(35);
  await driver.keyboard.up('Space');
  const jumpSamples=[];
  for(let index=0;index<80;index++) {
    await driver.waitForTimeout(20);
    const [localY,remote]=await Promise.all([
      driver.evaluate(()=>window.__game.scene.getScene('GameScene').player.y),
      viewer.evaluate(()=>{const ghost=[...window.__game.scene.getScene('GameScene').ghosts.values()][0];return ghost?{y:ghost.sprite.y,animation:ghost.state.animation}:null;})
    ]);
    jumpSamples.push({timeMs:(index+1)*20,localY,ghostY:remote?.y??null,animation:remote?.animation??null});
  }

  const screenshot=join(tmpdir(),'buio-network-shadow.png');
  await viewer.screenshot({path:screenshot});
  const loadReport=await host.evaluate(code=>new Promise(async(resolve,reject)=>{
    const sockets=[];
    try {
      await Promise.all(Array.from({length:18},(_,index)=>new Promise((joined,failed)=>{
        const socket=window.io('/game',{forceNew:true,reconnection:false});
        sockets.push(socket);
        socket.on('connect',()=>socket.emit('player:join',{code,name:`LoadQA-${index+1}`,studentId:`network-load-${index+1}`},response=>{
          if(response?.ok) joined(); else failed(new Error(response?.message||'load player join failed'));
        }));
        socket.on('connect_error',failed);
      })));
      const packetTimes=[];
      let playersSeen=0;
      sockets[0].on('game:positions',list=>{
        packetTimes.push(performance.now());
        playersSeen=Math.max(playersSeen,list.length);
      });
      let tick=0;
      const sender=setInterval(()=>{
        tick++;
        sockets.forEach((socket,index)=>socket.volatile.emit('player:state',{
          x:400+index*12+(tick%120),y:5652,velocityX:5,velocityY:0,
          energy:100,progress:0,altitude:0,animation:'run',facing:1
        }));
      },16);
      setTimeout(()=>{
        clearInterval(sender);
        const intervals=packetTimes.slice(1).map((time,index)=>time-packetTimes[index]).sort((a,b)=>a-b);
        const result={
          playersSeen,
          packets:packetTimes.length,
          averageIntervalMs:intervals.length?intervals.reduce((sum,value)=>sum+value,0)/intervals.length:Infinity,
          p95IntervalMs:intervals.length?intervals[Math.floor(intervals.length*.95)]:Infinity
        };
        sockets.forEach(socket=>socket.disconnect());
        resolve(result);
      },1200);
    } catch(error) {
      sockets.forEach(socket=>socket.disconnect());
      reject(error);
    }
  }),roomCode);
  const steady=samples.filter(sample=>sample.timeMs>=250&&sample.ghostX!==null);
  const average=steady.reduce((sum,sample)=>sum+sample.lagPx,0)/steady.length;
  const maximum=Math.max(...steady.map(sample=>sample.lagPx));
  const movementPairs=steady.slice(1).map((sample,index)=>({
    driverStep:Math.abs(sample.driverX-steady[index].driverX),
    ghostStep:Math.abs(sample.ghostX-steady[index].ghostX)
  })).filter(pair=>pair.driverStep>.5);
  const stalledSteps=movementPairs.filter(pair=>pair.ghostStep<.15).length;
  const firstLocalJump=jumpSamples.find(sample=>sample.localY<localGround-4)?.timeMs??Infinity;
  const firstGhostJump=jumpSamples.find(sample=>sample.ghostY<remoteGround-4)?.timeMs??Infinity;
  const jumpReactionMs=firstGhostJump-firstLocalJump;
  const minimumGhostY=Math.min(...jumpSamples.map(sample=>sample.ghostY??Infinity));
  const maximumGhostY=Math.max(...jumpSamples.map(sample=>sample.ghostY??-Infinity));
  const report={
    roomCode,samples,
    steadyAverageLagPx:Number(average.toFixed(1)),
    steadyMaximumLagPx:Number(maximum.toFixed(1)),
    estimatedAverageLagMs:Number((average/(5.6*60)*1000).toFixed(0)),
    stalledMovementSamples:`${stalledSteps}/${movementPairs.length}`,
    jumpReactionMs,
    localGroundY:Number(localGround.toFixed(1)),
    remoteGroundY:Number(remoteGround.toFixed(1)),
    minimumGhostY:Number(minimumGhostY.toFixed(1)),
    maximumGhostY:Number(maximumGhostY.toFixed(1)),
    twentyPlayerLoad:{
      ...loadReport,
      averageIntervalMs:Number(loadReport.averageIntervalMs.toFixed(1)),
      p95IntervalMs:Number(loadReport.p95IntervalMs.toFixed(1))
    },
    screenshot
  };
  console.log(JSON.stringify(report,null,2));
  if (!steady.length||average>12||maximum>35) throw new Error(`remote ghost latency exceeds budget: average=${average.toFixed(1)}px max=${maximum.toFixed(1)}px`);
  if (stalledSteps>movementPairs.length*.25) throw new Error(`remote walking visibly stalls on ${stalledSteps}/${movementPairs.length} moving samples`);
  if (!Number.isFinite(jumpReactionMs)||jumpReactionMs>50) throw new Error(`remote jump reaction is too slow: ${jumpReactionMs}ms`);
  if (minimumGhostY>remoteGround-45) throw new Error('remote ghost did not visibly jump');
  if (maximumGhostY>remoteGround+3) throw new Error(`remote ghost rendered below ground by ${(maximumGhostY-remoteGround).toFixed(1)}px`);
  if (loadReport.playersSeen<20) throw new Error(`20-player room only broadcast ${loadReport.playersSeen} players`);
  if (loadReport.packets<40||loadReport.averageIntervalMs>30||loadReport.p95IntervalMs>45) {
    throw new Error(`20-player broadcast cadence is too slow: ${JSON.stringify(loadReport)}`);
  }
} finally {
  if (roomCode) await host.evaluate(()=>window.__qaHost?.emit('host:close')).catch(()=>{});
  await browser.close();
}
