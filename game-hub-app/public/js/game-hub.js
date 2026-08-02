const $=id=>document.getElementById(id);
const preview=location.pathname.endsWith('/preview');
const previewRole=new URLSearchParams(location.search).get('role');
const previewHeaders=preview?{'x-buio-preview':'1'}:{};
let role=previewRole==='teacher'?'teacher':previewRole==='student'?'student':null;
let selectedSet=null,selectedGame=null,rooms=[],filter='all',roomsTimer=null;

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
function show(id){document.querySelectorAll('.hub-view').forEach(view=>view.classList.toggle('active',view.id===id));}
function teacherLabel(name){const value=String(name||'老師');return value.endsWith('老師')?value:`${value}老師`;}

async function resolveRole(){
  if(role)return role;
  try{const response=await fetch('/api/auth/me',{credentials:'include'});if(!response.ok)throw new Error();role=(await response.json())?.student?.role||'student';}
  catch{role='student';}
  return role;
}

async function init(){
  await resolveRole();$('roleBadge').textContent=role==='teacher'?'老師模式':'學生模式';
  if(role==='teacher'){show('teacherView');await loadQuestionSets();}
  else{show('studentView');bindFilters();await loadRooms();roomsTimer=setInterval(loadRooms,3000);}
}

async function loadQuestionSets(){
  const list=$('hubSetList');
  try{
    const response=await fetch('/api/games/sets',{credentials:'include',headers:previewHeaders});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'無法載入題庫。');
    list.innerHTML=data.sets.map(set=>`<button class="hub-set" data-set="${escapeHtml(set.id)}"><span class="set-orb">?</span><span><b>${escapeHtml(set.title)}</b><small>${set.questionCount} 題${set.builtin?' · 內置':''}</small></span><em>${set.games.length===2?'兩款遊戲':'只支援攀登'}</em></button>`).join('');
    document.querySelectorAll('[data-set]').forEach((button,index)=>button.addEventListener('click',()=>selectSet(data.sets[index],button)));
  }catch(error){list.innerHTML=`<div class="empty-state error">${escapeHtml(error.message)}</div>`;}
}

function selectSet(set,button){
  selectedSet=set;selectedGame=null;
  document.querySelectorAll('[data-set]').forEach(item=>item.classList.toggle('selected',item===button));
  $('gameStep').classList.remove('locked');$('settingsStep').classList.add('locked');
  document.querySelectorAll('[data-game]').forEach(item=>{item.classList.remove('selected');item.disabled=!set.games.includes(item.dataset.game);});
  $('compatibilityNote').textContent=set.games.includes('tower-defense')?'此題庫支援兩款遊戲。':'此題庫含少於四個選項的題目，因此只支援「唔好望落嚟」。';
  $('climbSettings').hidden=true;$('towerSettings').hidden=true;$('createGameBtn').disabled=true;
}

document.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',()=>{
  if(button.disabled||!selectedSet)return;selectedGame=button.dataset.game;
  document.querySelectorAll('[data-game]').forEach(item=>item.classList.toggle('selected',item===button));
  $('settingsStep').classList.remove('locked');$('climbSettings').hidden=selectedGame!=='climb';$('towerSettings').hidden=selectedGame!=='tower-defense';
  $('settingsDescription').textContent=selectedGame==='climb'?'設定時間與答題能量':'塔防課堂統一使用守衛級規則';
  $('createGameBtn').disabled=false;$('createGameBtn').querySelector('small').textContent=`題庫：${selectedSet.title}`;
}));

$('infiniteEnergyToggle').addEventListener('change',()=>{
  $('energyPerCorrectInput').disabled=$('infiniteEnergyToggle').checked;
});

$('createGameBtn').addEventListener('click',()=>{
  $('teacherHubError').textContent='';if(!selectedSet||!selectedGame)return;
  const params=new URLSearchParams({hub:'1',autocreate:'1',setId:selectedSet.id});
  if(selectedGame==='climb'){
    const maxEnergy=Math.round(Number($('maxEnergyInput').value));
    const energyPerCorrect=Math.round(Number($('energyPerCorrectInput').value));
    if(maxEnergy<20||maxEnergy>500){$('teacherHubError').textContent='最高能量必須為 20 至 500。';return;}
    if(energyPerCorrect<1||energyPerCorrect>maxEnergy){$('teacherHubError').textContent=`答對能量必須為 1 至 ${maxEnergy}。`;return;}
    params.set('durationSec',$('durationSelect').value);params.set('maxEnergy',String(maxEnergy));params.set('energyPerCorrect',String(energyPerCorrect));params.set('infiniteEnergy',$('infiniteEnergyToggle').checked?'1':'0');
    location.href=preview?`/game/host/preview?${params}`:`/game/host?${params}`;
  }else location.href=preview?`/tower-defense/teacher/preview?${params}`:`/tower-defense/teacher?${params}`;
});

async function loadRooms(){
  try{
    const [climbResponse,towerResponse]=await Promise.all([
      fetch('/api/game/sessions',{credentials:'include'}),
      fetch('/api/tower-defense/sessions',{credentials:'include',headers:previewHeaders}),
    ]);
    const climbData=await climbResponse.json(),towerData=await towerResponse.json();
    rooms=[...(climbData.sessions||[]).map(room=>({...room,game:'climb'})),...(towerData.sessions||[]).map(room=>({...room,game:'tower-defense'}))];
    renderRooms();
  }catch(error){$('unifiedRoomList').innerHTML='<div class="empty-state error">無法載入遊戲房間，請重新整理。</div>';}
}

function bindFilters(){
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('selected',item===button));renderRooms();}));
}

function renderRooms(){
  const visible=filter==='all'?rooms:rooms.filter(room=>room.game===filter),list=$('unifiedRoomList');
  if(!visible.length){list.innerHTML='<div class="empty-state"><i></i>目前未有老師開啟遊戲房間，請稍候…</div>';return;}
  list.innerHTML=visible.map(room=>{
    const climb=room.game==='climb';
    return `<button class="unified-room ${climb?'climb':'defence'}" data-room-code="${escapeHtml(room.code)}" data-room-game="${room.game}"><span class="room-game-mark">${climb?'↑':'◇'}</span><span class="room-details"><small>${climb?'唔好望落嚟':'晶核守衛戰'}</small><b>${escapeHtml(teacherLabel(room.hostName))}</b><em>${escapeHtml(room.setTitle||'課堂題庫')} · ${room.players} 人</em></span><span class="room-state"><i></i>${room.phase==='lobby'?'等待開始':'進行中'}</span><strong>加入</strong></button>`;
  }).join('');
  document.querySelectorAll('[data-room-code]').forEach(button=>button.addEventListener('click',()=>joinRoom(button.dataset.roomGame,button.dataset.roomCode)));
}

function joinRoom(game,code){
  clearInterval(roomsTimer);const params=new URLSearchParams({room:code,autojoin:'1'});
  if(game==='climb')location.href=preview?`/game/preview?${params}`:`/game?${params}`;
  else location.href=preview?`/tower-defense/preview?classroom=1&${params}`:`/tower-defense?${params}`;
}

init();
window.__gameHub={get role(){return role;},get rooms(){return rooms;},get selectedSet(){return selectedSet;},get selectedGame(){return selectedGame;}};
