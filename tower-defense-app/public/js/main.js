import { ABILITIES, DIFFICULTIES, MAPS, TOWERS, towerStats } from './content.js?v=20260802-2';
import { TowerDefenseSimulation } from './simulation.js?v=20260802-2';
import { BattleScene } from './BattleScene.js?v=20260802-4';
import { CrystalAudio } from './audio.js?v=20260802-2';
import { MAP_ART, TOWER_ART, atlasPosition } from './assets.js?v=20260802-1';

const $=id=>document.getElementById(id);
const preview=location.pathname.endsWith('/preview');
const audio=new CrystalAudio();
const towerOrder=['bolt','cannon','frost','storm','prism','beacon'];
const mapOrder=['starport','moonwood','embercore'];
const targetNames={first:'最前',last:'最後',strongest:'最強',weakest:'最弱'};
const profileKey='buio-crystal-bastion-profile-v1';
let profile=loadProfile();
let selectedMap='starport',selectedDifficulty='guardian';
let simulation=null,scene=null,phaserGame=null,questionSessionId=null;
let selectedTowerId=null,panelSignature='',questionTimer=null,questionDeadline=0,activeQuestion=null,answering=false,quizWasPaused=false;
let lastHudSignature='',lastSoundAt=new Map(),modalWasPaused=false;

function loadProfile(){
  try{
    const parsed=JSON.parse(localStorage.getItem(profileKey)||'{}');
    return {unlocked:Array.isArray(parsed.unlocked)&&parsed.unlocked.length?parsed.unlocked:['starport'],completed:Array.isArray(parsed.completed)?parsed.completed:[],bestScores:parsed.bestScores&&typeof parsed.bestScores==='object'?parsed.bestScores:{},totalCorrect:Number(parsed.totalCorrect)||0};
  }catch{return{unlocked:['starport'],completed:[],bestScores:{},totalCorrect:0};}
}

function saveProfile(){localStorage.setItem(profileKey,JSON.stringify(profile));}
function showScreen(id){document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));}
function requestHeaders(){return preview?{'x-buio-preview':'1'}:{};}

async function api(path,{method='GET',body}={}){
  const response=await fetch(`/api/tower-defense${path}`,{method,credentials:'include',headers:{...requestHeaders(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({success:false,message:'伺服器回應格式不正確。'}));
  if(!response.ok||data.success===false)throw new Error(data.message||'連線失敗。');
  return data;
}

function renderMenu(){
  $('mapSelector').innerHTML=mapOrder.map((id,index)=>{
    const map=MAPS[id],color=`#${map.palette.accent.toString(16).padStart(6,'0')}`;
    return `<button class="map-card ${selectedMap===id?'selected':''}" data-map="${id}" style="--map-color:${color}33;--map-image:url('${MAP_ART[id]}')"><span class="map-number">SECTOR ${String(index+1).padStart(2,'0')}</span><span class="route-badge">${map.paths.length} 個入口</span><b>${map.name}</b><small>${map.subtitle}</small></button>`;
  }).join('');
  const best=Object.values(profile.bestScores);const highest=best.length?Math.max(...best):0;
  $('campaignRecord').innerHTML=`戰役進度 <b>${profile.completed.length}/3</b> · 最高分 <b>${highest.toLocaleString('zh-HK')}</b> · 累積答對 <b>${profile.totalCorrect}</b>`;
  document.querySelectorAll('[data-map]').forEach(button=>button.addEventListener('click',()=>{selectedMap=button.dataset.map;renderMenu();audio.sfx('ui');}));
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.classList.toggle('selected',button.dataset.difficulty===selectedDifficulty));
}

async function loadQuestionSets(){
  try{
    const data=await api('/sets');
    $('questionSetSelect').innerHTML=data.sets.map(set=>`<option value="${escapeHtml(set.id)}">${escapeHtml(set.title)} · ${set.questionCount} 題</option>`).join('');
  }catch(error){showToast(error.message,'error');}
}

function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}

function renderTowerDock(){
  $('towerCards').innerHTML=towerOrder.map((id,index)=>{const tower=TOWERS[id],color=`#${tower.color.toString(16).padStart(6,'0')}`,position=atlasPosition(TOWER_ART.frames[id],TOWER_ART.columns,TOWER_ART.rows);return `<button class="tower-card" data-tower="${id}" style="--tower-color:${color}" title="${tower.description}"><kbd>${index+1}</kbd><span class="tower-portrait" style="--sprite-x:${position.x}%;--sprite-y:${position.y}%"></span><b>${tower.name}</b><small><span>${tower.role}</span><strong>● ${tower.cost}</strong></small></button>`;}).join('');
  document.querySelectorAll('[data-tower]').forEach(button=>button.addEventListener('click',()=>selectBuildTower(button.dataset.tower)));
}

async function startCampaign(){
  const button=$('startCampaignBtn');button.disabled=true;button.querySelector('span').textContent='正在同步題庫…';
  try{
    await audio.unlock();
    const response=await api('/session',{method:'POST',body:{setId:$('questionSetSelect').value}});
    questionSessionId=response.sessionId;
    teardownGame();
    simulation=new TowerDefenseSimulation({mapId:selectedMap,difficulty:selectedDifficulty,seed:Date.now()});
    showScreen('gameScreen');
    $('mapChapter').textContent=`第${MAPS[selectedMap].chapter}章 · ${DIFFICULTIES[selectedDifficulty].name}`;
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
    updateHud(simulation.state,true);showBanner(`${MAPS[selectedMap].name} · ${MAPS[selectedMap].paths.length} 路入侵 · 30 秒整備`);showToast(`題庫：${response.set.title}`,'success');
  }catch(error){console.error('[tower-defense] unable to start campaign',error);window.__towerDefense.lastError=error.message;showToast(error.message,'error');showScreen('menuScreen');}
  finally{button.disabled=false;button.querySelector('span').textContent='啟動防線';}
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
  if(selecting){audio.sfx('ui');showToast(`選擇空地建造「${TOWERS[id].name}」`);}
}

function updateHud(state,force=false){
  const signature=[state.lives,Math.floor(state.gold),state.wave,state.score,Math.floor(state.focus),state.phase,state.paused,state.speed,state.enemies.length,Math.ceil(state.buildCountdown),state.quizKeys,state.answersRequired,state.autoStartWaiting,state.stasisTime.toFixed(1),state.overdriveTime.toFixed(1),...Object.values(state.abilities).map(value=>value.toFixed(1))].join(':');
  if(!force&&signature===lastHudSignature)return;lastHudSignature=signature;
  $('livesValue').textContent=state.lives;$('goldValue').textContent=Math.floor(state.gold);$('waveValue').textContent=state.wave;$('scoreValue').textContent=Math.floor(state.score).toLocaleString('zh-HK');$('focusValue').textContent=Math.floor(state.focus);$('focusFill').style.width=`${state.focus}%`;
  $('pauseBtn').textContent=state.paused?'▶':'Ⅱ';$('speedBtn').textContent=`${state.speed}×`;
  const waveButton=$('nextWaveBtn');
  const quizReady=state.quizKeys>=state.answersRequired,seconds=Math.ceil(state.buildCountdown);
  waveButton.classList.toggle('quiz-required',state.phase==='build'&&!quizReady);
  if(state.phase==='build'){waveButton.disabled=!quizReady;waveButton.querySelector('b').textContent=quizReady?`開始第 ${state.wave+1} 波`:`先答對 ${state.quizKeys}/${state.answersRequired} 題`;waveButton.querySelector('span').textContent=seconds>0?`${seconds}`:'!';waveButton.querySelector('small').textContent=seconds>0?'秒後自動開始':state.autoStartWaiting?'等待知識鑰匙':'Space';}
  else if(state.phase==='wave'){waveButton.disabled=true;waveButton.querySelector('b').textContent=`敵軍來襲 · ${state.enemies.length+simulation.waveQueue.length}`;waveButton.querySelector('span').textContent='⚔';}
  else{waveButton.disabled=true;waveButton.querySelector('b').textContent=state.phase==='won'?'戰役完成':'晶核失守';}
  const quizButton=$('quizBtn');quizButton.classList.toggle('required',state.phase==='build'&&!quizReady);quizButton.querySelector('small').textContent=quizReady?'知識鑰匙已充能':`本波必須答對 ${state.quizKeys}/${state.answersRequired}`;
  document.querySelectorAll('[data-tower]').forEach(button=>button.classList.toggle('unaffordable',state.gold<TOWERS[button.dataset.tower].cost));
  for(const button of document.querySelectorAll('[data-ability]')){
    const id=button.dataset.ability,ability=ABILITIES[id],cooldown=state.abilities[id];
    button.disabled=state.phase!=='wave'||state.focus<ability.cost||cooldown>0;
    button.querySelector('i').style.height=`${Math.min(100,cooldown/ability.cooldown*100)}%`;
    button.querySelector('b').textContent=cooldown>0?`${Math.ceil(cooldown)}s`:ability.cost;
  }
  const tower=state.towers.find(item=>item.id===selectedTowerId);if(tower)renderTowerPanel(tower);
}

function renderTowerPanel(tower,force=false){
  const panel=$('towerPanel');
  if(!tower){panel.classList.remove('open');panelSignature='';return;}
  const definition=TOWERS[tower.type],stats=towerStats(tower),maxed=tower.level>=definition.levels.length,nextCost=maxed?0:definition.upgradeCosts[tower.level-1];
  const signature=[tower.id,tower.level,tower.targetMode,Math.floor(simulation.state.gold),Math.floor(tower.damage),tower.kills].join(':');if(!force&&signature===panelSignature)return;panelSignature=signature;
  const color=`#${definition.color.toString(16).padStart(6,'0')}`,spritePosition=atlasPosition(TOWER_ART.frames[tower.type],TOWER_ART.columns,TOWER_ART.rows);
  panel.style.setProperty('--tower-color',color);panel.classList.add('open');
  panel.innerHTML=`<div class="tower-panel-head"><span class="tower-panel-icon tower-panel-render" style="--sprite-x:${spritePosition.x}%;--sprite-y:${spritePosition.y}%"></span><div><b>${definition.name}</b><small>Lv.${tower.level} · ${stats.name}</small></div><button class="panel-close" id="towerPanelClose">×</button></div><p class="tower-description">${definition.description}</p><div class="tower-stats"><div><span>傷害</span><b>${Math.round(stats.damage)}</b></div><div><span>射程</span><b>${Math.round(stats.range)}</b></div><div><span>攻速</span><b>${(1/stats.cooldown).toFixed(1)}/s</b></div></div><label class="target-field">目標優先<select id="targetModeSelect">${Object.entries(targetNames).map(([id,name])=>`<option value="${id}" ${tower.targetMode===id?'selected':''}>${name}</option>`).join('')}</select></label><div class="tower-actions"><button class="upgrade-button" id="upgradeTowerBtn" ${maxed||simulation.state.gold<nextCost?'disabled':''}>${maxed?'已達最高級':`升級 · ● ${nextCost}`}</button><button class="sell-button" id="sellTowerBtn">出售 · ● ${Math.floor(tower.totalSpent*.7)}</button></div><div class="tower-record"><span>擊破 ${tower.kills}</span><span>總傷害 ${Math.floor(tower.damage).toLocaleString('zh-HK')}</span></div>`;
  $('towerPanelClose').onclick=()=>scene?.selectTower(null);
  $('targetModeSelect').onchange=event=>simulation.setTargetMode(tower.id,event.target.value);
  $('upgradeTowerBtn').onclick=()=>handleActionResult(simulation.upgradeTower(tower.id));
  $('sellTowerBtn').onclick=()=>{const result=simulation.sellTower(tower.id);handleActionResult(result);if(result.ok)scene?.selectTower(null);};
}

function handleActionResult(result){
  if(!result?.ok){showToast(result?.reason||'操作未能完成。','error');return;}
  if(result.refund)showToast(`回收 ${result.refund} 晶幣`,'success');
  if(result.tower?.level>1)renderTowerPanel(result.tower,true);
}

function handleGameEvent(event){
  const soundMap={towerBuilt:'build',towerUpgraded:'upgrade',towerSold:'sell',enemyKilled:'kill',enemyEscaped:'leak',waveStarted:'wave',waveComplete:'waveClear'};
  if(event.type==='shot')playThrottled(TOWERS[event.towerType].attack==='rocket'?'rocket':TOWERS[event.towerType].attack,65);
  else if(event.type==='flame')playThrottled('flame',130);else if(event.type==='frostField')playThrottled('frost',140);else if(event.type==='chain')playThrottled('chain',90);else if(event.type==='beam')playThrottled('beam',100);else if(event.type==='pulse')playThrottled('pulse',180);
  else if(soundMap[event.type])audio.sfx(soundMap[event.type]);
  if(event.type==='waveStarted')showBanner(`第 ${event.wave} 波 · ${event.entrances} 路敵軍${event.auto?' · 自動開戰':''}`);
  if(event.type==='waveComplete'){showBanner(`第 ${event.wave} 波完成 · 30 秒知識整備`);showToast('下一波必須取得足夠知識鑰匙','success');}
  if(event.type==='quizRequired'){showBanner(`第 ${event.wave} 波等待答題 · ${event.quizKeys}/${event.answersRequired}`);showToast(`必須再答對 ${event.answersRequired-event.quizKeys} 題才能開戰`,'error');}
  if(event.type==='enemyEscaped')showToast(`晶核受損 −${event.damage}`,'error');
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
  await audio.unlock();quizWasPaused=simulation.state.paused;simulation.togglePause(true);$('questionPanel').classList.add('open');$('questionPrompt').textContent='正在取得題目…';$('questionChoices').innerHTML='';$('questionFeedback').textContent='';answering=false;
  try{
    const data=await api('/question',{method:'POST',body:{sessionId:questionSessionId}});activeQuestion=data.question;questionDeadline=activeQuestion.expiresAt;
    $('questionPrompt').textContent=activeQuestion.prompt;$('questionReward').textContent=`答對 +${Math.floor(activeQuestion.baseReward*simulation.quizRules.quizGoldMultiplier)} 晶幣起`;
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
    if(data.correct){const granted=simulation.grantQuizReward(data);profile.totalCorrect++;saveProfile();feedback.textContent=`答對！獲得 ${granted} 晶幣 · 知識鑰匙 ${simulation.state.quizKeys}/${simulation.state.answersRequired}`;audio.sfx('correct');$('quizStreak').textContent=data.streak>1?`${data.streak} 連勝`:'';}
    else{simulation.grantQuizReward(data);feedback.textContent=data.timedOut?'時間到！這次沒有獎勵。':'答錯了，看看綠色的正確答案。';audio.sfx('wrong');$('quizStreak').textContent='';}
    setTimeout(closeQuestion,1250);
  }catch(error){showToast(error.message,'error');setTimeout(closeQuestion,500);}
}

function closeQuestion(){clearInterval(questionTimer);questionTimer=null;activeQuestion=null;answering=false;$('questionPanel').classList.remove('open');if(simulation&&!quizWasPaused)simulation.togglePause(false);}

function useAbility(id){
  if(!simulation||!scene)return;
  if(id==='meteor'){
    if(simulation.state.focus<ABILITIES[id].cost||simulation.state.abilities[id]>0)return;
    scene.setAbilityTarget(scene.abilityTarget===id?null:id);document.querySelectorAll('[data-ability]').forEach(button=>button.classList.toggle('targeting',button.dataset.ability===scene.abilityTarget));if(scene.abilityTarget)showToast('點擊戰場選擇轟擊位置');
  }else handleActionResult(simulation.useAbility(id));
}

function finishCampaign(won){
  audio.sfx(won?'win':'lose');const state=simulation.state,map=MAPS[state.mapId];
  if(won){if(!profile.completed.includes(map.id))profile.completed.push(map.id);const next=mapOrder[mapOrder.indexOf(map.id)+1];if(next&&!profile.unlocked.includes(next))profile.unlocked.push(next);}
  const scoreKey=`${state.mapId}:${state.difficulty}`;profile.bestScores[scoreKey]=Math.max(profile.bestScores[scoreKey]||0,state.score);saveProfile();
  $('endSeal').textContent=won?'◇':'◆';$('endSeal').style.filter=won?'none':'hue-rotate(140deg) saturate(1.4)';$('endEyebrow').textContent=won?'戰役完成':'防線崩潰';$('endTitle').textContent=won?'晶核安全！':'晶核已失守';$('endDescription').textContent=won?`你成功守住「${map.name}」，完整抵擋 15 波敵軍。`:`敵軍在第 ${state.wave} 波突破防線。調整塔種組合，再次挑戰。`;
  $('resultStats').innerHTML=`<div><b>${state.score.toLocaleString('zh-HK')}</b><span>戰役分數</span></div><div><b>${state.stats.kills}</b><span>擊破敵軍</span></div><div><b>${state.stats.quizCorrect}/${state.stats.quizAnswered}</b><span>答題正確</span></div><div><b>${Math.floor(state.stats.damage).toLocaleString('zh-HK')}</b><span>總傷害</span></div>`;
  $('endModal').classList.add('open');
}

function returnToCampaign(){teardownGame();showScreen('menuScreen');renderMenu();loadQuestionSets();}

function bindUi(){
  $('startCampaignBtn').addEventListener('click',startCampaign);$('nextWaveBtn').addEventListener('click',beginWave);$('pauseBtn').addEventListener('click',togglePause);$('speedBtn').addEventListener('click',cycleSpeed);$('quizBtn').addEventListener('click',openQuestion);$('helpBtn').addEventListener('click',()=>{modalWasPaused=!!simulation?.state.paused;$('helpModal').classList.add('open');simulation?.togglePause(true);});
  $('exitBtn').addEventListener('click',()=>{if(confirm('退出目前戰役？這一局的進度不會保留。'))returnToCampaign();});
  $('retryBtn').addEventListener('click',()=>{selectedMap=simulation.state.mapId;selectedDifficulty=simulation.state.difficulty;startCampaign();});$('campaignBtn').addEventListener('click',returnToCampaign);
  document.querySelectorAll('[data-close-modal]').forEach(button=>button.addEventListener('click',()=>{const modal=$(button.dataset.closeModal);modal.classList.remove('open');if(simulation&&!modalWasPaused)simulation.togglePause(false);}));
  document.querySelectorAll('[data-difficulty]').forEach(button=>button.addEventListener('click',()=>{selectedDifficulty=button.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(item=>item.classList.toggle('selected',item===button));audio.sfx('ui');}));
  document.querySelectorAll('[data-ability]').forEach(button=>button.addEventListener('click',()=>useAbility(button.dataset.ability)));
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
    if(!simulation.state.paused){simulation.togglePause(true);updateHud(simulation.state,true);showToast('已自動暫停，返回後按播放繼續。');}
  });
}

renderMenu();renderTowerDock();bindUi();loadQuestionSets();
window.__towerDefense={
  get simulation(){return simulation;},
  get scene(){return scene;},
  get audioState(){return {contextState:audio.context?.state||'unavailable',muted:audio.muted,musicActive:!!audio.musicTimer};},
  startCampaign,openQuestion,profile,preview,
};
