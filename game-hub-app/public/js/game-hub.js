
// ExcelJS is ~926KB and only teachers importing or exporting a spreadsheet ever need it, yet
// it was loaded eagerly on the portal for every student on every visit. Fetch it on demand.
let excelJsPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/exceljs.min.js';
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => { excelJsPromise = null; reject(new Error('Excel 元件載入失敗，請檢查網絡後再試。')); };
      document.head.appendChild(script);
    });
  }
  return excelJsPromise;
}
const $=id=>document.getElementById(id);
const preview=location.pathname.endsWith('/preview');
const previewRole=new URLSearchParams(location.search).get('role');
const previewHeaders=preview?{'x-buio-preview':'1'}:{};
let role=previewRole==='teacher'?'teacher':previewRole==='student'?'student':null;
let selectedSet=null,selectedGame=null,rooms=[],filter='all',roomsTimer=null;
let questionSets=[],editingSetId=null,questionSequence=0;

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

async function loadQuestionSets(preselectId=null){
  const list=$('hubSetList');
  try{
    const response=await fetch('/api/games/sets',{credentials:'include',headers:previewHeaders});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'無法載入題庫。');
    questionSets=data.sets;
    list.innerHTML=questionSets.map(set=>`<article class="hub-set-row" data-set-row="${escapeHtml(set.id)}"><button class="hub-set" type="button" data-select-set="${escapeHtml(set.id)}"><span class="set-orb">?</span><span><b>${escapeHtml(set.title)}</b><small>${set.questionCount} 題${set.builtin?' · 內置':''}</small></span><em>${set.games.length===2?'兩款遊戲':'只支援攀登'}</em></button>${set.builtin?'':`<div class="set-actions"><button type="button" data-edit-set="${escapeHtml(set.id)}" aria-label="編輯 ${escapeHtml(set.title)}">編輯</button><button class="danger" type="button" data-delete-set="${escapeHtml(set.id)}" aria-label="刪除 ${escapeHtml(set.title)}">刪除</button></div>`}</article>`).join('');
    list.querySelectorAll('[data-select-set]').forEach(button=>button.addEventListener('click',()=>{
      const set=questionSets.find(item=>String(item.id)===button.dataset.selectSet);if(set)selectSet(set,button);
    }));
    list.querySelectorAll('[data-edit-set]').forEach(button=>button.addEventListener('click',()=>openEditor(button.dataset.editSet)));
    list.querySelectorAll('[data-delete-set]').forEach(button=>button.addEventListener('click',()=>deleteSet(button.dataset.deleteSet)));
    $('bankAvailabilityNote').textContent=data.dbAvailable?'自訂題庫會安全儲存在老師帳戶。':'預覽／本機資料庫未連接時可試用編輯器，但無法儲存。';
    if(preselectId){
      const button=[...list.querySelectorAll('[data-select-set]')].find(item=>item.dataset.selectSet===String(preselectId));
      const set=questionSets.find(item=>String(item.id)===String(preselectId));
      if(button&&set)selectSet(set,button);
    }
  }catch(error){list.innerHTML=`<div class="empty-state error">${escapeHtml(error.message)}</div>`;}
}

function selectSet(set,button){
  selectedSet=set;selectedGame=null;
  document.querySelectorAll('[data-select-set]').forEach(item=>item.classList.toggle('selected',item===button));
  $('gameStep').classList.remove('locked');$('settingsStep').classList.add('locked');
  document.querySelectorAll('[data-game]').forEach(item=>{item.classList.remove('selected');item.disabled=!set.games.includes(item.dataset.game);});
  $('compatibilityNote').textContent=set.games.includes('tower-defense')?'此題庫支援兩款遊戲。':'此題庫含少於四個選項的題目，因此只支援「唔好望落嚟」。';
  $('climbSettings').hidden=true;$('towerSettings').hidden=true;$('createGameBtn').disabled=true;
}

function resetSelection(){
  selectedSet=null;selectedGame=null;
  $('gameStep').classList.add('locked');$('settingsStep').classList.add('locked');
  document.querySelectorAll('[data-game]').forEach(item=>{item.disabled=true;item.classList.remove('selected');});
  $('climbSettings').hidden=true;$('towerSettings').hidden=true;$('createGameBtn').disabled=true;
}

async function deleteSet(setId){
  const set=questionSets.find(item=>String(item.id)===String(setId));
  if(!set||set.builtin||!confirm(`確定刪除「${set.title}」？此操作無法復原。`))return;
  try{
    const response=await fetch(`/api/game/teacher/sets/${encodeURIComponent(setId)}`,{method:'DELETE',credentials:'include'});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'刪除失敗。');
    if(String(selectedSet?.id)===String(setId))resetSelection();
    await loadQuestionSets();
  }catch(error){$('teacherHubError').textContent=error.message||'刪除失敗。';}
}

function questionBlock(question={}){
  const block=document.createElement('article');
  const blockId=++questionSequence;
  const choices=Array.isArray(question.choices)?question.choices:['','','',''];
  block.className='editor-question';
  block.innerHTML=`<div class="question-head"><strong class="question-number"></strong><button type="button" class="remove-question" aria-label="刪除題目">刪除</button></div><label class="question-field"><span>題目</span><input class="q-question" type="text" maxlength="200" placeholder="輸入題目" value="${escapeHtml(question.question||'')}"></label><div class="choice-grid">${[0,1,2,3].map(index=>`<label class="choice-field"><input type="radio" name="correct-${blockId}" value="${index}" ${question.correctIndex===index?'checked':''}><span>${String.fromCharCode(65+index)}</span><input class="q-choice-input" type="text" maxlength="80" placeholder="選項 ${String.fromCharCode(65+index)}" value="${escapeHtml(choices[index]||'')}"></label>`).join('')}</div>`;
  block.querySelector('.remove-question').addEventListener('click',()=>{block.remove();renumberQuestions();});
  return block;
}

function renumberQuestions(){
  [...$('editorQuestions').children].forEach((block,index)=>{block.querySelector('.question-number').textContent=`第 ${index+1} 題`;});
}

function addQuestion(question){$('editorQuestions').appendChild(questionBlock(question));renumberQuestions();}

function closeEditor(){
  $('questionBankModal').hidden=true;document.body.classList.remove('modal-open');editingSetId=null;
}

async function openEditor(setId=null){
  editingSetId=setId||null;$('editorError').textContent='';$('excelImportStatus').textContent='支援 .xlsx，每列一題';$('editorQuestions').innerHTML='';
  $('bankEditorTitle').textContent=editingSetId?'編輯題庫':'新增題庫';
  try{
    if(editingSetId){
      const response=await fetch(`/api/game/teacher/sets/${encodeURIComponent(editingSetId)}`,{credentials:'include'});
      const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'載入題庫失敗。');
      $('editorSetTitle').value=data.set.title;data.set.questions.forEach(addQuestion);
    }else{
      $('editorSetTitle').value='';for(let index=0;index<3;index++)addQuestion();
    }
    $('questionBankModal').hidden=false;document.body.classList.add('modal-open');setTimeout(()=>$('editorSetTitle').focus(),0);
  }catch(error){$('teacherHubError').textContent=error.message||'載入題庫失敗。';editingSetId=null;}
}

function excelCellText(cell){
  const value=cell?.value;if(value==null)return'';
  if(typeof value==='object'){
    if(Array.isArray(value.richText))return value.richText.map(part=>part.text||'').join('').trim();
    if(value.text!=null)return String(value.text).trim();if(value.result!=null)return String(value.result).trim();
  }
  return String(value).trim();
}

async function importExcelQuestions(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  $('editorError').textContent='';$('excelImportStatus').textContent=`正在讀取 ${file.name}…`;
  try{
    await loadExcelJs();
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await file.arrayBuffer());const sheet=workbook.worksheets[0];
    if(!sheet)throw new Error('Excel 內沒有工作表。');
    const firstDataRow=excelCellText(sheet.getCell(1,1)).toLowerCase()==='question'?2:1;const questions=[];
    for(let rowNumber=firstDataRow;rowNumber<=sheet.rowCount;rowNumber++){
      const values=Array.from({length:6},(_,index)=>excelCellText(sheet.getRow(rowNumber).getCell(index+1)));
      if(values.every(value=>!value))continue;
      const [question,...rest]=values,choices=rest.slice(0,4),correctAnswer=rest[4].toUpperCase();
      if(!question)throw new Error(`第 ${rowNumber} 列缺少 question。`);
      if(choices.some(choice=>!choice))throw new Error(`第 ${rowNumber} 列必須填寫 optionA、optionB、optionC、optionD。`);
      if(!['A','B','C','D'].includes(correctAnswer))throw new Error(`第 ${rowNumber} 列 correctAnswer 必須是 A、B、C 或 D。`);
      questions.push({question,choices,correctIndex:correctAnswer.charCodeAt(0)-65});
    }
    if(!questions.length)throw new Error('Excel 內沒有可匯入的題目。');
    $('editorQuestions').innerHTML='';questions.forEach(addQuestion);
    if(!$('editorSetTitle').value.trim())$('editorSetTitle').value=file.name.replace(/\.xlsx$/i,'').slice(0,60);
    $('excelImportStatus').textContent=`已匯入 ${questions.length} 題`;
  }catch(error){$('excelImportStatus').textContent='匯入失敗';$('editorError').textContent=error.message||'無法讀取 Excel。';}
}

async function downloadExcelTemplate(){
  $('editorError').textContent='';
  try{
    await loadExcelJs();
    const workbook=new ExcelJS.Workbook();workbook.creator='BuiO';
    const sheet=workbook.addWorksheet('Questions',{views:[{state:'frozen',ySplit:1}]});
    sheet.columns=[{header:'question',key:'question',width:42},{header:'optionA',key:'optionA',width:22},{header:'optionB',key:'optionB',width:22},{header:'optionC',key:'optionC',width:22},{header:'optionD',key:'optionD',width:22},{header:'correctAnswer',key:'correctAnswer',width:18}];
    sheet.addRow({question:'7 × 8 等於多少？',optionA:'48',optionB:'54',optionC:'56',optionD:'64',correctAnswer:'C'});
    const header=sheet.getRow(1);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF5146A7'}};header.alignment={vertical:'middle',horizontal:'center'};header.height=25;
    sheet.autoFilter='A1:F1';sheet.getColumn(6).eachCell((cell,rowNumber)=>{if(rowNumber>1)cell.dataValidation={type:'list',allowBlank:false,formulae:['"A,B,C,D"']};});
    const buffer=await workbook.xlsx.writeBuffer();const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    const link=document.createElement('a');link.href=url;link.download='BuiO-question-bank-template.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('excelImportStatus').textContent='Excel 範本已下載';
  }catch(error){$('editorError').textContent=error.message||'無法建立 Excel 範本。';}
}

async function saveSet(){
  const title=$('editorSetTitle').value.trim(),blocks=[...$('editorQuestions').children];$('editorError').textContent='';
  try{
    if(!title)throw new Error('請輸入題庫名稱。');if(!blocks.length)throw new Error('至少需要一題。');
    const questions=blocks.map((block,index)=>{
      const question=block.querySelector('.q-question').value.trim();const choices=[...block.querySelectorAll('.q-choice-input')].map(input=>input.value.trim());const checked=block.querySelector('input[type="radio"]:checked');
      if(!question)throw new Error(`第 ${index+1} 題尚未輸入題目。`);if(choices.some(choice=>!choice))throw new Error(`第 ${index+1} 題必須填寫四個選項。`);if(!checked)throw new Error(`第 ${index+1} 題尚未標記正確答案。`);
      return{question,choices,correctIndex:Number(checked.value)};
    });
    const setBeingEdited=editingSetId;const response=await fetch(setBeingEdited?`/api/game/teacher/sets/${encodeURIComponent(setBeingEdited)}`:'/api/game/teacher/sets',{method:setBeingEdited?'PUT':'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({title,questions})});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'儲存失敗。');
    closeEditor();await loadQuestionSets(data.setId||setBeingEdited);
  }catch(error){$('editorError').textContent=error.message||'儲存失敗。';}
}

$('newSetBtn').addEventListener('click',()=>openEditor());
$('closeEditorBtn').addEventListener('click',closeEditor);$('cancelEditorBtn').addEventListener('click',closeEditor);
$('questionBankModal').addEventListener('click',event=>{if(event.target===$('questionBankModal'))closeEditor();});
$('addQuestionBtn').addEventListener('click',()=>addQuestion());$('excelImportBtn').addEventListener('click',()=>$('excelImportInput').click());
$('excelImportInput').addEventListener('change',importExcelQuestions);$('excelTemplateBtn').addEventListener('click',downloadExcelTemplate);$('saveSetBtn').addEventListener('click',saveSet);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('questionBankModal').hidden)closeEditor();});

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
