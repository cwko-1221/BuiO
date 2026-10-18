import { buildCourse, validateCourse } from './course.js?v=20260907-ipad-perf-3';
import { GameScene } from './GameScene.js?v=20261018-latency-1';
import { PlayerStateThrottle } from './PlayerStateThrottle.js?v=20261005-no-ghosts-1';
import { GameAudio } from './GameAudio.js?v=20260717-louder-2';
import { normaliseAvatar } from './avatar.js?v=20260907-side-climber-1';
import { QuestionLayout } from './QuestionLayout.js?v=20261012-ipad-fit-1';

const { t, server: serverText, lang: uiLang } = window.BuiI18n;

// Chinese counts places with 第N位 and needs no suffix; English does.
function ordinal(place) {
  const n = Number(place);
  if (uiLang !== 'en-US' || !Number.isFinite(n)) return place;
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

const $ = id => document.getElementById(id);
const questionLayout = new QuestionLayout($('qOverlay'));
const gameAudio = new GameAudio();
window.__gameAudio = gameAudio;
const socket = io('/game');
let me = { name:'', studentId:null };
let phaserGame = null;
let scene = null;
let frozen = false;
let roomsTimer = null;
let joining = false;
let networkPaused = false;
let joinRetryTimer = null;
let requestedRoom = null;
let questionRetry = null;
let questionAttempt = 0;
let currentQuestionId = null;
let stateThrottle = new PlayerStateThrottle();
let lastHudAt = -Infinity;
let lastFrame = null;
let previewPenalty = new window.BuiGameQuestionPenalty();
let answerCooldownUntil = 0;
let answerCooldownTimer = null;
let questionCloseTimer = null;
let questionRequest = 0;
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

function requestSocket(event, payload) {
  return new Promise((resolve, reject) => {
    if (!socket.connected && event!=='player:join') return reject(new Error('Connection unavailable'));
    socket.timeout(6000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
  });
}

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

// The Chinese honorific trails the name; English has nothing to append.
function teacherLabel(name) {
  const n=String(name||t('g.teacherFallback'));
  if(uiLang!=='zh-HK')return n;
  return n.endsWith('老師')?n:`${n}老師`;
}
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
    if(!rooms.length){el.innerHTML=`<p class="muted"><span class="pulse-dot"></span>${escapeHtml(t('g.noRooms'))}</p>`;return;}
    for(const r of rooms){
      const row=document.createElement('button'); row.className='room-row';
      row.innerHTML=`<span class="room-emoji">${r.phase==='lobby'?'⛺':'🏔️'}</span><span class="room-info"><b>${escapeHtml(teacherLabel(r.hostName))}</b><small>${escapeHtml(r.setTitle||'')} · ${escapeHtml(t('g.playerCount',{count:r.players}))}</small></span><span class="room-phase ${r.phase==='lobby'?'waiting':'playing'}">${escapeHtml(t(r.phase==='lobby'?'g.phaseLobby':'g.phaseLive'))}</span>`;
      row.addEventListener('click',()=>joinRoom(r.code)); el.appendChild(row);
    }
  } catch {}
}

function startRoomPolling(){loadRooms();clearInterval(roomsTimer);roomsTimer=setInterval(loadRooms,3000);}

async function joinRoom(code){
  if(joining)return; joining=true; $('joinError').textContent=''; await meReady;
  requestedRoom=code;
  clearTimeout(joinRetryTimer);
  try {
    const res=await requestSocket('player:join',{code,name:me.name||t('g.playerFallback'),studentId:me.studentId,avatar:selectedAvatar});
    if(!res?.ok){
      if(networkPaused){
        phaserGame?.destroy(true);phaserGame=null;scene=null;closeQuestion();
        networkPaused=false;startMeta=null;requestedRoom=null;show('joinScreen');startRoomPolling();
      }
      $('joinError').textContent=serverText(res?.message)||t('g.joinFailed');loadRooms();return;
    }
    clearInterval(roomsTimer); startMeta={...(startMeta||{}),code,playerKey:res.playerKey||`s:${me.studentId}`,seed:res.seed,durationSec:res.durationSec,startedAt:res.startedAt};
    selectedAvatar=normaliseAvatar(res.avatar||selectedAvatar);
    $('lobbySetTitle').textContent=res.setTitle||t('g.preparing'); $('lobbyHostName').textContent=t('g.hostRoom',{teacher:teacherLabel(res.hostName)});
    networkPaused=false;
    if(res.phase==='playing'&&scene&&JSON.stringify(scene.avatar)===JSON.stringify(selectedAvatar)){
      if(res.resume?.stateSeq!==0&&Number.isFinite(res.resume?.x)&&Number.isFinite(res.resume?.y))scene.setPlayerPosition(res.resume.x,res.resume.y);
      scene.setEnergy(res.resume?.energy??scene.energy);
      setAnswerCooldown(res.resume?.answerPenalty?.cooldownMs||0);
      questionRetry?.();
    }else if(res.phase==='playing')startGame(res.seed,res.durationSec,res.startedAt,res.resume,res.settings); else show('lobbyScreen');
  } catch {
    $('joinError').textContent=t('g.connectionWait');
    if(startMeta&&socket.connected)joinRetryTimer=setTimeout(()=>joinRoom(code),3000);
    else loadRooms();
  } finally { joining=false; }
}

socket.on('disconnect',()=>{
  if(!startMeta||preview)return;
  networkPaused=true;scene?.resumeControl();
  toast(t('g.connectionWait'));
});
socket.on('connect',()=>{if(requestedRoom&&!preview)void joinRoom(requestedRoom);});

socket.on('game:start',({seed,durationSec,startedAt,settings})=>startGame(seed,durationSec,startedAt,null,settings));
socket.on('game:crumble',({id})=>scene?.triggerCrumble(id,false));
socket.on('game:summit',({name,place})=>toast(t('g.summitOther',{name,place:ordinal(place)}),true));
socket.on('game:over',({leaderboard})=>showResults(leaderboard));
socket.on('room:closed',({message})=>{if(phaserGame)phaserGame.destroy(true);alert(serverText(message)||t('g.roomClosed'));location.href='/';});

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
  scene=null;
  stateThrottle = new PlayerStateThrottle();
  lastHudAt = -Infinity;
  closeQuestion();
  previewPenalty = new window.BuiGameQuestionPenalty();
  setAnswerCooldown(resume?.answerPenalty?.cooldownMs || 0);
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
    isFrozen:()=>frozen||networkPaused,
    onLoadError:()=>window.BuiLoading?.recover(new Error('Game asset loading'),()=>preview
      ? startGame(seed,durationSec,startedAt,resume,settings) : joinRoom(startMeta.code)),
    onSound:type=>gameAudio.play(type),
    onCrumble:id=>{if(!preview)socket.emit('game:crumble',{id});},
    onCheckpoint:cp=>toast(t('g.checkpoint',{name:cp.name||cp.zoneName}),true),
    onRecovery:type=>{
      if(type==='rapidFall')toast(t('g.recoverFall'));
      else if(type==='laser')toast(t('g.recoverLaser'));
      else toast(t('g.recoverOther'));
    },
    onReady:s=>{
      scene=s;
      if(resume?.stateSeq!==0&&Number.isFinite(resume?.x)&&Number.isFinite(resume?.y))s.setPlayerPosition(resume.x,resume.y);
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
      if(preview){toast(t('g.summitPreview'),true);return;}
      socket.emit('player:summit',res=>{
        if(!res?.ok)return;
        toast(t('g.summitMine',{place:ordinal(res.place)}),true);
        setTimeout(()=>showResults(res.leaderboard,{personal:true,place:res.place}),650);
      });
    },
    onEffect:(type)=>{if(type==='doubleJump')toast(t('g.doubleJump'));}
  };
  phaserGame=window.__game=new Phaser.Game({
    // Opaque, not transparent: the scene paints its own sky over the whole viewport, and the
    // only thing behind the canvas is #gameScreen's black. A transparent canvas buys nothing
    // and costs a per-frame blend against the page on every device — iOS Safari most of all.
    type:Phaser.AUTO,parent:'gameCanvas',backgroundColor:'#8edcff',
    loader:{maxParallelDownloads:4,timeout:15000,maxRetries:1},
    scale:{mode:Phaser.Scale.RESIZE,width:window.innerWidth,height:window.innerHeight,autoCenter:Phaser.Scale.CENTER_BOTH},
    render:{antialias:true,roundPixels:false,pixelArt:false},
    physics:{default:'matter',matter:{gravity:{y:1.45},enableSleeping:true,debug:new URLSearchParams(location.search).has('physics')}},
    scene:[new GameScene(course,hooks)],fps:{target:60,min:30,forceSetTimeOut:false}
  });
}

// The HUD is read, not watched: the stage changes a dozen times in a climb and the clock once
// a second, but this runs every frame. Writing the same string back still costs a style recalc
// and a repaint of that layer, sixty times a second, on top of whatever the game is drawing.
const hudShown=new Map();
function setHud(id,value){
  if(hudShown.get(id)===value)return;
  hudShown.set(id,value);
  $(id).textContent=value;
}

function updateHudAndNetwork(state){
  lastFrame=state;
  const now=Date.now();
  if(!preview && stateThrottle.shouldSend(state,now)) socket.volatile.emit('player:state',state);
  if(now-lastHudAt<100)return;
  lastHudAt=now;
  const left=Math.max(0,startMeta.durationSec-(now-startMeta.startedAt)/1000);
  setHud('timerPill',`⏱ ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')}`);
  setHud('heightPill',t('g.height',{metres:Math.round(state.altitude)}));
  setHud('stagePill',`${String(state.zoneIndex+1).padStart(2,'0')} · ${state.zoneName}`);
  // The bar is a width, so it is rounded to whole percent: the eye cannot read finer and the
  // repaint is the same price as the text.
  const energyPercent=Math.round(Math.min(100,Math.max(0,state.energy/gameSettings.maxEnergy*100)));
  if(hudShown.get('energyFill')!==energyPercent){
    hudShown.set('energyFill',energyPercent);
    $('energyFill').style.width=`${energyPercent}%`;
    $('energyFill').classList.toggle('low',energyPercent<20);
  }
  setHud('energyText',gameSettings.infiniteEnergy?'∞':String(Math.round(state.energy)));
}

// Gesture protection lives in the early head script, before any game downloads.

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
  audioBtn.setAttribute('aria-label',t(gameAudio.muted?'g.audioOn':'g.audioOff'));
}
audioBtn.addEventListener('click',()=>{
  const muted=gameAudio.toggleMuted();
  refreshAudioButton();
  if(!muted)void gameAudio.unlock();
});
for(const eventName of ['pointerdown','keydown','touchstart']) window.addEventListener(eventName,()=>gameAudio.unlock(),{once:true,capture:true});
refreshAudioButton();

$('answerBtn').addEventListener('click',openQuestion);$('qClose').addEventListener('click',closeQuestion);
function refreshAnswerCooldown(){
  const seconds=Math.max(0,Math.ceil((answerCooldownUntil-performance.now())/1000));
  const button=$('answerBtn');
  button.disabled=seconds>0;
  button.querySelector('[data-i18n="g.answer"]').textContent=seconds?t('g.qCooldownShort',{seconds}):t('g.answer');
  button.querySelector('small').textContent=t(seconds?'g.qCooldownWait':'g.answerSub');
  button.setAttribute('aria-label',seconds?t('g.qCooldown',{seconds}):t('g.answerAria'));
  const status=$('qCooldown');
  status.hidden=!seconds;
  const text=seconds?t('g.qCooldown',{seconds}):'';
  if(status.textContent!==text)status.textContent=text;
  if(!seconds){
    clearInterval(answerCooldownTimer);answerCooldownTimer=null;
    if($('qFeedback').dataset.penalty==='true')$('qFeedback').textContent=t('g.qCooldownReady');
  }
  questionLayout.fit();
}
function setAnswerCooldown(milliseconds){
  clearInterval(answerCooldownTimer);answerCooldownTimer=null;
  answerCooldownUntil=performance.now()+Math.max(0,Number(milliseconds)||0);
  refreshAnswerCooldown();
  if(milliseconds>0)answerCooldownTimer=setInterval(refreshAnswerCooldown,200);
}
function showQuestionCooldown(res){
  $('qText').textContent=t('g.qCooldownTitle');
  $('qChoices').innerHTML='';
  $('qFeedback').textContent=t('g.qWrongPenalty');
  $('qFeedback').className='q-feedback bad';
  $('qFeedback').dataset.penalty='true';
  $('qClose').style.display='';
  setAnswerCooldown(res.cooldownMs);
  questionLayout.fit();
}
function openQuestion(){
  if(!scene||frozen||scene.finished||performance.now()<answerCooldownUntil)return;
  const request=++questionRequest;
  const requestId=crypto.randomUUID();
  currentQuestionId=null;
  frozen=true;scene.resumeControl();
  clearTimeout(questionCloseTimer);questionCloseTimer=null;
  delete $('qFeedback').dataset.penalty;
  $('qFeedback').textContent='';$('qFeedback').className='q-feedback';$('qClose').style.display='none';$('qImage').hidden=true;$('qImage').removeAttribute('src');$('qOverlay').classList.add('open');
  if(preview)return renderQuestion({question:t('g.qSample'),choices:['48','54','56','64']});
  $('qText').textContent='';$('qChoices').innerHTML=`<div class="muted" style="grid-column:1/-1;text-align:center">${escapeHtml(t('g.qLoading'))}</div>`;
  questionLayout.fit();
  questionRetry=()=>requestQuestion(request,requestId);
  void questionRetry();
}
async function requestQuestion(request,requestId){
  const attempt=++questionAttempt;
  try{
    const res=await requestSocket('player:question',{requestId});
    if(attempt!==questionAttempt||request!==questionRequest||!scene||!frozen)return;
    questionRetry=null;
    if(res?.reason==='answer-cooldown')return showQuestionCooldown(res);
    if(!res?.ok)return closeQuestion();renderQuestion(res);
  }catch{if(attempt===questionAttempt&&request===questionRequest&&frozen)questionError(()=>requestQuestion(request,requestId),true);}
}
function questionError(retry,canClose){
  questionRetry=retry;
  $('qFeedback').textContent=t('g.connectionWait');
  $('qFeedback').className='q-feedback';
  const button=document.createElement('button');button.type='button';button.className='q-choice';button.textContent=t('g.retry');
  button.onclick=()=>{button.disabled=true;void retry();};
  $('qChoices').replaceChildren(button);$('qClose').style.display=canClose?'':'none';questionLayout.fit();
}
function renderQuestion(res){
  currentQuestionId=res.questionId;
  $('qFeedback').textContent='';$('qFeedback').className='q-feedback';$('qClose').style.display='none';
  $('qText').textContent=res.question;
  const image=$('qImage');
  image.hidden=!res.image;
  if(res.image)image.src=res.image;else image.removeAttribute('src');
  $('qChoices').innerHTML='';res.choices.forEach((c,i)=>{const b=document.createElement('button');b.className='q-choice';b.textContent=c;b.onclick=()=>answer(i);$('qChoices').appendChild(b);});
  questionLayout.fit();
}
function answer(choice){
  const buttons=[...$('qChoices').children];
  if(!scene||!frozen||buttons[choice]?.disabled||!buttons[choice]||performance.now()<answerCooldownUntil)return;
  buttons.forEach(b=>b.disabled=true);
  const request=questionRequest;
  if(preview)return applyAnswer({
    correct:choice===2,
    correctChoice:2,
    gain:choice===2&&!gameSettings.infiniteEnergy?gameSettings.energyPerCorrect:0,
    energy:gameSettings.infiniteEnergy
      ? gameSettings.maxEnergy
      : Math.min(gameSettings.maxEnergy,(lastFrame?.energy??40)+(choice===2?gameSettings.energyPerCorrect:0)),
    streak:1,
    infiniteEnergy:gameSettings.infiniteEnergy,
    ...previewPenalty.recordAnswer(choice===2,performance.now()),
  },choice,buttons);
  const payload={choice,questionId:currentQuestionId};
  const submit=async()=>{
    const attempt=++questionAttempt;
    try{
      const res=await requestSocket('player:answer',payload);
      if(attempt!==questionAttempt||request!==questionRequest||!scene||!frozen)return;
      questionRetry=null;
      if(res?.reason==='answer-cooldown')return showQuestionCooldown(res);
      if(!res?.ok)return closeQuestion();
      $('qChoices').replaceChildren(...buttons);applyAnswer(res,choice,buttons);
    }catch{if(attempt===questionAttempt&&request===questionRequest&&frozen)questionError(submit,false);}
  };
  questionRetry=submit;void submit();
}
function applyAnswer(res,choice,buttons){
  gameAudio.play(res.correct?'correct':'wrong');
  buttons[choice]?.classList.add(res.correct?'correct':'wrong');if(!res.correct)buttons[res.correctChoice]?.classList.add('correct');
  const fb=$('qFeedback');
  fb.textContent=res.correct
    ? (res.infiniteEnergy?t('g.qRightInfinite'):t('g.qRight',{gain:res.gain}))
    :t(res.cooldownMs>0?'g.qWrongPenalty':'g.qWrong');
  fb.classList.add(res.correct?'good':'bad');scene.setEnergy(res.energy);
  if(res.cooldownMs>0){fb.dataset.penalty='true';setAnswerCooldown(res.cooldownMs);}
  if(res.correct)questionCloseTimer=setTimeout(closeQuestion,800);else $('qClose').style.display='';
  questionLayout.fit();
}
function closeQuestion(){
  questionRequest++;
  questionAttempt++;questionRetry=null;currentQuestionId=null;
  clearTimeout(questionCloseTimer);questionCloseTimer=null;
  $('qOverlay').classList.remove('open');frozen=false;scene?.resumeControl();
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  $('gameCanvas').focus({preventScroll:true});
}

function toast(message,gold=false){const el=document.createElement('div');el.className=`toast${gold?' gold':''}`;el.textContent=message;$('toasts').appendChild(el);setTimeout(()=>el.remove(),2700);}

// Nothing here chooses a climber any more: a child climbs as the pet they already own, and the
// lobby only has to say the room is waiting. The colour and trinket the old picker set survive as
// the fallback look for a child who has not hatched a pet yet, at their default values.

function showResults(leaderboard,{personal=false,place=null}={}){
  closeQuestion();setAnswerCooldown(0);
  phaserGame?.destroy(true);phaserGame=null;scene=null;const list=$('resultsList');list.innerHTML='';
  leaderboard.forEach(row=>{const d=document.createElement('div');d.className=`result-row${row.rank<=3?` top${row.rank}`:''}`;d.innerHTML=`<div class="rank">${['🥇','🥈','🥉'][row.rank-1]||row.rank}</div><div class="name">${escapeHtml(row.name)}${row.finished?' 🏁':''}</div><div class="stat">✓${row.correct} ✗${row.wrong}</div><div class="height">${Math.round((row.bestProgress??row.bestHeight??0)*100)}%</div>`;list.appendChild(d);});
  $('resultEmoji').textContent=personal?'🏆':'🏁';
  $('resultSub').textContent=personal?t('g.resultPersonal',{place:ordinal(place)}):t('g.resultDone');
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
