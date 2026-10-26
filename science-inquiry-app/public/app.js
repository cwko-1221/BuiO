/* global BuiI18n */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const tr = (zh,en) => BuiI18n.pick(zh,en);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state = { role:null, account:null, scope:'published', reviewStatus:'pending', page:1, items:[], hasMore:false, busy:false, request:0,
    file:null, objectUrl:null, recorder:null, stream:null, timer:null, recording:false, cameraStarting:false, saving:false };
  const statusName = value => ({pending:tr('審核中','Under review'),published:tr('已發佈','Published'),rejected:tr('已退回','Returned')})[value];
  const kindName = value => value === 'question' ? tr('科學疑問','Science question') : tr('科學發現','Science discovery');
  const size = value => `${(value/1024/1024).toFixed(1)} MB`;
  const duration = value => `${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
  const date = value => new Date(value).toLocaleDateString(BuiI18n.lang || 'zh-HK',{month:'short',day:'numeric'});
  function notice(message,error=false) { $('notice').textContent=message; $('notice').classList.toggle('error',error); $('notice').hidden=!message; }
  function uploadError(message) { $('uploadError').textContent=message; $('uploadError').hidden=!message; }
  async function api(url,options={}) {
    const response = await fetch(`/api/science-inquiry${url}`,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json','X-BuiO-Account':state.account,...options.headers}});
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || tr('操作未能完成，請稍後重試。','Please try again later.'));
    return result;
  }
  function translateStatic() {
    const entries = {
      backLink:tr('返回學習平台 ↗','Learning platform ↗'),pageTitle:`${tr('科學探究閣','Science Inquiry Corner')}<span class="title-dot">.</span>`,
      heroDescription:tr('每一個「為甚麼」，都是發現的開始。<br>拍下生活中的小發現，一起探索大世界。','Every “why” is the start of a discovery.<br>Film a little wonder. Explore a bigger world.'),
      openUpload:tr('＋ 分享我的發現','＋ Share a discovery'), teacherLead:tr('看看同學的觀察，讓每一份好奇心被看見。','Help students share their curiosity with the school.'),
      refresh:tr('↻ 重新整理','↻ Refresh'),footerHint:tr('保護自己和同學的私隱；安全觀察，讓好奇心帶路。','Protect everyone’s privacy. Observe safely and follow your curiosity.'),
      uploadTitle:tr('分享我的發現','Share my discovery'),uploadLead:tr('你看到了甚麼有趣的現象？有甚麼想和同學一起研究？','What did you notice? What would you like to explore with your classmates?'),
      filePrompt:tr('用影片記錄你的發現','Capture your discovery'),fileLimit:tr('MP4、MOV、WebM · 最長 1 分鐘 · 最大 250 MB','MP4, MOV, WebM · Up to 1 minute · Max 250 MB'),
      chooseLabel:tr('選擇影片','Choose a video'),cameraLabel:tr('拍攝影片','Film a video'),recordVideo:tr('開啟鏡頭錄影','Record with camera'),stopRecording:tr('停止錄影','Stop recording'),
      kindLegend:tr('這次我想分享…','I would like to share…'),observationLabel:tr('科學發現','A discovery'),questionLabel:tr('科學疑問','A question'),
      titleLabel:tr('給發現一個標題（選填）','Give it a title (optional)'),descriptionLabel:tr('說說你的觀察或疑問（選填）','Describe your observation or question (optional)'),
      privacyHint:tr('拍攝時請注意安全，避免拍到他人的樣貌或個人資料。系統會在保留清晰度的同時壓縮影片；老師審核發佈後，同學才會看到。','Film safely and avoid showing other people or personal details. We compress your video while keeping it clear. Classmates can see it after a teacher approves it.'),
      cancelUpload:tr('取消','Cancel'),submitUpload:tr('提交老師審核 ↗','Submit for review ↗'),loadMore:tr('載入更多','Load more'),
    };
    for (const [id,value] of Object.entries(entries)) $(id).innerHTML=value;
    $('journey').innerHTML=[tr('留心觀察','Observe'),tr('拍片提問','Film & ask'),tr('審核後分享','Review & share')].map((label,i)=>`${i?'<i>→</i>':''}<span><b>0${i+1}</b>${label}</span>`).join('');
    $('videoTitle').placeholder=tr('例如：為甚麼冰水杯外面會出現水珠？','Why do droplets form outside a cold glass?');
    $('description').placeholder=tr('我觀察到… 我想知道…','I noticed… I wonder…');
    document.title=tr('科學探究閣 · 杯澳學校','Science Inquiry Corner · Bui O School');
  }
  function renderTabs() {
    const tabs = [['published',tr('發現廣場','Discover')],state.role==='teacher'?['review',tr('影片審核','Review videos')]:['mine',tr('我的探究','My inquiries')]];
    $('tabs').innerHTML=tabs.map(([scope,label])=>`<button type="button" class="tab" role="tab" id="tab-${scope}" aria-controls="videos" aria-selected="${scope===state.scope}" data-scope="${scope}">${label}</button>`).join('');
    $('videos').setAttribute('aria-labelledby',`tab-${state.scope}`);
    $('reviewFilters').hidden=state.scope!=='review';
    $('reviewFilters').innerHTML=['pending','published','rejected'].map(value=>`<button class="filter" aria-pressed="${value===state.reviewStatus}" data-status="${value}">${statusName(value)}</button>`).join('');
    $('sectionTitle').textContent=state.scope==='mine'?tr('我的好奇心筆記','My curiosity journal'):state.scope==='review'?tr('讓好奇心安心分享','A safe space for curiosity'):tr('生活裡，處處有科學','There’s science all around us');
    $('sectionDescription').textContent=state.scope==='mine'?tr('查看你的影片、審核進度和老師的回饋。','Your videos, review progress, and teacher feedback.'):state.scope==='review'?tr('先觀看影片，再審核內容與私隱；發佈後，全校同學便能觀看。','Watch each video and check its content and privacy before publishing it for the school.'):tr('看看同學眼中的奇妙現象，為你喜歡的科學探究點個讚。','Explore your classmates’ discoveries and like the inquiries that inspire you.');
  }
  const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function card(item) {
    const review=state.scope==='review';
    const title=item.title||tr('未命名的探究','Untitled inquiry');
    return `<article class="video-card" data-id="${esc(item.id)}"><div class="video-wrap"><video controls playsinline preload="none" poster="${esc(item.posterUrl)}" src="${esc(item.videoUrl)}" aria-label="${esc(title)}"></video><span class="duration">${duration(item.duration)}</span></div><div class="card-content"><div class="card-top"><span class="kind-badge ${item.kind==='question'?'question':''}">${kindName(item.kind)}</span>${state.scope!=='published'?`<span class="status-badge ${item.status}">${statusName(item.status)}</span>`:''}</div><h3>${esc(title)}</h3>${item.description ? `<p class="video-description">${esc(item.description)}</p>` : ''}<div class="card-bottom"><div class="author">${esc(item.authorName)}${item.own?` · ${tr('我','Me')}`:''}<small>${date(item.publishedAt||item.createdAt)} · ${size(item.videoBytes)}</small></div>${item.status==='published'?`<button class="like" data-like="${esc(item.id)}" aria-label="${item.liked?tr('取消點讚','Unlike'):tr('點讚','Like')}" aria-pressed="${item.liked}" ${state.role==='teacher'?'disabled':''}>${heart}<span>${item.likeCount}</span></button>`:''}</div>${item.reviewNote?`<p class="review-note"><strong>${tr('老師回饋：','Teacher feedback: ')}</strong>${esc(item.reviewNote)}</p>`:''}${review?`<div class="review-box"><label for="note-${item.id}">${tr('審核意見（退回時必填）','Review note (required when returning)')}</label><textarea id="note-${item.id}" data-note maxlength="500" rows="2" placeholder="${tr('給同學一點建議…','Leave a suggestion…')}"></textarea><div class="review-actions">${item.status!=='published'?`<button class="primary" data-review="published">${tr('審核通過並發佈','Approve & publish')}</button>`:''}${item.status!=='rejected'?`<button class="danger" data-review="rejected">${item.status==='published'?tr('下架並退回','Unpublish & return'):tr('退回修改','Return for changes')}</button>`:''}${item.status==='rejected'?`<button class="secondary" data-review="pending">${tr('重新審核','Review again')}</button>`:''}</div></div>`:''}</div></article>`;
  }
  function renderVideos() {
    $('videos').innerHTML=state.items.length?state.items.map(card).join(''):`<div class="empty"><span class="empty-symbol" aria-hidden="true">✧</span><strong>${state.scope==='mine'?tr('第一個發現，由你開始','Your first discovery starts here'):state.scope==='review'?tr('這裡暫時沒有影片','No videos here yet'):tr('好奇的眼睛，準備好了嗎？','Ready to get curious?')}</strong>${state.scope==='mine'?tr('拍下你的科學觀察或疑問，提交老師審核。','Film an observation or question and submit it for review.'):state.scope==='review'?tr('學生上傳影片後，便會出現在「審核中」。','New student uploads will appear under “Under review”.'):tr('老師審核發佈的科學探究影片，會在這裡和大家見面。','Teacher-approved discoveries will appear here for everyone to explore.')}</div>`;
    $('loadMore').hidden=!state.hasMore;
  }
  async function load(more=false) {
    const request=++state.request;
    state.busy=true; $('refresh').disabled=true; $('loadMore').disabled=true;
    if (!more) { state.items=[]; $('loadMore').hidden=true; $('videos').innerHTML=`<div class="empty">${tr('正在尋找生活中的科學…','Finding everyday science…')}</div>`; }
    try {
      const result=await api(`/videos?scope=${state.scope}&status=${state.reviewStatus}&page=${more?state.page+1:1}`);
      if (request!==state.request) return;
      state.items=more?[...state.items,...result.items]:result.items; state.page=result.page; state.hasMore=result.hasMore; renderVideos();
    } catch(error) { if(request===state.request){notice(error.message,true); if(!more)$('videos').innerHTML='';} }
    finally { if(request===state.request){state.busy=false;$('refresh').disabled=false;$('loadMore').disabled=false;} }
  }
  function stopStream() { state.stream?.getTracks().forEach(track=>track.stop()); state.stream=null; clearInterval(state.timer); state.timer=null; }
  function releasePreview() { if(state.objectUrl)URL.revokeObjectURL(state.objectUrl); state.objectUrl=null; $('preview').pause();$('preview').srcObject=null;$('preview').removeAttribute('src');$('preview').load();$('preview').hidden=true; }
  function closeDialog() {
    if(state.saving)return;
    state.cameraStarting=false;
    if(state.recorder?.state==='recording'){state.recorder.onstop=null;state.recorder.stop();}
    state.recording=false;state.recorder=null;stopStream();releasePreview();state.file=null;
    $('uploadDialog').close();$('uploadForm').reset();$('selectedFile').textContent='';$('recordingStatus').hidden=true;
    $('stopRecording').hidden=true;$('recordVideo').hidden=false;$('recordVideo').disabled=false;$('submitUpload').disabled=false;
    $('videoFile').disabled=false;$('cameraFile').disabled=false;uploadError('');$('uploadProgress').hidden=true;
  }
  function chooseFile(file) {
    uploadError('');
    if(!file)return;
    if(state.recording || state.saving)return;
    releasePreview();state.file=null;$('selectedFile').textContent='';
    if(file.size>250*1024*1024){uploadError(tr('影片不可超過 250 MB。','The video must be under 250 MB.'));return;}
    if(!file.size){uploadError(tr('這個影片檔案是空的，請重新選擇。','This file is empty. Please choose another video.'));return;}
    state.file=file;state.objectUrl=URL.createObjectURL(file);
    $('preview').src=state.objectUrl;$('preview').hidden=false;$('preview').controls=true;$('preview').muted=false;
    $('selectedFile').textContent=`${file.name} · ${size(file.size)}`;
    $('preview').onloadedmetadata=()=>{
      if(Number.isFinite($('preview').duration)&&$('preview').duration>60.1){uploadError(tr('影片最長為 1 分鐘，請先剪輯後再上傳。','Please trim the video to 1 minute or less.'));state.file=null;}
    };
  }
  async function record() {
    uploadError('');
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){uploadError(tr('這個瀏覽器未能直接錄影，請使用「拍攝影片」或選擇已拍好的影片。','Use “Film a video” or choose an existing video on this browser.'));return;}
    state.cameraStarting=true;$('recordVideo').disabled=true;
    let stream;
    try {
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}},audio:true});
      if(!state.cameraStarting||!$('uploadDialog').open){stream.getTracks().forEach(track=>track.stop());return;}
      releasePreview();state.file=null;state.stream=stream;
      $('preview').srcObject=stream;$('preview').hidden=false;$('preview').muted=true;$('preview').controls=false;await $('preview').play();
      if(!state.cameraStarting||!$('uploadDialog').open){stopStream();return;}
      const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp8,opus','video/webm'].find(value=>MediaRecorder.isTypeSupported(value));
      const chunks=[];let bytes=0;
      state.recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:3500000,audioBitsPerSecond:128000});
      const recorder=state.recorder;
      recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;}if(bytes>240*1024*1024&&recorder.state==='recording')recorder.stop();};
      recorder.onstop=()=>{
        stopStream();state.recording=false;state.recorder=null;$('stopRecording').hidden=true;$('recordVideo').hidden=false;
        $('submitUpload').disabled=false;$('videoFile').disabled=false;$('cameraFile').disabled=false;$('recordingStatus').hidden=true;
        const type=recorder.mimeType.split(';')[0]||'video/webm';
        chooseFile(new File(chunks,`science-discovery.${type.includes('mp4')?'mp4':'webm'}`,{type}));
      };
      recorder.onerror=()=>{uploadError(tr('錄影中斷，請重新錄影。','Recording was interrupted. Please try again.'));if(recorder.state==='recording')recorder.stop();stopStream();};
      recorder.start(1000);state.recording=true;$('recordVideo').hidden=true;$('stopRecording').hidden=false;
      $('videoFile').disabled=true;$('cameraFile').disabled=true;$('submitUpload').disabled=true;$('recordingStatus').hidden=false;
      const started=Date.now();
      const tick=()=>{const elapsed=(Date.now()-started)/1000;$('recordingStatus').textContent=`● ${tr('錄影中','Recording')} ${duration(elapsed)} / 1:00`;if(elapsed>=59&&recorder.state==='recording')recorder.stop();};
      tick();state.timer=setInterval(tick,500);
    } catch(error) {stream?.getTracks().forEach(track=>track.stop());stopStream();uploadError(tr('未能開啟鏡頭和咪高峰，請檢查權限，或選擇已拍好的影片。','Check camera and microphone permissions, or choose an existing video.'));}
    finally{state.cameraStarting=false;$('recordVideo').disabled=false;}
  }
  async function submit(event) {
    event.preventDefault();if(state.saving||state.recording)return;uploadError('');
    if(!state.file){uploadError(tr('請先選擇或拍攝一段影片。','Choose or record a video first.'));return;}
    const title=$('videoTitle').value.trim(),description=$('description').value.trim();
    const body=new FormData();body.append('title',title);body.append('description',description);body.append('kind',new FormData($('uploadForm')).get('kind'));body.append('video',state.file);
    state.saving=true;$('uploadProgress').hidden=false;$('progress').value=0;
    for(const element of $('uploadForm').elements)element.disabled=true;
    $('closeUpload').disabled=true;$('progressText').textContent=tr('正在上傳影片…','Uploading video…');
    let result;
    try {
      result=await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhr.open('POST','/api/science-inquiry/videos');xhr.setRequestHeader('X-BuiO-Account',state.account);xhr.timeout=360000;
        xhr.upload.onprogress=progress=>{if(progress.lengthComputable){$('progress').value=Math.min(95,Math.round(progress.loaded/progress.total*95));$('progressText').textContent=`${tr('正在上傳影片','Uploading video')} ${Math.round(progress.loaded/progress.total*100)}%`;}};
        xhr.upload.onload=()=>{$('progress').removeAttribute('value');$('progressText').textContent=tr('上傳完成，正在壓縮及儲存影片，請保持頁面開啟…','Upload complete. Compressing and saving your video. Please keep this page open…');};
        xhr.onload=()=>{try{const data=JSON.parse(xhr.responseText);if(xhr.status>=200&&xhr.status<300&&data.success)resolve(data);else reject(new Error(data.message||tr('上傳失敗，請稍後重試。','Upload failed. Please try again.')));}catch(error){reject(error);}};
        xhr.onerror=()=>reject(new Error(tr('網絡中斷，請先查看「我的探究」確認是否已提交，再重新上傳。','Connection lost. Check “My inquiries” before trying again.')));
        xhr.ontimeout=()=>reject(new Error(tr('處理時間較長，請先查看「我的探究」確認結果。','Processing timed out. Check “My inquiries” for the result.')));xhr.send(body);
      });
    } catch(error) {uploadError(error.message);$('uploadProgress').hidden=true;}
    finally{state.saving=false;for(const element of $('uploadForm').elements)element.disabled=false;$('closeUpload').disabled=false;}
    if(result){const item=result.item;closeDialog();state.scope='mine';renderTabs();await load();const saving=Math.max(0,Math.round((1-item.videoBytes/item.originalBytes)*100));notice(tr(`影片已提交，現正審核中。${saving>0?`影片大小已減少 ${saving}%。`:''}老師發佈後，同學便可觀看。`,`Submitted for review.${saving>0?` Video size reduced by ${saving}%.`:''} Classmates can watch after a teacher publishes it.`));}
  }
  $('tabs').addEventListener('click',event=>{const button=event.target.closest('[data-scope]');if(!button||state.scope===button.dataset.scope)return;state.scope=button.dataset.scope;notice('');renderTabs();load();});
  $('tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...$('tabs').querySelectorAll('button')];const i=tabs.indexOf(document.activeElement);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;event.preventDefault();tabs[next].click();tabs[next].focus();});
  $('reviewFilters').addEventListener('click',event=>{const button=event.target.closest('[data-status]');if(!button)return;state.reviewStatus=button.dataset.status;notice('');renderTabs();load();});
  $('refresh').addEventListener('click',()=>{notice('');load();});$('loadMore').addEventListener('click',()=>load(true));
  $('openUpload').addEventListener('click',()=>{$('uploadDialog').showModal();});
  $('closeUpload').addEventListener('click',closeDialog);$('cancelUpload').addEventListener('click',closeDialog);
  $('uploadDialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  $('videoFile').addEventListener('change',event=>chooseFile(event.target.files[0]));$('cameraFile').addEventListener('change',event=>chooseFile(event.target.files[0]));
  $('recordVideo').addEventListener('click',record);$('stopRecording').addEventListener('click',()=>{if(state.recorder?.state==='recording')state.recorder.stop();});
  $('uploadForm').addEventListener('submit',submit);
  window.addEventListener('beforeunload',event=>{if(state.saving||state.recording){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',stopStream);
  $('videos').addEventListener('play',event=>{if(event.target.tagName==='VIDEO')$('videos').querySelectorAll('video').forEach(video=>{if(video!==event.target)video.pause();});},true);
  $('videos').addEventListener('click',async event=>{
    const like=event.target.closest('[data-like]'),review=event.target.closest('[data-review]');if(!like&&!review)return;
    const element=event.target.closest('[data-id]');const item=state.items.find(row=>row.id===element.dataset.id);if(!item)return;
    const controls=like?[like]:[...element.querySelectorAll('button,textarea')];controls.forEach(control=>control.disabled=true);
    try {
      if(like){const result=await api(`/videos/${item.id}/like`,{method:'PUT',body:JSON.stringify({liked:!item.liked})});Object.assign(item,result);like.setAttribute('aria-pressed',String(item.liked));like.setAttribute('aria-label',item.liked?tr('取消點讚','Unlike'):tr('點讚','Like'));like.querySelector('span').textContent=item.likeCount;}
      else{const note=element.querySelector('[data-note]').value.trim();if(review.dataset.review==='rejected'&&!note)throw new Error(tr('請先填寫退回原因。','Please explain why the video is being returned.'));await api(`/videos/${item.id}/review`,{method:'POST',body:JSON.stringify({status:review.dataset.review,note,revision:item.revision})});await load();notice(tr('審核結果已儲存。','Review saved.'));}
    }catch(error){notice(error.message,true);}finally{controls.forEach(control=>control.disabled=false);}
  });
  async function boot() {
    translateStatic();
    try{const result=await api('/meta');state.role=result.role;state.account=result.studentId;$('roleLabel').textContent=state.role==='teacher'?tr('老師模式','Teacher mode'):tr('學生模式','Student mode');$('openUpload').hidden=state.role!=='student';$('teacherLead').hidden=state.role!=='teacher';renderTabs();await load();}
    catch(error){notice(error.message,true);$('videos').innerHTML='';}
  }
  boot();
})();
