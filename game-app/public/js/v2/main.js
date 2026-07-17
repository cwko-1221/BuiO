import { buildCourse, validateCourse } from './course.js?v=20260717-checkpoint';
import { GameScene } from './GameScene.js?v=20260717-checkpoint';
import { GameAudio } from './GameAudio.js?v=20260717-louder';

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
let lastFrame = null;
let startMeta = null;
const previewParams = new URLSearchParams(location.search);
const preview = previewParams.has('preview') && ['127.0.0.1','localhost'].includes(location.hostname);
const previewAltitude = previewParams.has('altitude') ? Number(previewParams.get('altitude')) : NaN;
const previewX = previewParams.has('x') ? Number(previewParams.get('x')) : NaN;

function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

const meReady = fetch('/api/auth/me',{credentials:'include'}).then(r=>r.ok?r.json():null).then(data=>{
  const u=data?.student; if(u?.name){me={name:u.name,studentId:u.id||null};}
}).catch(()=>{});

function teacherLabel(name) { const n=String(name||'老師'); return n.endsWith('老師')?n:`${n}老師`; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
  socket.emit('player:join',{code,name:me.name||'玩家',studentId:me.studentId},res=>{
    joining=false;
    if(!res?.ok){$('joinError').textContent=res?.message||'加入失敗';loadRooms();return;}
    clearInterval(roomsTimer); startMeta={code,playerKey:`s:${me.studentId}`};
    $('lobbySetTitle').textContent=res.setTitle||'準備中'; $('lobbyHostName').textContent=`${teacherLabel(res.hostName)}嘅遊戲房間`;
    if(res.phase==='playing')startGame(res.seed,res.durationSec,res.startedAt,res.resume); else show('lobbyScreen');
  });
}

socket.on('game:start',({seed,durationSec,startedAt})=>startGame(seed,durationSec,startedAt,null));
socket.on('game:positions',list=>scene?.updateGhosts(list,startMeta?.playerKey));
socket.on('game:summit',({name,place})=>toast(`🏁 ${name} 第 ${place} 位登頂！`,true));
socket.on('game:over',({leaderboard})=>showResults(leaderboard));
socket.on('room:closed',({message})=>{if(phaserGame)phaserGame.destroy(true);alert(message||'房間已關閉');location.href='/';});

// One stable, hand-tuned map for every room (a "season" course, like the
// real DLD). Bump the constant to ship a new map for all rooms at once.
function startGame(seed,durationSec,startedAt,resume){
  clearInterval(roomsTimer); show('gameScreen');
  const course=buildCourse(seed); const report=validateCourse(course);
  if(!report.ok) console.error('[game-v2] invalid course',report);
  startMeta={...(startMeta||{}),seed,durationSec,startedAt:startedAt||Date.now(),course};
  if(phaserGame)phaserGame.destroy(true);
  const hooks={
    name:me.name||'Koko', energy:resume?.energy??40, progress:resume?.bestProgress??resume?.bestHeight??0,
    isFrozen:()=>frozen,
    onSound:type=>gameAudio.play(type),
    onCheckpoint:cp=>toast(`🏁 已到達${cp.zoneName}檢查點`,true),
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
    onFinish:()=>{socket.emit('player:summit');toast('🏆 登頂成功！',true);},
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
  $('energyFill').style.width=`${state.energy}%`; $('energyFill').classList.toggle('low',state.energy<20); $('energyText').textContent=Math.round(state.energy);
  if(!preview&&now-lastNet>120){lastNet=now;socket.volatile.emit('player:state',state);}
}

function bindHold(id,action){
  const el=$(id); const on=e=>{e.preventDefault();scene?.setAction(action,true);}; const off=e=>{e?.preventDefault();scene?.setAction(action,false);};
  el.addEventListener('pointerdown',on);el.addEventListener('pointerup',off);el.addEventListener('pointercancel',off);el.addEventListener('pointerleave',off);
}
bindHold('btnLeft','left');bindHold('btnDown','down');bindHold('btnRight','right');bindHold('btnJump','jump');
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
  if(preview)return applyAnswer({correct:choice===2,correctChoice:2,gain:30,energy:Math.min(100,(lastFrame?.energy||40)+30),streak:1},choice,buttons);
  socket.emit('player:answer',{choice},res=>{if(!res?.ok)return closeQuestion();applyAnswer(res,choice,buttons);});
}
function applyAnswer(res,choice,buttons){
  gameAudio.play(res.correct?'correct':'wrong');
  buttons[choice]?.classList.add(res.correct?'correct':'wrong');if(!res.correct)buttons[res.correctChoice]?.classList.add('correct');
  const fb=$('qFeedback');fb.textContent=res.correct?`答啱喇！能量 +${res.gain} ⚡`:'差少少，再試下一題！';fb.classList.add(res.correct?'good':'bad');scene.setEnergy(res.energy);
  if(res.correct)setTimeout(closeQuestion,800);else $('qClose').style.display='';
}
function closeQuestion(){
  $('qOverlay').classList.remove('open');frozen=false;scene?.resumeControl();
  if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  $('gameCanvas').focus({preventScroll:true});
}

function toast(message,gold=false){const el=document.createElement('div');el.className=`toast${gold?' gold':''}`;el.textContent=message;$('toasts').appendChild(el);setTimeout(()=>el.remove(),2700);}
function showResults(leaderboard){
  phaserGame?.destroy(true);phaserGame=null;scene=null;const list=$('resultsList');list.innerHTML='';
  leaderboard.forEach(row=>{const d=document.createElement('div');d.className=`result-row${row.rank<=3?` top${row.rank}`:''}`;d.innerHTML=`<div class="rank">${['🥇','🥈','🥉'][row.rank-1]||row.rank}</div><div class="name">${escapeHtml(row.name)}${row.finished?' 🏁':''}</div><div class="stat">✓${row.correct} ✗${row.wrong}</div><div class="height">${Math.round((row.bestProgress??row.bestHeight??0)*100)}%</div>`;list.appendChild(d);});
  $('resultEmoji').textContent='🏆';$('resultSub').textContent='今次攀登完成！';show('resultScreen');
}

if(preview){me={name:'Koko',studentId:'preview'};startGame(20260711,480,Date.now(),null);}else startRoomPolling();
