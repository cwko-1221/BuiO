const $=id=>document.getElementById(id);
const socket=io('/tower-defense');
const launchParams=new URLSearchParams(location.search);
const preview=location.pathname.endsWith('/preview');
const fromHub=launchParams.get('hub')==='1';
const hubUrl=preview?'/games/preview?role=teacher':'/games';
const previewHeaders=preview?{'x-buio-preview':'1'}:{};
const mapNames={starport:'星港迴廊',moonwood:'月影森徑',embercore:'熔火核心'};
const statusNames={choosing:'選擇中',ready:'已準備',deploying:'部署中',playing:'守衛中',won:'成功守住',lost:'晶核失守'};
let teacherName='老師',selectedSet=null,room=null,latestRoster=[];

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function show(id){document.querySelectorAll('.teacher-screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));}

async function loadIdentity(){
  try{const response=await fetch('/api/auth/me',{credentials:'include'});if(!response.ok)return;const user=(await response.json())?.student;if(user?.name)teacherName=user.name;}catch{}
}

async function loadSets(){
  const list=$('teacherSetList');
  try{
    const response=await fetch('/api/tower-defense/sets',{credentials:'include',headers:previewHeaders});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'無法載入題庫。');
    list.innerHTML=data.sets.map(set=>`<button class="teacher-set" data-set="${escapeHtml(set.id)}"><span class="set-glyph">?</span><span><b>${escapeHtml(set.title)}</b><small>${set.questionCount} 題${set.builtin?' · 內置題庫':''}</small></span><i>選取</i></button>`).join('');
    document.querySelectorAll('[data-set]').forEach((button,index)=>button.addEventListener('click',()=>{
      selectedSet=data.sets[index];document.querySelectorAll('[data-set]').forEach(item=>item.classList.toggle('selected',item===button));
      $('createClassroomBtn').disabled=false;$('createClassroomBtn').querySelector('small').textContent=`使用「${selectedSet.title}」`;
    }));
  }catch(error){list.innerHTML=`<div class="room-empty error">${escapeHtml(error.message)}</div>`;}
}

async function createClassroom(){
  if(!selectedSet)return;await loadIdentity();$('teacherError').textContent='';$('createClassroomBtn').disabled=true;
  socket.emit('host:create',{setId:selectedSet.id,hostName:teacherName},response=>{
    $('createClassroomBtn').disabled=false;
    if(!response?.ok){
      const message=response?.message||'建立失敗。';$('teacherError').textContent=message;
      if(fromHub){document.documentElement.classList.remove('hub-launch');$('teacherLobbyTitle').textContent='未能建立房間';$('roomSummary').textContent=message;$('lobbyError').textContent='請返回遊戲問答重新設定。';show('teacherLobby');}
      return;
    }
    room={code:response.code,setTitle:response.setTitle,questionCount:response.questionCount};
    $('roomCode').textContent=room.code;$('roomSummary').textContent=`題庫：${room.setTitle} · ${room.questionCount} 題 · 固定守衛級`;
    latestRoster=[];renderLobbyRoster();document.documentElement.classList.remove('hub-launch');$('teacherLobbyTitle').textContent='等待守衛部署';show('teacherLobby');
  });
}
$('createClassroomBtn').addEventListener('click',createClassroom);

function renderLobbyRoster(){
  const connected=latestRoster.filter(player=>player.connected),ready=connected.filter(player=>player.mapId);
  $('readyCount').textContent=`${ready.length} / ${connected.length} 已準備`;
  $('startClassroomBtn').disabled=!connected.length||ready.length!==connected.length;
  $('startClassroomBtn').querySelector('small').textContent=!connected.length?'等待學生加入':ready.length===connected.length?'全員已選擇戰場':`尚有 ${connected.length-ready.length} 人未選戰場`;
  $('teacherRoster').innerHTML=connected.length?connected.map(player=>playerCard(player,false)).join(''):'<div class="room-empty"><i></i>等待學生加入…</div>';
}

function playerCard(player,live){
  const map=player.mapId?mapNames[player.mapId]:'尚未選擇';
  return `<article class="teacher-player ${player.connected?'':'offline'}"><span class="player-avatar">${escapeHtml(player.name).slice(0,1)}</span><div class="player-main"><b>${escapeHtml(player.name)}</b><small>${escapeHtml(map)}</small></div><span class="player-status ${escapeHtml(player.status)}">${escapeHtml(statusNames[player.status]||'準備中')}</span>${live?`<div class="player-metrics"><span><small>波次</small><b>${player.wave}/15</b></span><span><small>分數</small><b>${Number(player.score).toLocaleString('zh-HK')}</b></span><span><small>答題</small><b>${player.quizCorrect}/${player.quizAnswered}</b></span></div>`:''}</article>`;
}

function renderLiveRoster(){
  const sorted=[...latestRoster].sort((a,b)=>(b.score-a.score)||(b.wave-a.wave));
  $('livePlayerCount').textContent=`${sorted.filter(player=>player.connected).length} 位守衛`;
  $('teacherLiveRoster').innerHTML=sorted.map(player=>playerCard(player,true)).join('')||'<div class="room-empty">等待戰況資料…</div>';
}

socket.on('classroom:roster',players=>{latestRoster=players;renderLobbyRoster();renderLiveRoster();});

$('startClassroomBtn').addEventListener('click',()=>{
  $('lobbyError').textContent='';
  socket.emit('host:start',response=>{
    if(!response?.ok){$('lobbyError').textContent=response?.message||'無法開始。';return;}
    $('liveSummary').textContent=`房間 ${room.code} · ${room.setTitle} · 守衛級`;
    renderLiveRoster();show('teacherLive');
  });
});

$('closeClassroomBtn').addEventListener('click',()=>{if(room&&!confirm('確定關閉這個房間？'))return;socket.emit('host:close');room=null;if(fromHub)location.href=hubUrl;else show('teacherSetup');});
$('endClassroomBtn').addEventListener('click',()=>{if(!confirm('確定結束全班戰役？'))return;socket.emit('host:end',response=>{if(response?.ok)showResults(response.results||[]);});});
socket.on('classroom:ended',({results})=>showResults(results||[]));

function showResults(results){
  const sorted=[...results].sort((a,b)=>b.score-a.score);
  $('teacherResultsList').innerHTML=sorted.map((player,index)=>`<article><span>${index+1}</span><div><b>${escapeHtml(player.name)}</b><small>${escapeHtml(mapNames[player.mapId]||'未選戰場')} · ${escapeHtml(statusNames[player.status]||player.status)}</small></div><strong>${Number(player.score).toLocaleString('zh-HK')} 分</strong><em>${player.quizCorrect}/${player.quizAnswered} 題</em></article>`).join('')||'<div class="room-empty">本次未有學生成績。</div>';
  show('teacherResults');
}

$('newClassroomBtn').addEventListener('click',()=>{if(fromHub){location.href=hubUrl;return;}room=null;selectedSet=null;document.querySelectorAll('[data-set]').forEach(item=>item.classList.remove('selected'));$('createClassroomBtn').disabled=true;show('teacherSetup');});
socket.on('classroom:closed',()=>{});

async function init(){
  await loadIdentity();
  if(launchParams.get('autocreate')==='1'&&launchParams.get('setId')){
    selectedSet={id:launchParams.get('setId'),title:'課堂題庫'};
    $('createClassroomBtn').disabled=false;
    await createClassroom();
  }else await loadSets();
}
init();
window.__towerDefenseTeacher={get room(){return room;},get roster(){return latestRoster;}};
