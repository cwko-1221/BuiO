import '../css/science-lab.css';
import '../../material-changes/style.css';
import '../css/material-changes-platform.css';
import { ProgressStore } from './persistence/ProgressStore.js';
import { experiments } from './data/experiments.js';

const id='material-changes';
const copy=(language,zh,en)=>language==='en'?en:zh;
const icons={notes:'<path d="M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zM8 3v16M11 8h5M11 12h5"/>',sound:'<path d="M5 9v6h4l5 4V5L9 9zM17 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3 4 0 1 3 3 1 3 3 0 4-3 1-1 3-3 3-4 0-1-3-3-1-3-3 0-4 3-1 1-3z"/>'};
const svg=key=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg>`;
async function bootPlatform() {
  const response=await fetch('/api/auth/me',{credentials:'include'});
  if(response.status===401||response.status===403){location.replace('/');return;}
  if(!response.ok)throw new Error('Unable to load the student session');
  const account=await response.json(),studentId=account?.student?.id||account?.student?.studentId;
  if(!studentId)throw new Error('Student session unavailable');
  const store=new ProgressStore(studentId),sharedSettings=ProgressStore.loadSettings();
  document.body.classList.add('platform-lab');
  document.querySelector('#bootScreen').innerHTML='<div class="loading-inner"><div class="boot-orbit" aria-hidden="true"><span class="boot-planet"></span><span class="boot-moon"></span></div><p class="loading-eyebrow">WONDER LAB</p><h1 id="bootTitle"></h1><p id="bootMessage"></p><div id="bootProgress" class="loading-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="bootFill"></span></div></div>';
  const language=window.BuiI18n?.lang==='en-US'?'en':'zh';
  document.querySelector('.topbar').innerHTML=`<a id="platformHome" class="brand brand-button" href="/science-lab"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M17 6h14v4l-3 7v5l10 16a3 3 0 0 1-3 4H13a3 3 0 0 1-3-4l10-16v-5l-3-7zM15 34c6-5 11 5 18-2"/></svg></span><div><b id="brandName"></b><span>WONDER LAB</span></div></a><nav class="header-actions topbar-actions"><span class="completion-pill" id="completionCount"></span><button id="notesButton" class="icon-button">${svg('notes')}</button><button id="soundButton" class="icon-button">${svg('sound')}</button><button id="settingsButton" class="icon-button">${svg('settings')}</button><button id="helpButton" hidden></button><a id="platformExit" class="portal-link" href="/"></a></nav><span id="experimentTitle" hidden></span>`;
  const heading=document.createElement('div');heading.id='platformLabHeading';heading.innerHTML='<a id="platformMap" href="/science-lab"></a><div class="platform-title"><b>09</b><div><small id="platformMeta"></small><h1 id="platformTitle"></h1></div></div>';document.querySelector('#laboratory').prepend(heading);
  const settingsHtml=settings=>{
    const language=settings.language,t=(zh,en)=>copy(language,zh,en);
    const toggle=(id,title,hint,checked)=>`<label class="toggle-row"><span><b>${title}</b><small>${hint}</small></span><input id="${id}" type="checkbox" ${checked?'checked':''}><i></i></label>`;
    return `<button class="dialog-close" data-action="close" aria-label="${t('關閉','Close')}">×</button><p class="section-kicker">LAB SETTINGS</p><h2>${t('實驗室設定','Lab settings')}</h2>${toggle('soundToggle',t('音效','Sound'),t('操作和成功提示音','Interaction and success sounds'),settings.sound)}${toggle('motionToggle',t('減少動態','Reduce motion'),t('減少非必要鏡頭和粒子動畫','Reduce non-essential camera and particle animations'),settings.reduced)}${toggle('contrastToggle',t('高對比提示','High contrast'),t('加強可操作器材的輪廓','Emphasise interactive objects'),settings.highContrast)}<div class="quality-row"><label for="qualitySelect"><b>${t('3D 畫質','3D quality')}</b><small>${t('低階平板建議選「流暢」','Choose Smooth on older tablets')}</small></label><select id="qualitySelect">${[['auto',t('自動','Auto')],['high',t('精緻','Detailed')],['low',t('流暢','Smooth')]].map(([value,label])=>`<option value="${value}" ${settings.quality===value?'selected':''}>${label}</option>`).join('')}</select></div><div class="quality-row"><label for="languageSelect"><b>${t('語言','Language')}</b></label><select id="languageSelect"><option value="zh" ${language==='zh'?'selected':''}>繁體中文</option><option value="en" ${language==='en'?'selected':''}>English</option></select></div><div class="quality-row"><label for="speedSelect"><b>${t('縮時速度','Time scale')}</b></label><select id="speedSelect">${[60,90,180,360].map(value=>`<option value="${value}" ${settings.speed===value?'selected':''}>×${value}</option>`).join('')}</select></div><button class="text-button" data-action="help">${t('操作及科學說明','Controls & science notes')} →</button>`;
  };
  window.BuiMaterialChangesHost={
    language,settings:sharedSettings,session:store.getSession(id),brand:['奇趣科學島','Wonder Lab'],palette:{background:'#105e6a',floor:'#bedfd4'},settingsHtml,
    progress:()=>`${store.getCompletedCount(experiments.map(d=>d.id))} / ${experiments.length}`,
    chrome(settings){
      const language=settings.language,t=(zh,en)=>copy(language,zh,en),back=`/science-lab?lang=${language==='en'?'en-US':'zh-HK'}`;
      for(const key of ['platformHome','platformMap'])document.getElementById(key).href=back;
      document.getElementById('platformMap').textContent=t('← 實驗地圖','← Experiment map');document.getElementById('platformTitle').textContent=t('可逆及不可逆變化','Reversible & irreversible changes');
      document.getElementById('platformMeta').textContent=t('物質 · 小三至小六 · 約 18 分鐘','Matter · P3–P6 · about 18 min');
      document.getElementById('platformExit').textContent=t('離開實驗室','Leave the lab');
      const sound=document.getElementById('soundButton');sound.setAttribute('aria-pressed',String(settings.sound));sound.setAttribute('aria-label',t(settings.sound?'關閉聲音':'開啟聲音',settings.sound?'Mute':'Unmute'));sound.classList.toggle('muted',!settings.sound);
    },
    save(state){if(state.complete&&!store.getExperiment(id)?.completed)store.markComplete(id,state,3);else store.saveSession(id,state);},
    saveSettings(settings){ProgressStore.saveSettings({...ProgressStore.loadSettings(),sound:settings.sound,reduceMotion:settings.reduced,highContrast:settings.highContrast,quality:settings.quality});},
  };
  await import('../../material-changes/app.js');
}
bootPlatform().catch(error=>{console.error('Material changes could not start',error);document.querySelector('#bootMessage').textContent=copy(window.BuiI18n?.lang==='en-US'?'en':'zh','無法載入實驗，請重新整理頁面。','Unable to load the experiment. Please refresh.');});
