const $=id=>document.getElementById(id);
const socket=io('/tower-defense');
const launchParams=new URLSearchParams(location.search);
const preview=location.pathname.endsWith('/preview');
const fromHub=launchParams.get('hub')==='1';
const hubUrl=preview?'/games/preview?role=teacher':'/games';
const previewHeaders=preview?{'x-buio-preview':'1'}:{};
const { t, server: serverText, locale } = window.BuiI18n;
const mapNames={starport:t('td.map.starport.name'),moonwood:t('td.map.moonwood.name'),embercore:t('td.map.embercore.name')};
const statusNames={choosing:t('td.statusChoosing'),ready:t('td.statusReady'),deploying:t('td.statusDeploying'),playing:t('td.statusPlaying'),won:t('td.statusWon'),lost:t('td.statusLost')};
let teacherName=t('td.teacherFallback'),selectedSet=null,room=null,latestRoster=[];

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function show(id){document.querySelectorAll('.teacher-screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));}

async function loadIdentity(){
  try{const response=await fetch('/api/auth/me',{credentials:'include'});if(!response.ok)return;const user=(await response.json())?.student;if(user?.name)teacherName=user.name;}catch{}
}

async function loadSets(){
  const list=$('teacherSetList');
  try{
    const response=await fetch('/api/tower-defense/sets',{credentials:'include',headers:previewHeaders});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||t('td.setsFailed'));
    list.innerHTML=data.sets.map(set=>`<button class="teacher-set" data-set="${escapeHtml(set.id)}"><span class="set-glyph">?</span><span><b>${escapeHtml(set.title)}</b><small>${escapeHtml(t('td.setMeta',{count:set.questionCount,builtin:set.builtin?t('td.builtinSuffix'):''}))}</small></span><i>${escapeHtml(t('td.select'))}</i></button>`).join('');
    document.querySelectorAll('[data-set]').forEach((button,index)=>button.addEventListener('click',()=>{
      selectedSet=data.sets[index];document.querySelectorAll('[data-set]').forEach(item=>item.classList.toggle('selected',item===button));
      $('createClassroomBtn').disabled=false;$('createClassroomBtn').querySelector('small').textContent=t('td.usingBank',{title:selectedSet.title});
    }));
  }catch(error){list.innerHTML=`<div class="room-empty error">${escapeHtml(error.message)}</div>`;}
}

async function createClassroom(){
  if(!selectedSet)return;await loadIdentity();$('teacherError').textContent='';$('createClassroomBtn').disabled=true;
  socket.emit('host:create',{setId:selectedSet.id,hostName:teacherName},response=>{
    $('createClassroomBtn').disabled=false;
    if(!response?.ok){
      const message=serverText(response?.message)||t('td.createFailed');$('teacherError').textContent=message;
      if(fromHub){document.documentElement.classList.remove('hub-launch');$('teacherLobbyTitle').textContent=t('td.createFailedTitle');$('roomSummary').textContent=message;$('lobbyError').textContent=t('td.createFailedHint');show('teacherLobby');}
      return;
    }
    room={code:response.code,setTitle:response.setTitle,questionCount:response.questionCount};
    $('roomCode').textContent=room.code;$('roomSummary').textContent=t('td.roomSummary',{title:room.setTitle,count:room.questionCount});
    latestRoster=[];renderLobbyRoster();document.documentElement.classList.remove('hub-launch');$('teacherLobbyTitle').textContent=t('td.lobbyTitle');show('teacherLobby');
  });
}
$('createClassroomBtn').addEventListener('click',createClassroom);

function renderLobbyRoster(){
  const connected=latestRoster.filter(player=>player.connected),ready=connected.filter(player=>player.mapId);
  $('readyCount').textContent=t('td.readyCount',{ready:ready.length,total:connected.length});
  $('startClassroomBtn').disabled=!connected.length||ready.length!==connected.length;
  $('startClassroomBtn').querySelector('small').textContent=!connected.length?t('td.startHintWaiting'):ready.length===connected.length?t('td.startHintAllReady'):t('td.startHintPending',{count:connected.length-ready.length});
  $('teacherRoster').innerHTML=connected.length?connected.map(player=>playerCard(player,false)).join(''):`<div class="room-empty"><i></i>${escapeHtml(t('td.waitingStudents'))}</div>`;
}

function playerCard(player,live){
  const map=player.mapId?mapNames[player.mapId]:t('td.noMapYet');
  return `<article class="teacher-player ${player.connected?'':'offline'}"><span class="player-avatar">${escapeHtml(player.name).slice(0,1)}</span><div class="player-main"><b>${escapeHtml(player.name)}</b><small>${escapeHtml(map)}</small></div><span class="player-status ${escapeHtml(player.status)}">${escapeHtml(statusNames[player.status]||t('td.statusPending'))}</span>${live?`<div class="player-metrics"><span><small>${escapeHtml(t('td.playerWave'))}</small><b>${player.wave}/15</b></span><span><small>${escapeHtml(t('td.playerScore'))}</small><b>${Number(player.score).toLocaleString(locale)}</b></span><span><small>${escapeHtml(t('td.playerQuiz'))}</small><b>${player.quizCorrect}/${player.quizAnswered}</b></span></div>`:''}</article>`;
}

function renderLiveRoster(){
  const sorted=[...latestRoster].sort((a,b)=>(b.score-a.score)||(b.wave-a.wave));
  $('livePlayerCount').textContent=t('td.guardianCount',{count:sorted.filter(player=>player.connected).length});
  $('teacherLiveRoster').innerHTML=sorted.map(player=>playerCard(player,true)).join('')||`<div class="room-empty">${escapeHtml(t('td.awaitingLive'))}</div>`;
}

socket.on('classroom:roster',players=>{latestRoster=players;renderLobbyRoster();renderLiveRoster();});

$('startClassroomBtn').addEventListener('click',()=>{
  $('lobbyError').textContent='';
  socket.emit('host:start',response=>{
    if(!response?.ok){$('lobbyError').textContent=serverText(response?.message)||t('td.startFailed');return;}
    $('liveSummary').textContent=t('td.liveSummary',{code:room.code,title:room.setTitle});
    renderLiveRoster();show('teacherLive');
  });
});

$('closeClassroomBtn').addEventListener('click',()=>{if(room&&!confirm(t('td.confirmClose')))return;socket.emit('host:close');room=null;if(fromHub)location.href=hubUrl;else show('teacherSetup');});
$('endClassroomBtn').addEventListener('click',()=>{if(!confirm(t('td.confirmEnd')))return;socket.emit('host:end',response=>{if(response?.ok)showResults(response.results||[]);});});
socket.on('classroom:ended',({results})=>showResults(results||[]));

function showResults(results){
  const sorted=[...results].sort((a,b)=>b.score-a.score);
  $('teacherResultsList').innerHTML=sorted.map((player,index)=>`<article><span>${index+1}</span><div><b>${escapeHtml(player.name)}</b><small>${escapeHtml(mapNames[player.mapId]||t('td.noMapPicked'))} · ${escapeHtml(statusNames[player.status]||player.status)}</small></div><strong>${escapeHtml(t('td.scoreSuffix',{score:Number(player.score).toLocaleString(locale)}))}</strong><em>${escapeHtml(t('td.quizSuffix',{correct:player.quizCorrect,answered:player.quizAnswered}))}</em></article>`).join('')||`<div class="room-empty">${escapeHtml(t('td.noResults'))}</div>`;
  show('teacherResults');
}

$('newClassroomBtn').addEventListener('click',()=>{if(fromHub){location.href=hubUrl;return;}room=null;selectedSet=null;document.querySelectorAll('[data-set]').forEach(item=>item.classList.remove('selected'));$('createClassroomBtn').disabled=true;show('teacherSetup');});
socket.on('classroom:closed',()=>{});

async function init(){
  await loadIdentity();
  if(launchParams.get('autocreate')==='1'&&launchParams.get('setId')){
    selectedSet={id:launchParams.get('setId'),title:t('td.classBank')};
    $('createClassroomBtn').disabled=false;
    await createClassroom();
  }else await loadSets();
}
init();
window.__towerDefenseTeacher={get room(){return room;},get roster(){return latestRoster;}};
