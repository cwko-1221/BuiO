'use strict';
const {randomUUID,randomBytes}=require('node:crypto');
const repo=require('../repositories/brawl-duel.repo');
const ranking=require('../repositories/brawl-ranking.repo');
const accessLocks=require('../repositories/access-lock.repo');
const config=require('../../config');
const rules=Promise.all([import('../lib/brawl/catalog.mjs'),import('../lib/brawl/simulation.mjs')]);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const terminal=s=>['finished','cancelled'].includes(s.status);
const actionBits=16|32|128|256;
module.exports=function register(io,options={}){
  const ns=io.of('/pet-brawl'),members=new Map(),invites=new Map(),reserved=new Map(),rooms=new Map(),inviteKeys=new Map(),lastInvite=new Map();
  const now=options.now||Date.now,inviteMs=options.inviteMs||60000,prepareMs=options.prepareMs||30000,reconnectMs=options.reconnectMs||20000,countdownMs=options.countdownMs??3000;
  const startup=Promise.all([rules,repo.recover(),ranking.distribute()]);let catalog,sim;
  startup.then(([r])=>{[catalog,sim]=r;}).catch(e=>console.error('[pet-duel] startup failed:',e.message));
  const all=id=>[...members.values()].filter(m=>m.profile.id===id);
  const online=id=>all(id).some(m=>m.active&&!m.locked&&now()-m.seenAt<25000);
  const available=id=>online(id)&&!all(id).some(m=>m.busy)&&![...rooms.values()].some(r=>!terminal(r.meta)&&r.meta.players.some(p=>p.id===id));
  const studentRoom=id=>'student:'+id;
  const send=(id,event,payload)=>ns.to(studentRoom(id)).emit(event,payload);
  function publicPeers(id){const peers=new Map();for(const m of members.values()){const p=m.profile;if(p.id===id||!online(p.id))continue;peers.set(p.id,{id:p.id,name:p.name,className:p.className,rank:p.rank,available:available(p.id)&&!reserved.has(p.id)&&p.pets.length>0,hasFighter:p.pets.length>0});}return [...peers.values()].sort((a,b)=>a.className.localeCompare(b.className)||a.name.localeCompare(b.name));}
  function presence(){for(const id of new Set([...members.values()].map(m=>m.profile.id)))send(id,'duel:peers',{peers:publicPeers(id),fee:repo.FEE});}
  function noticeInvite(inv){for(const id of [inv.from.id,inv.to.id])send(id,'duel:invitation',inv);}
  function closeInvite(inv,status,message){if(inv.status!=='pending')return;inv.status=status;inv.message=message;inv.closedAt=now();for(const id of [inv.from.id,inv.to.id])if(reserved.get(id)===inv.id)reserved.delete(id);noticeInvite(inv);presence();}
  function info(r,id){return {match:r.meta,playerIndex:r.meta.players.findIndex(p=>p.id===id),phase:r.phase,startAt:r.startAt||0,state:r.state};}
  function announceMatch(r){for(const p of r.meta.players)send(p.id,'duel:match',info(r,p.id));}
  const accountRemoved=({id,match})=>{const r=match&&rooms.get(match.id);if(r){r.meta=match;r.phase='cancelled';for(const p of match.players)send(p.id,'duel:result',{match,winnerIndex:null,refunded:true});}for(const m of all(id))m.socket.disconnect(true);presence();};repo.events.on('accountRemoved',accountRemoved);
  function broadcast(r){r.frameSeq++;const data={matchId:r.meta.id,frameSeq:r.frameSeq,phase:r.phase,startAt:r.startAt||0,reconnectUntil:r.reconnectUntil||0,state:r.state,events:r.events.splice(0)};for(const p of r.meta.players)send(p.id,'duel:frame',data);}
  async function finish(r,reason,winnerIndex=null,refund=false){if(r.finishing||terminal(r.meta))return;r.finishing=true;r.phase='settling';broadcast(r);
    try{r.meta=await repo.finalize(r.meta.id,{status:refund?'cancelled':'finished',reason,winnerIndex,finishedAt:new Date(now()).toISOString(),ticks:r.state.tick},refund);r.phase=r.meta.status;for(const rank of r.meta.rankResults||[])for(const m of all(rank.studentId))m.profile.rank=rank;for(const p of r.meta.players)send(p.id,'duel:result',{match:r.meta,winnerIndex,refunded:!!r.meta.refunded});presence();}
    catch(e){r.finishing=false;r.finishRetry={reason,winnerIndex,refund};r.retryAt=now()+1000;console.error('[pet-duel] could not settle match:',e.message);}
  }
  let accessRefreshing=false,accessAgain=false;
  async function refreshAccess(){
    if(accessRefreshing){accessAgain=true;return;}accessRefreshing=true;
    try{
      const ids=[...new Set([...members.values()].map(m=>m.profile.id).concat([...rooms.values()].filter(r=>!terminal(r.meta)).flatMap(r=>r.meta.players.map(p=>p.id))))];
      if(!ids.length)return;
      const statuses=await accessLocks.studentStatuses(ids);
      for(const [id,access] of statuses){for(const m of all(id)){const changed=m.locked!==access.locked;m.locked=access.locked;if(changed)send(id,'pet:access',access);}
        if(access.locked){const inv=invites.get(reserved.get(id));if(inv?.status==='pending')closeInvite(inv,'cancelled','老師已鎖定寵物樂園，邀請已取消。雙方均未扣款。');}}
      for(const r of rooms.values())if(!terminal(r.meta)&&r.meta.players.some(p=>statuses.get(p.id)?.locked))await finish(r,'pet_app_locked',null,true);
      presence();
    }catch(e){console.error('[pet-access] could not refresh duel access:',e.message);}
    finally{accessRefreshing=false;if(accessAgain){accessAgain=false;void refreshAccess();}}
  }
  accessLocks.events.on('changed',refreshAccess);
  const accessTimer=setInterval(()=>void refreshAccess(),1000);accessTimer.unref();
  let distributing=false;
  const rankTimer=setInterval(async()=>{if(distributing)return;distributing=true;try{if(await ranking.distribute())ns.emit('duel:ranking-changed');}catch(e){console.error('[pet-rank] daily rewards failed:',e.message);}finally{distributing=false;}},60000);rankTimer.unref();
  ns.use(async(socket,next)=>{try{await startup;const origin=socket.request.headers.origin;if(origin&&new URL(origin).host!==socket.request.headers.host&&!config.cors.origins.includes(origin))fail('請在寵物樂園開啟對戰。',403);const session=socket.request.session;if(!session?.studentId||session.role!=='student')fail('請先以學生帳戶登入。',401);await accessLocks.assertAllowed(session.studentId);const profile=await repo.player(session.studentId);socket.data.profile=profile;socket.data.expiresAt=now()+config.session.maxAge;next();}catch(e){const error=new Error(e.message);error.data={code:e.code,access:e.access};next(error);}});
  ns.on('connection',socket=>{
    const id=socket.data.profile.id;socket.join(studentRoom(id));
    const m={socket,profile:socket.data.profile,active:false,busy:false,locked:false,seenAt:now(),inputCount:0,windowAt:now()};members.set(socket.id,m);
    const handle=(event,fn)=>socket.on(event,async(body={},ack)=>{try{if(now()>socket.data.expiresAt)fail('登入已到期，請重新登入。',401);if(['duel:invite','duel:reply','duel:ready'].includes(event))await accessLocks.assertAllowed(id);const value=await fn(body);if(typeof ack==='function')ack({success:true,...value});}catch(e){if(typeof ack==='function')ack({success:false,status:e.status||500,code:e.code,access:e.access,message:e.status?e.message:'對戰暫時未能完成操作，請重試。'});}});
    handle('duel:presence',async body=>{if(typeof body.active!=='boolean'||typeof body.busy!=='boolean')fail('無效的在線狀態。',400);m.active=body.active;m.busy=body.busy;m.seenAt=now();
      if(body.refresh===true)m.profile=await repo.player(id);
      const pending=invites.get(reserved.get(id));if(pending?.status==='pending'&&(!online(id)||m.busy))closeInvite(pending,'cancelled','同學已離線或正在遊戲，邀請已取消。雙方均未扣款。');
      const match=[...rooms.values()].find(r=>!terminal(r.meta)&&r.meta.players.some(p=>p.id===id));let result=null;if(!match&&typeof body.matchId==='string'){const previous=await repo.read(body.matchId);if(previous&&terminal(previous)&&previous.players.some(p=>p.id===id))result={match:previous,winnerIndex:previous.winnerIndex??null,refunded:!!previous.refunded};}presence();return {peers:publicPeers(id),self:{...m.profile,fee:repo.FEE},invitation:pending?.status==='pending'?pending:null,session:match?info(match,id):null,result};});
    handle('duel:invite',async body=>{
      await accessLocks.assertAllowed(body.targetId);
      if(process.env.PET_BRAWL_ENABLED==='0')fail('大亂鬥暫時未開放。',403);
      if(typeof body.key!=='string'||!body.key||body.key.length>120||typeof body.targetId!=='string'||typeof body.petId!=='string'||!catalog.stageById(body.stageId))fail('無效的邀請設定。',400);
      const mode=body.mode===undefined?'friendly':body.mode;if(!['friendly','ranked'].includes(mode))fail('無效的對戰模式。',400);
      const key=id+':'+body.key,existing=invites.get(inviteKeys.get(key));if(existing){if(existing.to.id!==body.targetId||existing.petId!==body.petId||existing.stageId!==body.stageId||existing.mode!==mode)fail('這個識別碼已用於其他邀請。');return {invitation:existing};}
      if(body.targetId===id)fail('請邀請其他同學。',400);
      if(!available(id)||!available(body.targetId)||reserved.has(id)||reserved.has(body.targetId))fail('其中一位同學已離線、正忙或有待回覆的邀請。');
      if(now()-(lastInvite.get(id)||-Infinity)<3000)fail('請稍候再邀請同學。',429);
      // Fetch current pet ownership/balance, not the connection's cached profile.
      const [from,to]=await Promise.all([repo.player(id),repo.player(body.targetId)]);
      if(mode==='ranked')ranking.assertSameTier([from.rank,to.rank]);
      if(!available(id)||!available(to.id)||reserved.has(id)||reserved.has(to.id))fail('同學目前無法接受邀請。');
      const pet=from.pets.find(p=>p.petId===body.petId);if(!pet)fail('請選擇自己擁有的出戰寵物。',403);if(!to.pets.length)fail('同學暫時沒有可出戰的寵物。');if(from.balance<repo.FEE)fail('你需要 500 金幣才能邀請對戰。');
      const inv={id:randomUUID(),mode,rankTier:mode==='ranked'?from.rank.tier:undefined,from:{id:from.id,name:from.name,className:from.className,fighterId:pet.fighterId},to:{id:to.id,name:to.name},petId:pet.petId,stageId:body.stageId,status:'pending',fee:repo.FEE,expiresAt:now()+inviteMs};
      invites.set(inv.id,inv);inviteKeys.set(key,inv.id);reserved.set(id,inv.id);reserved.set(to.id,inv.id);lastInvite.set(id,now());noticeInvite(inv);presence();return {invitation:inv};
    });
    handle('duel:reply',async body=>{
      const inv=invites.get(body.inviteId);if(!inv||inv.to.id!==id)fail('找不到給你的邀請。',404);
      if(inv.status==='accepted'){const r=rooms.get(inv.matchId);if(r&&!terminal(r.meta))return {session:info(r,id)};fail('這场對戰已結束。');}
      if(inv.status!=='pending')fail(inv.message||'邀請已失效。');if(inv.expiresAt<=now()){closeInvite(inv,'expired','邀請已逾時，雙方均未扣款。');fail('邀請已逾時。');}
      if(body.accept===false){closeInvite(inv,'declined','同學婉拒了邀請，雙方均未扣款。');return {invitation:inv};}
      if(body.accept!==true||typeof body.petId!=='string')fail('請選擇出戰寵物。',400);
      await accessLocks.assertAllowed(inv.from.id);
      if(process.env.PET_BRAWL_ENABLED==='0')fail('大亂鬥暫時未開放。',403);
      if(!available(inv.from.id)||!available(id))fail('其中一位同學已離線或正在遊戲。');
      inv.status='accepting';let charged=null;
      try{const receiver=await repo.player(id),pet=receiver.pets.find(p=>p.petId===body.petId);if(!pet)fail('請使用自己擁有的出戰寵物。',403);
        const meta={id:randomUUID(),inviteId:inv.id,mode:inv.mode,rankTier:inv.rankTier,version:catalog.VERSION,stageId:inv.stageId,seed:randomBytes(4).readUInt32LE(0),players:[{id:inv.from.id,name:inv.from.name,petId:inv.petId,fighterId:inv.from.fighterId},{id,name:receiver.name,petId:pet.petId,fighterId:pet.fighterId}]};
        charged=await repo.charge(meta,()=>inv.status==='accepting'&&inv.expiresAt>now()&&available(inv.from.id)&&available(id));
        await Promise.all(meta.players.map(p=>accessLocks.assertAllowed(p.id)));
        const r={meta:charged,state:sim.createBattle({mode:'pvp',fighterId:meta.players[0].fighterId,opponentId:meta.players[1].fighterId,stageId:meta.stageId,difficulty:'normal',seed:meta.seed}),phase:'preparing',controllers:[null,null],ready:[false,false],masks:[0,0],pressed:[0,0],seq:[-1,-1],inputAt:[0,0],createdAt:now(),frameSeq:0,events:[],clockAt:now(),accumulator:0};rooms.set(meta.id,r);
        inv.status='accepted';inv.matchId=meta.id;inv.closedAt=now();reserved.delete(inv.from.id);reserved.delete(id);noticeInvite(inv);announceMatch(r);presence();return {session:info(r,id)};
      }catch(e){if(charged)await repo.finalize(charged.id,{status:'cancelled',reason:'preparation_error'},true);inv.status='pending';closeInvite(inv,'failed',e.status?e.message:'未能開場，入場費已退回。');throw e;}
    });
    handle('duel:cancel',body=>{const inv=invites.get(body.inviteId);if(!inv||inv.from.id!==id)fail('找不到你的邀請。',404);if(inv.status==='pending')closeInvite(inv,'cancelled','邀請已取消，雙方均未扣款。');else if(inv.status==='accepting'||inv.status==='accepted')fail('同學已接受，請先完成這場對戰。');return {invitation:inv};});
    const own=matchId=>{const r=rooms.get(matchId),index=r?.meta.players.findIndex(p=>p.id===id)??-1;if(!r||index<0||terminal(r.meta))fail('找不到你的進行中對戰。',404);return {r,index};};
    handle('duel:ready',body=>{const {r,index}=own(body.matchId);if(r.controllers[index]&&r.controllers[index]!==socket.id&&members.has(r.controllers[index]))fail('這個帳戶已在另一個分頁或裝置操作對戰。');if(r.ready[index]&&r.controllers[index]===socket.id)return {session:info(r,id)};r.controllers[index]=socket.id;r.ready[index]=true;r.seq[index]=-1;r.masks[index]=r.pressed[index]=0;r.inputAt[index]=now();
      if(r.ready.every(Boolean)&&r.controllers.every(s=>members.has(s))){r.startAt=now()+countdownMs;r.phase='countdown';r.clockAt=now();r.accumulator=0;r.reconnectUntil=0;}broadcast(r);return {session:info(r,id)};});
    socket.on('duel:input',body=>{try{const {r,index}=own(body?.matchId);if(r.controllers[index]!==socket.id||!['playing','countdown'].includes(r.phase))return;
      if(m.locked)return;
      if(!Number.isSafeInteger(body.seq)||body.seq<=r.seq[index]||!Number.isInteger(body.mask)||body.mask<0||body.mask>1023)return;
      if(now()-m.windowAt>1000){m.windowAt=now();m.inputCount=0;}if(++m.inputCount>120)return;
      r.pressed[index]|=body.mask&~r.masks[index]&actionBits;r.masks[index]=body.mask;r.seq[index]=body.seq;r.inputAt[index]=now();
    }catch{}});
    handle('duel:leave',async body=>{const {r,index}=own(body.matchId);const statuses=await accessLocks.studentStatuses(r.meta.players.map(p=>p.id));const locked=[...statuses.values()].some(s=>s.locked);await finish(r,locked?'pet_app_locked':r.started?'surrender':'preparation_cancelled',locked?null:r.started?1-index:null,locked||!r.started);return {};});
    socket.on('disconnect',()=>{members.delete(socket.id);const inv=invites.get(reserved.get(id));if(inv?.status==='pending'&&!online(id))closeInvite(inv,'cancelled','同學已離線，邀請已取消。雙方均未扣款。');
      for(const r of rooms.values()){const index=r.controllers.indexOf(socket.id);if(index<0||terminal(r.meta))continue;r.controllers[index]=null;r.ready[index]=false;r.masks[index]=r.pressed[index]=0;if(r.started){r.phase='reconnecting';r.reconnectUntil=now()+reconnectMs;}else r.phase='preparing';broadcast(r);}presence();
    });
  });
  let sweeping=false,lastPresence=0;
  const tick=setInterval(()=>{if(!sim)return;const time=now();
    for(const r of rooms.values()){
      if(terminal(r.meta)){if(time-Date.parse(r.meta.finishedAt||r.meta.updatedAt)>300000)rooms.delete(r.meta.id);continue;}
      if(r.finishRetry&&!r.finishing){if(time<(r.retryAt||0))continue;const args=r.finishRetry;r.finishRetry=null;void finish(r,args.reason,args.winnerIndex,args.refund);continue;}
      if(r.finishing)continue;
      if(!r.started&&time-r.createdAt>prepareMs){void finish(r,'preparation_timeout',null,true);continue;}
      if(r.phase==='reconnecting'&&time>=r.reconnectUntil){const connected=r.controllers.map(s=>s&&members.has(s));void finish(r,connected.some(Boolean)?'disconnect':'both_disconnected',connected[0]?0:connected[1]?1:null,!connected.some(Boolean));continue;}
      if(r.phase==='countdown'&&time>=r.startAt&&!r.starting){r.starting=true;void repo.finalize(r.meta.id,{status:'playing'}).then(meta=>{if(terminal(r.meta)||r.finishing)return;r.meta=meta;if(r.phase!=='countdown'||!r.controllers.every(s=>members.has(s)))return;r.started=true;r.phase='playing';r.clockAt=now();r.accumulator=0;broadcast(r);}).catch(()=>{void finish(r,'preparation_error',null,true);}).finally(()=>r.starting=false);}
      if(r.phase!=='playing')continue;
      r.accumulator+=Math.min(250,time-r.clockAt);r.clockAt=time;let frames=0;
      while(r.accumulator>=1000/60&&frames++<15){const masks=r.masks.map((mask,i)=>time-r.inputAt[i]<400?mask|r.pressed[i]:r.pressed[i]);r.pressed=[0,0];sim.stepBattle(r.state,masks[0],masks[1]);r.events.push(...r.state.events);r.accumulator-=1000/60;
        if(['won','lost','draw'].includes(r.state.status)){broadcast(r);void finish(r,'battle_complete',r.state.status==='draw'?null:r.state.status==='won'?0:1);break;}
        if(r.state.tick%3===0)broadcast(r);
      }
    }
    if(sweeping)return;sweeping=true;
    for(const inv of invites.values()){if(inv.status==='pending'&&time>=inv.expiresAt)closeInvite(inv,'expired','邀請已逾時，雙方均未扣款。');if(inv.closedAt&&time-inv.closedAt>300000)invites.delete(inv.id);}
    for(const [key,id] of inviteKeys)if(!invites.has(id))inviteKeys.delete(key);for(const [id,at] of lastInvite)if(time-at>300000&&!all(id).length)lastInvite.delete(id);if(time-lastPresence>=1000){lastPresence=time;presence();}sweeping=false;
  },1000/60);tick.unref();
  const close=()=>{clearInterval(tick);clearInterval(accessTimer);clearInterval(rankTimer);accessLocks.events.off('changed',refreshAccess);repo.events.off('accountRemoved',accountRemoved);};io.httpServer?.once('close',close);
  return {startup,ns,rooms,invites,close};
};
