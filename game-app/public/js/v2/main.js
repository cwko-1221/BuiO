import { buildCourse, validateCourse } from './course.js?v=20260725-checkpoint-backgrounds-1';
import { GameScene } from './GameScene.js?v=20260907-side-climber-1';
import { GameAudio } from './GameAudio.js?v=20260717-louder-2';
import { normaliseAvatar } from './avatar.js?v=20260907-side-climber-1';

const $ = id => document.getElementById(id);
const gameAudio = new GameAudio();
window.__gameAudio = gameAudio;
const socket = io('/game');
let me = { name:'', studentId:null };
let phaserGame = null;
let scene = null;
let frozen = false;
let roomsTimer = null;
let joining = false;
let lastNet = 0;
let lastNetworkMotion = null;
let lastNetworkFacing = null;
let lastNetworkPose = null;
let lastFrame = null;
let startMeta = null;
let selectedAvatar = normaliseAvatar();
let gameSettings = { maxEnergy:100, energyPerCorrect:25, infiniteEnergy:false };
const previewParams = new URLSearchParams(location.search);
const autoJoinRoom = previewParams.get('autojoin') === '1' ? previewParams.get('room') : null;
const preview = previewParams.has('preview') && ['127.0.0.1','localhost'].includes(location.hostname);
const previewAltitude = previewParams.has('altitude') ? Number(previewParams.get('altitude')) : NaN;
const previewX = previewParams.has('x') ? Number(previewParams.get('x')) : NaN;
const previewInfiniteEnergy = preview && previewParams.get('infiniteEnergy') === '1';
const previewAutoplay = preview && previewParams.get('autoplay') === '1';

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

const meReady = fetch('/api/auth/me',{credentials:'include'}).then(r=>r.ok?r.json():null).then(data=>{
  const u=data?.student; if(u?.name){me={name:u.name,studentId:u.id||null};}
}).catch(()=>{});

// Who the child climbs as. The room tells us again on join — that answer is the one that counts,
// since it is worked out from their account rather than sent from here — but knowing it early lets
// the lobby show them their own creature, and lets the preview run as somebody real.
const petReady = fetch('/api/game/my-pet',{credentials:'include'})
  .then(r=>r.ok?r.json():null)
  .then(data=>{ if(data?.pet) selectedAvatar={...selectedAvatar,pet:data.pet}; })
  .catch(()=>{});

function teacherLabel(name) { const n=String(name||'老師'); return n.endsWith('老師')?n:`${n}老師`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function normaliseGameSettings(raw = {}) {
  const maxEnergy=Math.min(Math.max(Math.round(Number(raw.maxEnergy)||100),20),500);
  const energyPerCorrect=Math.min(Math.max(Math.round(Number(raw.energyPerCorrect)||25),1),maxEnergy);
  return {maxEnergy,energyPerCorrect,infiniteEnergy:raw.infiniteEnergy===true};
}

async function loadRooms() {
  if(joining||preview)return;
  try {
    const res=await fetch('/api/game/sessions',{credentials:'include'});
    const rooms=(await res.json()).sessions.filter(r=>r.phase!=='ended');
    const el=$('roomList'); el.innerHTML='';
    if(!rooms.length){el.innerHTML='<p class="muted"><span class="pulse-dot"></span>而家未有老師開遊戲，等一陣先…</p>';return;}
    for(const r of rooms){
      const row=document.createElement('button'); row.className='room-row';
      row.innerHTML=`<span class="room-emoji">${r.phase==='lobby'?'⛺':'🏔️'}</span><span class="room-info"><b>${escapeHtml(teacherLabel(r.hostName))}</b><small>${escapeHtml(r.setTitle||'')} · ${r.players} 人</small></span><span class="room-phase ${r.phase==='lobby'?'waiting':'playing'}">${r.phase==='lobby'?'等待開始':'進行中'}</span>`;
      row.addEventListener('click',()=>joinRoom(r.code)); el.appendChild(row);
    }
  } catch {}
}

function startRoomPolling(){loadRooms();clearInterval(roomsTimer);roomsTimer=setInterval(loadRooms,3000);}

async function joinRoom(code){
  if(joining)return; joining=true; $('joinError').textContent=''; await meReady;
  socket.emit('player:join',{code,name:me.name||'玩家',studentId:me.studentId,avatar:selectedAvatar},res=>{
    joining=false;
    if(!res?.ok){$('joinError').textContent=res?.message||'加入失敗';loadRooms();return;}
    clearInterval(roomsTimer); startMeta={code,playerKey:res.playerKey||`s:${me.studentId}`};
    selectedAvatar=normaliseAvatar(res.avatar||selectedAvatar);
    $('lobbySetTitle').textContent=res.setTitle||'準備中'; $('lobbyHostName').textContent=`${teacherLabel(res.hostName)}嘅遊戲房間`;
    if(res.phase==='playing')startGame(res.seed,res.durationSec,res.startedAt,res.resume,res.settings); else show('lobbyScreen');
  });
}

socket.on('game:start',({seed,durationSec,startedAt,settings})=>startGame(seed,durationSec,startedAt,null,settings));
socket.on('game:positions',list=>scene?.updateGhosts(list,startMeta?.playerKey));
socket.on('game:position',row=>scene?.updateGhost(row,startMeta?.playerKey));
socket.on('game:crumble',({id})=>scene?.triggerCrumble(id,false));
socket.on('game:summit',({name,place})=>toast(`🏁 ${name} 第 ${place} 位登頂！`,true));
socket.on('game:over',({leaderboard})=>showResults(leaderboard));
socket.on('room:closed',({message})=>{if(phaserGame)phaserGame.destroy(true);alert(message||'房間已關閉');location.href='/';});

// One stable, hand-tuned map for every room (a "season" course, like the
// real DLD). Bump the constant to ship a new map for all rooms at once.
function startGame(seed,durationSec,startedAt,resume,settings){
  clearInterval(roomsTimer); show('gameScreen');
  gameSettings=normaliseGameSettings(settings||gameSettings);
  const infiniteEnergy=previewInfiniteEnergy||gameSettings.infiniteEnergy;
  const startingEnergy=infiniteEnergy
    ? gameSettings.maxEnergy
    : Math.min(resume?.energy??40,gameSettings.maxEnergy);
  const course=buildCourse(seed); const report=validateCourse(course);
  if(!report.ok) console.error('[game-v2] invalid course',report);
  startMeta={...(startMeta||{}),seed,durationSec,startedAt:startedAt||Date.now(),course};
  if(phaserGame)phaserGame.destroy(true);
  const hooks={
    name:me.name||'Koko', energy:startingEnergy, maxEnergy:gameSettings.maxEnergy,
    avatar:selectedAvatar,
    progress:resume?.bestProgress??resume?.bestHeight??0,
    altitude:resume?.altitude, checkpoint:resume?.checkpoint,
    infiniteEnergy,
    autoplay:previewAutoplay,
    onAutoplay:result=>{
      window.__routeAutoplay=result;
      document.documentElement.dataset.routeAutoplay=JSON.stringify(result);
    },
    isFrozen:()=>frozen,
    onSound:type=>gameAudio.play(type),
    onCrumble:id=>{if(!preview)socket.emit('game:crumble',{id});},
    onCheckpoint:cp=>toast(`🏁 已到達${cp.name||cp.zoneName}檢查點`,true),
    onRecovery:type=>{
      if(type==='rapidFall')toast('↩ 下降超過 100 米，返回最近檢查點');
      else if(type==='laser')toast('⚡ 已返回目前區域檢查點');
      else toast('↩ 已返回最近檢查點');
    },
    onReady:s=>{
      scene=s;
      if(Number.isFinite(resume?.x)&&Number.isFinite(resume?.y))s.setPlayerPosition(resume.x,resume.y);
      else if(preview&&Number.isFinite(previewAltitude)) {
        const checkpoint=course.checkpoints.sort((a,b)=>Math.abs(a.altitude-previewAltitude)-Math.abs(b.altitude-previewAltitude))[0];
        const node=course.nodes.filter(item=>item.route==='main').sort((a,b)=>{
          const score=item=>Math.abs(item.altitude-previewAltitude)*10000+(Number.isFinite(previewX)?Math.abs(item.x-previewX):0);
          return score(a)-score(b);
        })[0];
        const spawn=!Number.isFinite(previewX)&&Math.abs((checkpoint?.altitude??Infinity)-previewAltitude)<=1?checkpoint:node;
        if(spawn)s.setPlayerPosition(spawn.x,spawn.y-60);
      }
      // Keep map/version diagnostics in DevTools.  A debug toast covered the
      // mobile HUD and was visible in every reference-comparison screenshot.
      console.info(`[game-v2] ${course.mapVersion} · ${course.courseHash}`);
    },
    onFrame:updateHudAndNetwork,
    onProgress:()=>{},
    onFinish:()=>{
      if(preview){toast('🏆 登頂成功！',true);return;}
      socket.emit('player:summit',res=>{
        if(!res?.ok)return;
        toast(`🏆 第 ${res.place} 位登頂！`,true);
        setTimeout(()=>showResults(res.leaderboard,{personal:true,place:res.place}),650);
      });
    },
    onEffect:(type)=>{if(type==='doubleJump')toast('✨ 二段跳');}
  };
  phaserGame=window.__game=new Phaser.Game({
    type:Phaser.AUTO,parent:'gameCanvas',transparent:true,
    scale:{mode:Phaser.Scale.RESIZE,width:window.innerWidth,height:window.innerHeight,autoCenter:Phaser.Scale.CENTER_BOTH},
    render:{antialias:true,roundPixels:false,pixelArt:false},
    physics:{default:'matter',matter:{gravity:{y:1.45},enableSleeping:true,debug:new URLSearchParams(location.search).has('physics')}},
    scene:[new GameScene(course,hooks)],fps:{target:60,min:30,forceSetTimeOut:false}
  });
}

function updateHudAndNetwork(state){
  lastFrame=state;
  const now=Date.now(); const left=Math.max(0,startMeta.durationSec-(now-startMeta.startedAt)/1000);
  $('timerPill').textContent=`⏱ ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`;
  $('heightPill').textContent=`🏔️ 高度 ${Math.round(state.altitude)}m`;
  $('stagePill').textContent=`${String(state.zoneIndex+1).padStart(2,'0')} · ${state.zoneName}`;
  const energyPercent=Math.min(100,Math.max(0,state.energy/gameSettings.maxEnergy*100));
  $('energyFill').style.width=`${energyPercent}%`;
  $('energyFill').classList.toggle('low',energyPercent<20);
  $('energyText').textContent=gameSettings.infiniteEnergy?'∞':Math.round(state.energy);
  if(!preview){
    const motionChanged=state.animation!==lastNetworkMotion;
    const facingChanged=state.facing!==lastNetworkFacing;
    const moved=!lastNetworkPose||Math.hypot(state.x-lastNetworkPose.x,state.y-lastNetworkPose.y)>.2;
    const active=moved||state.animation!=='idle';
    const due=now-lastNet>=(active?16:100);
    if(due||motionChanged||facingChanged){
      lastNet=now;
      lastNetworkMotion=state.animation;
      lastNetworkFacing=state.facing;
      lastNetworkPose={x:state.x,y:state.y};
      socket.volatile.emit('player:state',state);
    }
  }
}

// iOS ignores user-scalable=no (since iOS 10) and touch-action: manipulation still permits a
// pinch — it only drops the double-tap delay. Refusing the WebKit gesture events is the only
// reliable way to decline one, and it is not cosmetic: when iOS claims the touch stream for a
// zoom, the button holding a finger can stop receiving pointer events entirely, so the
// direction stays pressed and further taps do nothing because it is already held.
for(const type of ['gesturestart','gesturechange','gestureend']){
  document.addEventListener(type,event=>event.preventDefault(),{passive:false});
}
document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault();},{passive:false});

// Every held control registers a release here, so the state can be cleared without depending
// on which element the pointer happened to end on.
const heldReleases=new Set();
function releaseAllHeld(){for(const release of heldReleases)release();}
window.addEventListener('touchend',e=>{if(e.touches.length===0)releaseAllHeld();},{passive:true});
window.addEventListener('touchcancel',releaseAllHeld,{passive:true});
window.addEventListener('pointercancel',releaseAllHeld,{passive:true});
window.addEventListener('blur',releaseAllHeld);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAllHeld();});

function bindHold(id,action){
  const el=$(id);
  let activePointer=null;
  const on=e=>{
    e.preventDefault();
    if(activePointer!==null)return;
    activePointer=e.pointerId;
    el.classList.add('is-pressed');
    try{el.setPointerCapture(e.pointerId);}catch{}
    scene?.setAction(action,true);
  };
  const off=e=>{
    if(activePointer===null||(e?.pointerId!==undefined&&e.pointerId!==activePointer))return;
    e?.preventDefault();
    activePointer=null;
    el.classList.remove('is-pressed');
    scene?.setAction(action,false);
  };
  el.addEventListener('pointerdown',on);
  el.addEventListener('pointerup',off);
  el.addEventListener('pointercancel',off);
  el.addEventListener('lostpointercapture',off);
  // Unconditional release for the case where none of the above ever arrives.
  heldReleases.add(()=>{
    if(activePointer===null)return;
    activePointer=null;
    el.classList.remove('is-pressed');
    scene?.setAction(action,false);
  });
}
bindHold('btnLeft','left');bindHold('btnRight','right');bindHold('btnJump','jump');
$('resetBtn').addEventListener('click',()=>scene?.resetToCheckpoint('manual'));
const audioBtn=$('audioBtn');
function refreshAudioButton(){
  audioBtn.textContent=gameAudio.muted?'🔇':'🔊';
  audioBtn.setAttribute('aria-pressed',String(gameAudio.muted));
  audioBtn.setAttribute('aria-label',gameAudio.muted?'開啟遊戲聲音':'關閉遊戲聲音');
}
audioBtn.addEventListener('click',()=>{
  const muted=gameAudio.toggleMuted();
  refreshAudioButton();
  if(!muted)void gameAudio.unlock();
});
for(const eventName of ['pointerdown','keydown','touchstart']) window.addEventListener(eventName,()=>gameAudio.unlock(),{once:true,capture:true});
refreshAudioButton();

$('answerBtn').addEventListener('click',openQuestion);$('qClose').addEventListener('click',closeQuestion);
function openQuestion(){
  if(!scene||frozen||scene.finished)return;frozen=true;scene.resumeControl();
  $('qFeedback').textContent='';$('qFeedback').className='q-feedback';$('qClose').style.display='none';$('qOverlay').classList.add('open');
  if(preview)return renderQuestion({question:'7 × 8 等於多少？',choices:['48','54','56','64']});
  $('qText').textContent='';$('qChoices').innerHTML='<div class="muted" style="grid-column:1/-1;text-align:center">載入中…</div>';
  socket.emit('player:question',res=>{if(!res?.ok)return closeQuestion();renderQuestion(res);});
}
function renderQuestion(res){
  $('qText').textContent=res.question;$('qChoices').innerHTML='';res.choices.forEach((c,i)=>{const b=document.createElement('button');b.className='q-choice';b.textContent=c;b.onclick=()=>answer(i);$('qChoices').appendChild(b);});
}
function answer(choice){
  const buttons=[...$('qChoices').children];buttons.forEach(b=>b.disabled=true);
  if(preview)return applyAnswer({
    correct:choice===2,
    correctChoice:2,
    gain:gameSettings.infiniteEnergy?0:gameSettings.energyPerCorrect,
    energy:gameSettings.infiniteEnergy
      ? gameSettings.maxEnergy
      : Math.min(gameSettings.maxEnergy,(lastFrame?.energy||40)+gameSettings.energyPerCorrect),
    streak:1,
    infiniteEnergy:gameSettings.infiniteEnergy,
  },choice,buttons);
  socket.emit('player:answer',{choice},res=>{if(!res?.ok)return closeQuestion();applyAnswer(res,choice,buttons);});
}
function applyAnswer(res,choice,buttons){
  gameAudio.play(res.correct?'correct':'wrong');
  buttons[choice]?.classList.add(res.correct?'correct':'wrong');if(!res.correct)buttons[res.correctChoice]?.classList.add('correct');
  const fb=$('qFeedback');
  fb.textContent=res.correct
    ? (res.infiniteEnergy?'答啱喇！無限能量保持開啟 ⚡':`答啱喇！能量 +${res.gain} ⚡`)
    :'差少少，再試下一題！';
  fb.classList.add(res.correct?'good':'bad');scene.setEnergy(res.energy);
  if(res.correct)setTimeout(closeQuestion,800);else $('qClose').style.display='';
}
function closeQuestion(){
  $('qOverlay').classList.remove('open');frozen=false;scene?.resumeControl();
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  $('gameCanvas').focus({preventScroll:true});
}

function toast(message,gold=false){const el=document.createElement('div');el.className=`toast${gold?' gold':''}`;el.textContent=message;$('toasts').appendChild(el);setTimeout(()=>el.remove(),2700);}

// Nothing here chooses a climber any more: a child climbs as the pet they already own, and the
// lobby only has to say the room is waiting. The colour and trinket the old picker set survive as
// the fallback look for a child who has not hatched a pet yet, at their default values.

function showResults(leaderboard,{personal=false,place=null}={}){
  phaserGame?.destroy(true);phaserGame=null;scene=null;const list=$('resultsList');list.innerHTML='';
  leaderboard.forEach(row=>{const d=document.createElement('div');d.className=`result-row${row.rank<=3?` top${row.rank}`:''}`;d.innerHTML=`<div class="rank">${['🥇','🥈','🥉'][row.rank-1]||row.rank}</div><div class="name">${escapeHtml(row.name)}${row.finished?' 🏁':''}</div><div class="stat">✓${row.correct} ✗${row.wrong}</div><div class="height">${Math.round((row.bestProgress??row.bestHeight??0)*100)}%</div>`;list.appendChild(d);});
  $('resultEmoji').textContent=personal?'🏆':'🏁';
  $('resultSub').textContent=personal?`你以第 ${place} 位登頂，其他玩家仍可繼續挑戰。`:'今次攀登完成！';
  show('resultScreen');
}

if(preview){
  me={name:'Koko',studentId:'preview'};
  gameSettings=normaliseGameSettings({maxEnergy:100,energyPerCorrect:25,infiniteEnergy:previewInfiniteEnergy});
  // Wait for the pet before starting, or the preview would always show the plain climber and could
  // never be used to check the thing it is most often opened to check.
  petReady.then(()=>startGame(20260711,480,Date.now(),null,gameSettings));
}else if(autoJoinRoom)meReady.then(()=>joinRoom(autoJoinRoom));
else startRoomPolling();
