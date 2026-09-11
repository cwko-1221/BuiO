
// iOS has ignored user-scalable=no since iOS 10, and touch-action: manipulation still permits
// pinch — it only removes the double-tap zoom delay. Refusing the WebKit gesture events is the
// only reliable way to decline a pinch, and it matters beyond appearance: once iOS claims the
// touch stream for a zoom, a control holding a finger may never receive touchend, leaving it
// stuck down.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => event.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

import { ABILITIES, DIFFICULTIES, MAPS, TOWERS, WORLD, towerStats } from './content.js?v=20260809-path-grid-1';
import { TowerDefenseSimulation } from './simulation.js?v=20260809-path-grid-1';
import { BattleScene } from './BattleScene.js?v=20260809-path-grid-1';
import { CrystalAudio } from './audio.js?v=20260802-2';
import { MAP_ART, MAP_THUMB, TOWER_ART, atlasPosition } from './assets.js?v=20260817-thumbs';

const $=id=>document.getElementById(id);
const previewRoute=location.pathname.endsWith('/preview');
const launchParams=new URLSearchParams(location.search);
const classroomPreview=previewRoute&&launchParams.has('classroom');
const autoJoinRoom=launchParams.get('autojoin')==='1'?launchParams.get('room'):null;
const preview=previewRoute&&!classroomPreview;
const socket=preview?null:io('/tower-defense');
const audio=new CrystalAudio();
const towerOrder=['bolt','cannon','frost','storm','prism','beacon'];
const mapOrder=['starport','moonwood','embercore'];
const { t, server: serverText, lang: uiLang, locale } = window.BuiI18n;
const targetNames={first:t('td.targetFirst'),last:t('td.targetLast'),strongest:t('td.targetStrongest'),weakest:t('td.targetWeakest')};
const profileKey='buio-crystal-bastion-profile-v1';
let profile=loadProfile();
let selectedMap=null;
let me={name:t('td.studentFallback'),studentId:null};
let classroom=preview?{code:null,hostName:t('td.previewMode'),setTitle:t('td.defaultBank'),phase:'preview'}:null;
let roomsTimer=null,joining=false,classroomStarted=false,lastClassroomStateAt=0;
let simulation=null,scene=null,phaserGame=null,questionSessionId=null;
let selectedTowerId=null,panelSignature='',questionTimer=null,questionDeadline=0,activeQuestion=null,answering=false;
let lastHudSignature='',lastSoundAt=new Map(),modalWasPaused=false;

function loadProfile(){
  try{
    const parsed=JSON.parse(localStorage.getItem(profileKey)||'{}');
    return {unlocked:Array.isArray(parsed.unlocked)&&parsed.unlocked.length?parsed.unlocked:['starport'],completed:Array.isArray(parsed.completed)?parsed.completed:[],bestScores:parsed.bestScores&&typeof parsed.bestScores==='object'?parsed.bestScores:{},totalCorrect:Number(parsed.totalCorrect)||0};
  }catch{return{unlocked:['starport'],completed:[],bestScores:{},totalCorrect:0};}
}

function saveProfile(){localStorage.setItem(profileKey,JSON.stringify(profile));}
function showScreen(id){document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));}
function requestHeaders(){return previewRoute?{'x-buio-preview':'1'}:{};}

async function api(path,{method='GET',body}={}){
  const response=await fetch(`/api/tower-defense${path}`,{method,credentials:'include',headers:{...requestHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({success:false,message:t('td.badResponse')}));
  if(!response.ok||data.success===false)throw new Error(serverText(data.message)||t('td.connectFailed'));
  return data;
}

function renderMenu(){
  $('mapSelector').innerHTML=mapOrder.map((id,index)=>{
    const map=MAPS[id],color=`#${map.palette.accent.toString(16).padStart(6,'0')}`;
    return `<button class="map-card ${selectedMap===id?'selected':''}" data-map="${id}" style="--map-color:${color}33;--map-image:url('${MAP_THUMB[id]}')"><span class="map-number">SECTOR ${String(index+1).padStart(2,'0')}</span><span class="route-badge">${t('td.entrances',{count:map.paths.length})}</span><b>${map.name}</b><small>${map.subtitle}</small></button>`;
  }).join('');
  const best=Object.values(profile.bestScores);const highest=best.length?Math.max(...best):0;
  $('campaignRecord').innerHTML=t('td.campaignRecord',{done:profile.completed.length,best:highest.toLocaleString(locale),correct:profile.totalCorrect});
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>selectBattlefield(button.dataset.map)));
}

async function loadIdentity(){
  try{
    const response=await fetch('/api/auth/me',{credentials:'include'});
    if(!response.ok)return;
    const user=(await response.json())?.student;
    if(user?.name)me={name:user.name,studentId:user.id||null};
  }catch{}
}

function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

// The Chinese honorific trails the name; English has no equivalent to append.
function teacherLabel(name){
  const value=String(name||t('td.teacherFallback'));
  if(uiLang!=='zh-HK')return value;
  return value.endsWith('老師')?value:`${value}老師`;
}

async function loadRooms(){
  if(preview||joining)return;
  try{
    const response=await fetch('/api/tower-defense/sessions',{credentials:'include',headers:requestHeaders()});
    const data=await response.json();
    const list=$('roomList');
    if(!data.sessions?.length){list.innerHTML=`<div class="room-empty"><i></i>${escapeHtml(t('td.roomsEmpty'))}</div>`;return;}
    list.innerHTML=data.sessions.map(room=>`<button class="classroom-room" data-room="${room.code}"><span class="room-sigil">◇</span><span><b>${escapeHtml(teacherLabel(room.hostName))}</b><small>${escapeHtml(t('td.roomMeta',{title:room.setTitle,players:room.players}))}</small></span><em>${escapeHtml(t(room.phase==='lobby'?'td.phaseLobby':'td.phaseLive'))}</em></button>`).join('');
    document.querySelectorAll('[data-room]').forEach(button=>button.addEventListener('click',()=>joinRoom(button.dataset.room)));
  }catch{$('roomList').innerHTML=`<div class="room-empty error">${escapeHtml(t('td.roomsFailed'))}</div>`;}
}

async function joinRoom(code){
  if(joining||!socket)return;joining=true;$('joinError').textContent='';await loadIdentity();
  socket.emit('player:join',{code,name:me.name,studentId:me.studentId},response=>{
    joining=false;
    if(!response?.ok){$('joinError').textContent=serverText(response?.message)||t('td.joinFailed');loadRooms();return;}
    clearInterval(roomsTimer);
    classroom={code:response.code,hostName:response.hostName,setTitle:response.setTitle,phase:response.phase};
    classroomStarted=response.phase==='playing';selectedMap=response.mapId||null;
    $('classroomHost').textContent=teacherLabel(response.hostName);$('classroomSet').textContent=response.setTitle;
    $('deploymentStatus').textContent=t(classroomStarted?'td.pickThenDeploy':'td.pickFirst');
    showScreen('menuScreen');renderMenu();
    if(classroomStarted&&selectedMap)startCampaign();
  });
}

function selectBattlefield(mapId){
  if(!MAPS[mapId]||simulation)return;
  selectedMap=mapId;renderMenu();audio.sfx('ui');
  if(preview){
    const button=$('startCampaignBtn');button.disabled=false;button.classList.remove('classroom-wait');button.querySelector('span').textContent=t('td.previewThisMap');$('deploymentStatus').textContent=t('td.previewLead');
    return;
  }
  $('deploymentStatus').textContent=t('td.syncingMap');
  socket.emit('player:select-map',{mapId},response=>{
    if(!response?.ok){selectedMap=null;renderMenu();$('deploymentStatus').textContent=serverText(response?.message)||t('td.mapPickFailed');return;}
    $('deploymentStatus').textContent=t(response.shouldStart?'td.deploying':'td.readyWaiting');
    if(response.shouldStart)startCampaign();
  });
}

function renderTowerDock(){
  $('towerCards').innerHTML=towerOrder.map((id,index)=>{const tower=TOWERS[id],color=`#${tower.color.toString(16).padStart(6,'0')}`,position=atlasPosition(TOWER_ART.frames[id],TOWER_ART.columns,TOWER_ART.rows);return `<button class="tower-card" data-tower="${id}" style="--tower-color:${color}" title="${tower.description}"><kbd>${index+1}</kbd><span class="tower-portrait" style="--sprite-x:${position.x}%;--sprite-y:${position.y}%"></span><b>${tower.name}</b><small><span>${tower.role}</span><strong>● ${tower.cost}</strong></small></button>`;}).join('');
  document.querySelectorAll('[data-tower]').forEach(bindTowerCard);
}

function clientToWorld(clientX,clientY){
  const canvas=$('gameCanvas').querySelector('canvas');if(!canvas)return null;
  const rect=canvas.getBoundingClientRect();
  if(clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return null;
  return {x:(clientX-rect.left)*WORLD.width/rect.width,y:(clientY-rect.top)*WORLD.height/rect.height};
}

function bindTowerCard(button){
  let drag=null,suppressClick=false;
  button.draggable=true;
  button.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}selectBuildTower(button.dataset.tower);});
  button.addEventListener('dragstart',event=>{
    if(!simulation||!scene){event.preventDefault();return;}
    scene.setPlacement(button.dataset.tower);
    document.querySelectorAll('[data-tower]').forEach(card=>card.classList.toggle('selected',card===button));
    event.dataTransfer?.setData('text/plain',button.dataset.tower);if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';
  });
  button.addEventListener('dragend',()=>scene?.setPlacementPointer(0,0,false));
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||!simulation||!scene)return;
    drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,active:false};
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>7){
      drag.active=true;scene.setPlacement(button.dataset.tower);
      document.querySelectorAll('[data-tower]').forEach(card=>card.classList.toggle('selected',card===button));
    }
    if(!drag.active)return;
    const point=clientToWorld(event.clientX,event.clientY);scene.setPlacementPointer(point?.x||0,point?.y||0,!!point);
  });
  button.addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    if(drag.active){
      suppressClick=true;const point=clientToWorld(event.clientX,event.clientY);
      if(point){scene.setPlacementPointer(point.x,point.y,true);scene.handleWorldClick(point.x,point.y);}
      else scene.setPlacementPointer(0,0,false);
      setTimeout(()=>{suppressClick=false;},0);
    }
    drag=null;
  });
  button.addEventListener('pointercancel',()=>{if(drag?.active)scene?.setPlacementPointer(0,0,false);drag=null;});
}

async function startCampaign(){
  if(!selectedMap||(!preview&&!classroomStarted))return;
  const button=$('startCampaignBtn');button.disabled=true;button.querySelector('span').textContent=t('td.syncingBank');
  try{
    await audio.unlock();
    const response=await api('/session',{method:'POST',body:{roomCode:classroom?.code||undefined}});
    questionSessionId=response.sessionId;
    teardownGame();
    simulation=new TowerDefenseSimulation({mapId:selectedMap,seed:Date.now()});
    showScreen('gameScreen');
    $('mapChapter').textContent=t('td.chapterTier',{chapter:MAPS[selectedMap].chapter,tier:DIFFICULTIES.guardian.name});
    $('mapName').textContent=MAPS[selectedMap].name;
    const battleScene=new BattleScene(simulation,{
      onReady:readyScene=>{scene=readyScene;},
      onState:updateHud,
      onEvent:handleGameEvent,
      onTowerSelected:tower=>{selectedTowerId=tower?.id||null;document.querySelectorAll('[data-tower]').forEach(button=>button.classList.remove('selected'));renderTowerPanel(tower,true);},
      onActionResult:handleActionResult,
    });
    phaserGame=new Phaser.Game({
      type:Phaser.AUTO,parent:'gameCanvas',width:1280,height:720,transparent:true,
      scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:1280,height:720},
      render:{antialias:true,roundPixels:false,pixelArt:false},scene:[battleScene],fps:{target:60,min:30},
    });
    audio.startMusic(MAPS[selectedMap].weather);
    emitClassroomState('playing',true);
    updateHud(simulation.state,true);showBanner(t('td.mapBanner',{map:MAPS[selectedMap].name,lanes:MAPS[selectedMap].paths.length}));showToast(t('td.bankToast',{title:response.set.title}),'success');
  }catch(error){console.error('[tower-defense] unable to start campaign',error);window.__towerDefense.lastError=error.message;showToast(error.message,'error');showScreen('menuScreen');}
  finally{if(preview){button.disabled=false;button.querySelector('span').textContent=t('td.previewThisMap');}}
}

function teardownGame(){
  clearInterval(questionTimer);questionTimer=null;activeQuestion=null;answering=false;
  $('questionPanel').classList.remove('open');$('endModal').classList.remove('open');$('towerPanel').classList.remove('open');
  if(phaserGame){phaserGame.destroy(true);phaserGame=null;}scene=null;simulation=null;selectedTowerId=null;panelSignature='';lastHudSignature='';
  audio.stopMusic();
}

function selectBuildTower(id){
  if(!simulation||!scene)return;
  const selecting=scene.placementType===id?null:id;scene.setPlacement(selecting);
  document.querySelectorAll('[data-tower]').forEach(button=>button.classList.toggle('selected',button.dataset.tower===selecting));
  if(selecting){audio.sfx('ui');showToast(t('td.placeHint',{tower:TOWERS[id].name}));}
}

function emitClassroomState(status='playing',force=false){
  if(!socket||!simulation)return;
  const now=performance.now();if(!force&&now-lastClassroomStateAt<750)return;lastClassroomStateAt=now;
  const state=simulation.state;
  socket.emit('player:state',{status,wave:state.wave,score:state.score,quizCorrect:state.stats.quizCorrect,quizAnswered:state.stats.quizAnswered});
}

function updateHud(state,force=false){
  const signature=[state.lives,Math.floor(state.gold),state.wave,state.score,Math.floor(state.focus),state.phase,state.paused,state.speed,state.enemies.length,Math.ceil(state.buildCountdown),state.quizKeys,state.answersRequired,state.autoStartWaiting,state.stasisTime.toFixed(1),state.overdriveTime.toFixed(1),...Object.values(state.abilities).map(value=>value.toFixed(1))].join(':');
  if(!force&&signature===lastHudSignature)return;lastHudSignature=signature;
  $('livesValue').textContent=state.lives;$('goldValue').textContent=Math.floor(state.gold);$('waveValue').textContent=state.wave;$('scoreValue').textContent=Math.floor(state.score).toLocaleString('zh-HK');$('focusValue').textContent=Math.floor(state.focus);$('focusFill').style.width=`${state.focus}%`;
  $('pauseBtn').textContent=state.paused?'▶':'Ⅱ';$('speedBtn').textContent=`${state.speed}×`;
  const waveButton=$('nextWaveBtn');
  const quizReady=state.quizKeys>=state.answersRequired,seconds=Math.ceil(state.buildCountdown);
  waveButton.classList.toggle('quiz-required',state.phase==='build'&&!quizReady);
  if(state.phase==='build'){waveButton.disabled=!quizReady;waveButton.querySelector('b').textContent=quizReady?t('td.startWave',{wave:state.wave+1}):t('td.needAnswers',{have:state.quizKeys,need:state.answersRequired});waveButton.querySelector('span').textContent=seconds>0?`${seconds}`:'!';waveButton.querySelector('small').textContent=seconds>0?t('td.autoStartIn'):state.autoStartWaiting?t('td.awaitKeys'):'Space';}
  else if(state.phase==='wave'){waveButton.disabled=true;waveButton.querySelector('b').textContent=t('td.incoming',{count:state.enemies.length+simulation.waveQueue.length});waveButton.querySelector('span').textContent='⚔';}
  else{waveButton.disabled=true;waveButton.querySelector('b').textContent=t(state.phase==='won'?'td.campaignWon':'td.coreLost');}
  const quizButton=$('quizBtn');quizButton.classList.toggle('required',state.phase==='build'&&!quizReady);quizButton.querySelector('small').textContent=quizReady?t('td.quizReady'):t('td.quizNeed',{have:state.quizKeys,need:state.answersRequired});
  document.querySelectorAll('[data-tower]').forEach(button=>button.classList.toggle('unaffordable',state.gold<TOWERS[button.dataset.tower].cost));
  for(const button of document.querySelectorAll('[data-ability]')){
    const id=button.dataset.ability,ability=ABILITIES[id],cooldown=state.abilities[id];
    button.disabled=state.phase!=='wave'||state.focus<ability.cost||cooldown>0;
    button.querySelector('i').style.height=`${Math.min(100,cooldown/ability.cooldown*100)}%`;
    button.querySelector('b').textContent=cooldown>0?`${Math.ceil(cooldown)}s`:ability.cost;
  }
  const tower=state.towers.find(item=>item.id===selectedTowerId);if(tower)renderTowerPanel(tower);
  emitClassroomState(['won','lost'].includes(state.phase)?state.phase:'playing');
}

function renderTowerPanel(tower,force=false){
  const panel=$('towerPanel');
  if(!tower){panel.classList.remove('open');panelSignature='';return;}
  const definition=TOWERS[tower.type],stats=towerStats(tower),maxed=tower.level>=definition.levels.length,nextCost=maxed?0:definition.upgradeCosts[tower.level-1];
  const signature=[tower.id,tower.level,tower.targetMode,Math.floor(simulation.state.gold),Math.floor(tower.damage),tower.kills].join(':');if(!force&&signature===panelSignature)return;panelSignature=signature;
  const color=`#${definition.color.toString(16).padStart(6,'0')}`,spritePosition=atlasPosition(TOWER_ART.frames[tower.type],TOWER_ART.columns,TOWER_ART.rows);
  panel.style.setProperty('--tower-color',color);panel.classList.add('open');
  panel.innerHTML=`<div class="tower-panel-head"><span class="tower-panel-icon tower-panel-render" style="--sprite-x:${spritePosition.x}%;--sprite-y:${spritePosition.y}%"></span><div><b>${definition.name}</b><small>Lv.${tower.level} · ${stats.name}</small></div><button class="panel-close" id="towerPanelClose">×</button></div><p class="tower-description">${definition.description}</p><div class="tower-stats"><div><span>${t('td.statDamage')}</span><b>${Math.round(stats.damage)}</b></div><div><span>${t('td.statRange')}</span><b>${Math.round(stats.range)}</b></div><div><span>${t('td.statRate')}</span><b>${(1/stats.cooldown).toFixed(1)}/s</b></div></div><label class="target-field">${t('td.targetPriority')}<select id="targetModeSelect">${Object.entries(targetNames).map(([id,name])=>`<option value="${id}" ${tower.targetMode===id?'selected':''}>${name}</option>`).join('')}</select></label><div class="tower-actions"><button class="upgrade-button" id="upgradeTowerBtn" ${maxed||simulation.state.gold<nextCost?'disabled':''}>${maxed?t('td.maxLevel'):t('td.upgradeFor',{cost:nextCost})}</button><button class="sell-button" id="sellTowerBtn">${t('td.sellFor',{value:Math.floor(tower.totalSpent*.7)})}</button></div><div class="tower-record"><span>${t('td.towerKills',{count:tower.kills})}</span><span>${t('td.towerDamage',{total:Math.floor(tower.damage).toLocaleString(locale)})}</span></div>`;
  $('towerPanelClose').onclick=()=>scene?.selectTower(null);
  $('targetModeSelect').onchange=event=>simulation.setTargetMode(tower.id,event.target.value);
  $('upgradeTowerBtn').onclick=()=>handleActionResult(simulation.upgradeTower(tower.id));
  $('sellTowerBtn').onclick=()=>{const result=simulation.sellTower(tower.id);handleActionResult(result);if(result.ok)scene?.selectTower(null);};
}

function handleActionResult(result){
  if(!result?.ok){showToast(result?.reason||t('td.actionFailed'),'error');return;}
  if(result.refund)showToast(t('td.refunded',{amount:result.refund}),'success');
  if(result.tower?.level>1)renderTowerPanel(result.tower,true);
}

function handleGameEvent(event){
  const soundMap={towerBuilt:'build',towerUpgraded:'upgrade',towerSold:'sell',enemyKilled:'kill',enemyEscaped:'leak',waveStarted:'wave',waveComplete:'waveClear'};
  if(event.type==='shot')playThrottled(TOWERS[event.towerType].attack==='rocket'?'rocket':TOWERS[event.towerType].attack,65);
  else if(event.type==='flame')playThrottled('flame',130);else if(event.type==='frostField')playThrottled('frost',140);else if(event.type==='chain')playThrottled('chain',90);else if(event.type==='beam')playThrottled('beam',100);else if(event.type==='pulse')playThrottled('pulse',180);
  else if(soundMap[event.type])audio.sfx(soundMap[event.type]);
  if(event.type==='waveStarted')showBanner(t('td.waveBanner',{wave:event.wave,entrances:event.entrances,auto:event.auto?t('td.waveAuto'):''}));
  if(event.type==='waveComplete'){showBanner(t('td.waveDone',{wave:event.wave}));showToast(t('td.waveDoneHint'),'success');}
  if(event.type==='quizRequired'){showBanner(t('td.waveWaiting',{wave:event.wave,have:event.quizKeys,need:event.answersRequired}));showToast(t('td.waveWaitingHint',{count:event.answersRequired-event.quizKeys}),'error');}
  if(event.type==='enemyEscaped')showToast(t('td.coreDamaged',{damage:event.damage}),'error');
  if(event.type==='ability')audio.sfx(event.id);
  if(event.type==='ability')document.querySelectorAll('[data-ability]').forEach(button=>button.classList.remove('targeting'));
  if(event.type==='bossPulse')playThrottled('boss',1500);
  if(event.type==='gameOver')finishCampaign(event.won);
}

function playThrottled(name,interval){const now=performance.now();if(now-(lastSoundAt.get(name)||0)<interval)return;lastSoundAt.set(name,now);audio.sfx(name);}
function showBanner(text){const banner=$('waveBanner');banner.textContent=text;banner.classList.remove('show');void banner.offsetWidth;banner.classList.add('show');}
function showToast(message,type=''){const toast=document.createElement('div');toast.className=`toast ${type}`;toast.textContent=message;$('toastStack').append(toast);setTimeout(()=>toast.remove(),2600);}

function beginWave(){if(!simulation)return;const result=simulation.startWave();handleActionResult(result);}
function togglePause(){if(!simulation)return;simulation.togglePause();updateHud(simulation.state,true);audio.sfx('ui');}
function cycleSpeed(){if(!simulation)return;simulation.setSpeed(simulation.state.speed===1?2:simulation.state.speed===2?3:1);updateHud(simulation.state,true);audio.sfx('ui');}

async function openQuestion(){
  if(!simulation||!questionSessionId||$('questionPanel').classList.contains('open'))return;
  await audio.unlock();$('questionPanel').classList.add('open');$('questionPrompt').textContent=t('td.quizFetching');$('questionChoices').innerHTML='';$('questionFeedback').textContent='';answering=false;
  try{
    const data=await api('/question',{method:'POST',body:{sessionId:questionSessionId}});activeQuestion=data.question;questionDeadline=activeQuestion.expiresAt;
    $('questionPrompt').textContent=activeQuestion.prompt;$('questionReward').textContent=t('td.quizReward',{coins:Math.floor(activeQuestion.baseReward*simulation.quizRules.quizGoldMultiplier)});
    $('questionChoices').innerHTML=activeQuestion.choices.map((choice,index)=>`<button class="choice-button" data-choice="${index}"><span>${String.fromCharCode(65+index)}</span>${escapeHtml(choice)}</button>`).join('');
    document.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>answerQuestion(Number(button.dataset.choice))));
    clearInterval(questionTimer);questionTimer=setInterval(updateQuestionTimer,100);updateQuestionTimer();
  }catch(error){showToast(error.message,'error');closeQuestion();}
}

function updateQuestionTimer(){
  if(!activeQuestion)return;const remaining=Math.max(0,questionDeadline-Date.now()),seconds=Math.ceil(remaining/1000);$('questionSeconds').textContent=seconds;$('questionTimerRing').style.strokeDashoffset=String(107*(1-remaining/20000));if(remaining<=0&&!answering)answerQuestion(-1);
}

async function answerQuestion(index){
  if(answering||!activeQuestion)return;answering=true;clearInterval(questionTimer);document.querySelectorAll('[data-choice]').forEach(button=>button.disabled=true);
  try{
    const data=await api('/answer',{method:'POST',body:{sessionId:questionSessionId,token:activeQuestion.token,answerIndex:index}});
    document.querySelectorAll('[data-choice]').forEach((button,choiceIndex)=>{if(choiceIndex===data.correctIndex)button.classList.add('correct');else if(choiceIndex===index)button.classList.add('wrong');});
    const feedback=$('questionFeedback');feedback.className=`question-feedback ${data.correct?'correct':'wrong'}`;
    if(data.correct){const granted=simulation.grantQuizReward(data);profile.totalCorrect++;saveProfile();feedback.textContent=t('td.quizCorrect',{coins:granted,have:simulation.state.quizKeys,need:simulation.state.answersRequired});audio.sfx('correct');$('quizStreak').textContent=data.streak>1?t('td.quizStreak',{count:data.streak}):'';}
    else{simulation.grantQuizReward(data);feedback.textContent=t(data.timedOut?'td.quizTimeout':'td.quizWrong');audio.sfx('wrong');$('quizStreak').textContent='';}
    setTimeout(closeQuestion,1250);
  }catch(error){showToast(error.message,'error');setTimeout(closeQuestion,500);}
}

function closeQuestion(){clearInterval(questionTimer);questionTimer=null;activeQuestion=null;answering=false;$('questionPanel').classList.remove('open');}

function useAbility(id){
  if(!simulation||!scene)return;
  if(id==='meteor'){
    if(simulation.state.focus<ABILITIES[id].cost||simulation.state.abilities[id]>0)return;
    scene.setAbilityTarget(scene.abilityTarget===id?null:id);document.querySelectorAll('[data-ability]').forEach(button=>button.classList.toggle('targeting',button.dataset.ability===scene.abilityTarget));if(scene.abilityTarget)showToast(t('td.abilityAim'));
  }else handleActionResult(simulation.useAbility(id));
}

function finishCampaign(won){
  audio.sfx(won?'win':'lose');const state=simulation.state,map=MAPS[state.mapId];
  if(won){if(!profile.completed.includes(map.id))profile.completed.push(map.id);const next=mapOrder[mapOrder.indexOf(map.id)+1];if(next&&!profile.unlocked.includes(next))profile.unlocked.push(next);}
  const scoreKey=`${state.mapId}:${state.difficulty}`;profile.bestScores[scoreKey]=Math.max(profile.bestScores[scoreKey]||0,state.score);saveProfile();
  $('endSeal').textContent=won?'◇':'◆';$('endSeal').style.filter=won?'none':'hue-rotate(140deg) saturate(1.4)';$('endEyebrow').textContent=t(won?'td.campaignWon':'td.endEyebrowLost');$('endTitle').textContent=t(won?'td.endTitleWon':'td.endTitleLost');$('endDescription').textContent=won?t('td.endWonBody',{map:map.name}):t('td.endLostBody',{wave:state.wave});
  $('resultStats').innerHTML=`<div><b>${state.score.toLocaleString(locale)}</b><span>${t('td.resultScore')}</span></div><div><b>${state.stats.kills}</b><span>${t('td.resultKills')}</span></div><div><b>${state.stats.quizCorrect}/${state.stats.quizAnswered}</b><span>${t('td.resultQuiz')}</span></div><div><b>${Math.floor(state.stats.damage).toLocaleString(locale)}</b><span>${t('td.resultDamage')}</span></div>`;
  emitClassroomState(won?'won':'lost',true);
  $('endModal').classList.add('open');
}

function returnToCampaign(){
  teardownGame();
  if(!preview){location.href='/';return;}
  showScreen('menuScreen');renderMenu();
}

function bindUi(){
  $('startCampaignBtn').addEventListener('click',startCampaign);$('nextWaveBtn').addEventListener('click',beginWave);$('pauseBtn').addEventListener('click',togglePause);$('speedBtn').addEventListener('click',cycleSpeed);$('quizBtn').addEventListener('click',openQuestion);$('helpBtn').addEventListener('click',()=>{modalWasPaused=!!simulation?.state.paused;$('helpModal').classList.add('open');simulation?.togglePause(true);});
  $('exitBtn').addEventListener('click',()=>{if(confirm(t('td.confirmExit')))returnToCampaign();});
  $('retryBtn').addEventListener('click',()=>{selectedMap=simulation.state.mapId;startCampaign();});$('campaignBtn').addEventListener('click',returnToCampaign);
  document.querySelectorAll('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>{const modal=$(button.dataset.closeModal);modal.classList.remove('open');if(simulation&&!modalWasPaused)simulation.togglePause(false);}));
  document.querySelectorAll('[data-ability]').forEach(button=>button.addEventListener('click',()=>useAbility(button.dataset.ability)));
  $('gameCanvas').addEventListener('dragover',event=>{
    if(!scene?.placementType)return;event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
    const point=clientToWorld(event.clientX,event.clientY);scene.setPlacementPointer(point?.x||0,point?.y||0,!!point);
  });
  $('gameCanvas').addEventListener('drop',event=>{
    if(!scene?.placementType)return;event.preventDefault();
    const point=clientToWorld(event.clientX,event.clientY);
    if(point){scene.setPlacementPointer(point.x,point.y,true);scene.handleWorldClick(point.x,point.y);}
  });
  const toggleAudio=async()=>{await audio.unlock();const muted=audio.toggle();$('audioBtn').textContent=$('menuAudioBtn').textContent=muted?'×':'♪';};$('audioBtn').addEventListener('click',toggleAudio);$('menuAudioBtn').addEventListener('click',toggleAudio);
  document.addEventListener('keydown',event=>{
    if(!$('gameScreen').classList.contains('active'))return;
    if($('questionPanel').classList.contains('open')){const index=['a','b','c','d'].indexOf(event.key.toLowerCase());if(index>=0)answerQuestion(index);return;}
    if(event.key>='1'&&event.key<='6')selectBuildTower(towerOrder[Number(event.key)-1]);
    else if(event.code==='Space'){event.preventDefault();beginWave();}
    else if(event.key.toLowerCase()==='q')openQuestion();
    else if(event.key.toLowerCase()==='p')togglePause();
    else if(event.key.toLowerCase()==='f')cycleSpeed();
    else if(event.key==='Escape'){scene?.setPlacement(null);scene?.setAbilityTarget(null);scene?.selectTower(null);document.querySelectorAll('[data-tower],[data-ability]').forEach(button=>button.classList.remove('selected','targeting'));}
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden||!simulation||!$('gameScreen').classList.contains('active')||['won','lost'].includes(simulation.state.phase))return;
    if(!simulation.state.paused){simulation.togglePause(true);updateHud(simulation.state,true);showToast(t('td.autoPaused'));}
  });
}

if(socket){
  socket.on('classroom:start',payload=>{
    classroomStarted=true;if(classroom)classroom.phase='playing';
    if(selectedMap)startCampaign();else $('deploymentStatus').textContent=t('td.startedPickNow');
  });
  socket.on('classroom:ended',()=>{
    if(!simulation){location.href='/';return;}
    simulation.togglePause(true);emitClassroomState(simulation.state.phase==='won'?'won':'playing',true);
    $('endEyebrow').textContent=t('td.classEnded');$('endTitle').textContent=t('td.classEndedTitle');$('endDescription').textContent=t('td.classEndedBody');
    $('endModal').classList.add('open');
  });
  socket.on('classroom:closed',({message})=>{alert(serverText(message)||t('td.roomClosed'));location.href='/';});
}

renderMenu();renderTowerDock();bindUi();
if(preview){
  showScreen('menuScreen');$('retryBtn').hidden=false;
}else{
  $('retryBtn').hidden=true;
  loadIdentity().then(()=>{
    if(autoJoinRoom)joinRoom(autoJoinRoom);
    else{loadRooms();roomsTimer=setInterval(loadRooms,3000);}
  });
}
window.__towerDefense={
  get simulation(){return simulation;},
  get scene(){return scene;},
  get audioState(){return {contextState:audio.context?.state||'unavailable',muted:audio.muted,musicActive:!!audio.musicTimer};},
  startCampaign,openQuestion,profile,preview,classroomPreview,get classroom(){return classroom;},selectBattlefield,
};
