import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const base=process.env.GAME_BASE_URL||'http://127.0.0.1:3000';
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const context=await browser.newContext({viewport:{width:1180,height:820},hasTouch:true,isMobile:true});
const host=await context.newPage();
let roomCode;
try {
  await host.goto(`${base}/game/preview`);
  roomCode=await host.evaluate(()=>new Promise((resolve,reject)=>{
    const socket=window.__qaHost=window.io('/game');
    socket.on('connect',()=>socket.emit('host:create',{setId:'demo',durationSec:480,hostName:'PerformanceQA',
      settings:{infiniteEnergy:true}},response=>response?.ok?resolve(response.code):reject(new Error('host create failed'))));
  }));
  const driver=await context.newPage();
  await driver.goto(`${base}/game/preview?autojoin=1&room=${roomCode}`);
  await driver.waitForSelector('#lobbyScreen.active');
  await host.evaluate(code=>new Promise(async(resolve,reject)=>{
    window.__qaPeers=[];
    window.__qaPackets=[];
    window.__qaIncoming={positions:0,position:0,looks:0,crumble:0};
    window.__qaHost.on('game:positions',list=>window.__qaPackets.push({time:performance.now(),list}));
    try {
      await Promise.all(Array.from({length:19},(_,index)=>new Promise((joined,failed)=>{
        const socket=window.io('/game',{forceNew:true,reconnection:false});
        window.__qaPeers.push(socket);
        for(const [event,key] of [['game:positions','positions'],['game:position','position'],['game:looks','looks'],['game:crumble','crumble']])
          socket.on(event,()=>window.__qaIncoming[key]++);
        socket.on('connect',()=>socket.emit('player:join',{code,name:`LoadQA-${index}`},r=>r?.ok?joined():failed(new Error('peer join failed'))));
        socket.on('connect_error',failed);
      })));
      window.__qaHost.emit('host:start',r=>r?.ok?resolve():reject(new Error('host start failed')));
    } catch(error){reject(error);}
  }),roomCode);
  await driver.waitForFunction(()=>window.__game?.scene.getScene('GameScene')?.player);
  await host.evaluate(()=>{
    let tick=0;
    window.__qaSender=setInterval(()=>{
      tick++;
      window.__qaPeers.forEach((socket,index)=>socket.volatile.emit('player:state',{
        x:400+index*12+tick,y:5652,velocityX:5,velocityY:0,energy:100,
        progress:.2,altitude:300,animation:tick%4?'run':'jump',facing:tick%3?-1:1
      }));
    },33);
  });
  await driver.keyboard.down('ArrowRight');
  await driver.keyboard.down('Space');
  await driver.waitForTimeout(1500);
  await driver.keyboard.up('Space');
  await driver.keyboard.up('ArrowRight');
  const render=await driver.evaluate(()=>{
    const scene=window.__game.scene.getScene('GameScene');
    return {ghostsPresent:!!scene.ghosts,ghostReceiver:typeof scene.updateGhosts,
      playerX:scene.player.x,rendered:scene.cameras.main.renderList.length};
  });
  assert.equal(render.ghostsPresent,false,'students no longer create remote ghost state');
  assert.equal(render.ghostReceiver,'undefined','remote ghost renderer is removed');
  const trapId=await driver.evaluate(()=>window.__game.scene.getScene('GameScene').crumbleObjects.keys().next().value);
  await host.evaluate(id=>window.__qaPeers[0].emit('game:crumble',{id}),trapId);
  await driver.waitForFunction(id=>window.__game.scene.getScene('GameScene').crumbleObjects.get(id).state.phase!=='ready',trapId);
  await driver.waitForTimeout(150);
  const report=await host.evaluate(()=>{
    clearInterval(window.__qaSender);
    const packets=window.__qaPackets;
    const intervals=packets.slice(1).map((p,i)=>p.time-packets[i].time);
    const last=packets.at(-1)?.list||[];
    return {incoming:window.__qaIncoming,teacherPackets:packets.length,
      teacherPlayers:last.length,teacherNames:last.map(p=>p.name),
      averageTeacherIntervalMs:intervals.reduce((s,v)=>s+v,0)/intervals.length,
      progressTracked:last.filter(p=>p.progress===.2&&p.altitude===300).length};
  });
  assert.deepEqual([report.incoming.positions,report.incoming.position,report.incoming.looks],[0,0,0],
    'students must receive no remote position or appearance packets');
  assert.equal(report.teacherPlayers,20,'teacher receives every climber');
  assert.equal(report.progressTracked,19,'teacher progress and altitude survive the relay change');
  assert.ok(report.teacherPackets>=10&&report.averageTeacherIntervalMs<180,'teacher board continues refreshing');
  assert.equal(report.incoming.crumble,19,'shared traps still reach every student');
  await host.evaluate(()=>window.__qaHost.emit('host:end'));
  await driver.waitForSelector('#resultScreen.active');
  console.log(JSON.stringify({render,...report},null,2));
} finally {
  await host.evaluate(()=>{
    clearInterval(window.__qaSender);
    window.__qaHost?.emit('host:close');
    window.__qaPeers?.forEach(socket=>socket.disconnect());
  }).catch(()=>{});
  await browser.close();
}
