import { MATERIALS, materialById, text, name, RECORD_CHOICES, RECORD_STORY, recordChoiceText, COPY as CONTENT_ARRAYS } from './data.js';
import { ChangeSimulation, stateKey } from './simulation.js';
import { ChangeScene } from './scene.js';
import { charcoalThumbnail } from './charcoal.js';

const observationImage = new URL('./assets/ice-water-ice.webp', import.meta.url).href;
const materialAtlas = new URL('./assets/material-icons.webp', import.meta.url).href;
let charcoalIcon=null;
const $ = selector => document.querySelector(selector);
const platformHost=window.BuiMaterialChangesHost??null;
const storage = { get(key) { try { return localStorage.getItem(key); } catch { return null; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
const settings = { language: platformHost?.language??(storage.get('change-lab-language') === 'en' ? 'en' : 'zh'), sound: platformHost?.settings.sound??false,
  reduced: platformHost?.settings.reduceMotion??matchMedia('(prefers-reduced-motion: reduce)').matches, speed: 90,
  highContrast:platformHost?.settings.highContrast??false,quality:platformHost?.settings.quality??'auto' };
const simulation = new ChangeSimulation();
let selected = 'ice', phase = 'loading', prediction = null, paused = false, analysisStep = 0;
let chapterTarget = null, chapterRemaining = 0, bootMessageKey = 'bootOpening';
const flowHistory = [];
let dialogType = null, promptChoice = null, observationStage = null, dismissedQuestion = null, pendingQuestionKey = null, pendingQuestionSince = 0;
let audio, toastTimer, scene, last = performance.now(), uiClock = 0;
let saveClock=0,resumePhase=null;
const savedPlatform=platformHost?.session;
if(savedPlatform?.schema===1 && simulation.restore(savedPlatform.simulation)){
  selected=materialById[savedPlatform.selected]?savedPlatform.selected:'ice';
  prediction=[0,1,2].includes(savedPlatform.prediction)?savedPlatform.prediction:null;
  analysisStep=savedPlatform.analysisStep===1?1:0;
  resumePhase=['observe','wonder','hypothesis','lab','analysis','complete'].includes(savedPlatform.phase)?savedPlatform.phase:'observe';
  if(prediction===null && ['lab','analysis','complete'].includes(resumePhase))resumePhase='hypothesis';
  if(['analysis','complete'].includes(resumePhase)&&!simulation.canAnalyse())resumePhase='lab';
  if([60,90,180,360].includes(savedPlatform.speed))settings.speed=savedPlatform.speed;
}
const t = key => platformHost&&key==='brand'?platformHost.brand[settings.language==='en'?1:0]:platformHost&&key==='records'?(settings.language==='en'?'Science notebook':'科學筆記'):text(key, settings.language);
function savePlatformSession(){
  if(!platformHost || phase==='loading')return;
  platformHost.save({schema:1,phase:phase==='chapter'?chapterTarget:phase,selected,prediction,analysisStep,speed:settings.speed,simulation:simulation.serialize(),complete:phase==='complete'});
  $('#completionCount').textContent=platformHost.progress();
}
function applyPlatformSettings(){
  document.body.classList.toggle('high-contrast',settings.highContrast);
  scene?.setQuality(settings.quality);platformHost?.saveSettings(settings);platformHost?.chrome(settings);
}
function n(id) {
  if(id==='charcoal'){const b=simulation.samples.charcoal.burned;return b>.999?t('ashName'):b>.001?t('charcoalAshName'):name(id,settings.language);}
  if(id!=='ice') return name(id,settings.language);
  const s=simulation.samples.ice;
  if(s.liquid>.999) return t('waterName');
  if(s.liquid>.001) return t('iceWaterName');
  return s.heated?t('iceName'):name(id,settings.language);
}
let lastIceLabel=null;
function nameText(element, next) {
  if(!element || element.textContent===next) return;
  const old=element.textContent; element.textContent=next;
  if(!old) return;
  element.classList.remove('name-transition');
  if(!settings.reduced) {void element.offsetWidth;element.classList.add('name-transition');element.animate([{transform:'translateY(-5px) scale(.8)',opacity:.25},{transform:'translateY(0) scale(1.2)',opacity:1,offset:.5},{transform:'scale(1)',opacity:1}],{duration:700,easing:'cubic-bezier(.2,.8,.2,1)'});}
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function beep() {
  if (!settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain(); oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.frequency.setValueAtTime(560, audio.currentTime); oscillator.frequency.exponentialRampToValueAtTime(720, audio.currentTime + .07);
    gain.gain.setValueAtTime(.025, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .11);
    oscillator.start(); oscillator.stop(audio.currentTime + .12);
  } catch { /* Sound is optional, including in an opaque Sites sandbox. */ }
}
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
}
function renderChrome() {
  document.documentElement.lang = settings.language === 'en' ? 'en' : 'zh-Hant';
  document.body.classList.toggle('reduced-motion',settings.reduced);
  document.body.classList.toggle('high-contrast',settings.highContrast);
  document.title = `${t('title')} | ${t('brand')}`;
  $('#bootTitle').textContent = t('brand'); $('#bootMessage').textContent = t(bootMessageKey);
  $('#bootProgress').setAttribute('aria-label', settings.language === 'zh' ? '載入進度' : 'Loading progress');
  for (const [id, key] of Object.entries({ brandName: 'brand', experimentTitle: 'title', missionText: 'choose', analyseButton: 'analyse', selectedLabel: 'selected', temperatureLabel: 'temperature', freshButton: 'reset' })) $(`#${id}`).textContent = t(key);
  for (const [id, key] of Object.entries({ notesButton: 'records', helpButton: 'help', settingsButton: 'settings', cameraButton: 'resetView', pauseButton: paused ? 'resume' : 'pause' })) {
    $(`#${id}`).setAttribute('aria-label', t(key)); $(`#${id}`).title = t(key);
  }
  $('#labCanvas').setAttribute('aria-label', settings.language === 'en' ? 'Interactive 3D experiment bench' : '互動 3D 實驗桌');
  $('#world').setAttribute('aria-label', t('title')); $('#materialChoices').parentElement.setAttribute('aria-label', t('choose'));
  $('#materialChoices').innerHTML = MATERIALS.map((d, i) => `<button class="material-choice" data-material="${d.id}" aria-pressed="${d.id === selected}"><span class="material-picture" aria-hidden="true">${d.id==='charcoal'?(charcoalIcon?`<img src="${charcoalIcon}" alt="" draggable="false" style="left:0;top:0;width:100%;height:100%;object-fit:contain">`:''):`<img src="${materialAtlas}" alt="" draggable="false" style="left:${-(i % 3) * 100}%;top:${-Math.floor(i / 3) * 100}%">`}</span><span class="material-name">${n(d.id)}</span></button>`).join('');
  $('#labels').innerHTML = MATERIALS.map(d => `<div class="scene-label" data-label="${d.id}"><span class="label-word">${n(d.id)}</span></div>`).join('') + ['heat', 'cool', 'freeze'].map((id, i) => `<div class="scene-label station-label" data-station-label="${id}">${t(['heater', 'cooler', 'freezer'][i])}</div>`).join('');
  platformHost?.chrome(settings);
  refresh();
}
function selectedSample() { return simulation.samples[selected]; }
function sampleHint(s) {
  if(s.held || s.location==='bench' && s.visits) return 'offStation';
  if (s.cooled) return 'restored';
  if (s.id === 'egg' && s.location === 'freeze') return 'freezingEgg';
  if (s.heated && s.id === 'ice' && ['cool', 'bench'].includes(s.location)) return 'warmWater';
  if (s.location === 'heat') return s.heated ? 'changed' : 'heating';
  if (s.location === 'cool' || s.location === 'freeze') return 'cooling';
  return s.heated ? 'changed' : 'ready';
}
function refresh() {
  const s = selectedSample(), d = materialById[selected], count = simulation.records().length;
  nameText($('#sampleName'),n(selected)); $('#sampleIndex').textContent = `${MATERIALS.indexOf(d) + 1}`.padStart(2, '0');
  $('#temperatureValue').textContent = s.temperature.toFixed(1).replace('-', '−');
  $('#initialTemperature').textContent = `${t('initial')} ${d.initial < 0 ? '−' + -d.initial : d.initial} °C`;
  $('#sampleState').textContent = t(stateKey(s)); $('#sampleHint').textContent = t(sampleHint(s)); $('#sampleHint').title = t(sampleHint(s));
  $('#thermalFill').style.width = `${Math.max(0, Math.min(100, (s.temperature + 12) / (Math.max(170,d.heat)+12) * 100))}%`;
  $('#thermalFill').style.background = s.location === 'heat' ? '#d68e68' : '#78abc2';
  $('#completionCount').textContent = platformHost?.progress()??`${count} / 6`; $('#completionCount').title = platformHost?t('brand'):`${count} ${t('samples')}`;
  $('#missionText').textContent = simulation.activeId ? t('lockedMission') : simulation.canAnalyse() ? (settings.language === 'zh' ? '證據已足夠，可以進入分析' : 'Your evidence is ready to analyse') : t('choose');
  $('.mission').classList.toggle('ready', simulation.canAnalyse());
  $('#modelBadge').textContent = `${t('modelTag')} ×${settings.speed}`;
  for (const button of document.querySelectorAll('[data-material]')) {
    button.setAttribute('aria-pressed', `${button.dataset.material === selected}`);
    button.classList.toggle('recorded', Boolean(simulation.samples[button.dataset.material].record));
    button.disabled=!simulation.isSelectable(button.dataset.material);
    button.title=button.disabled?t('finishRecord'):n(button.dataset.material);
    nameText(button.querySelector('.material-name'),n(button.dataset.material));
  }
  for(const label of document.querySelectorAll('[data-label]')) {
    nameText(label.querySelector('.label-word'),n(label.dataset.label));
    label.dataset.state=label.dataset.label==='ice'?(simulation.samples.ice.liquid>.999?'water':simulation.samples.ice.liquid<.001?'ice':'mixed'):'';
  }
  const label=n('ice');
  if(lastIceLabel!==null && label!==lastIceLabel && phase==='lab' && ['water','ice'].includes($('#labels [data-label="ice"]').dataset.state)) toast(t(simulation.samples.ice.liquid>.999?'waterChanged':'iceChanged'));
  lastIceLabel=label;
  const heatLabel=$('[data-station-label="heat"]');
  if(heatLabel)heatLabel.textContent=t(simulation.samples.charcoal.location==='heat'?'furnace':'heater');
  automaticObservation();
}
function questionKey() { const s=selectedSample(), step=simulation.questionStage(selected); return step?`${s.id}:${s.cycles}:${step}`:null; }
function openObservation() { observationStage=simulation.questionStage(selected); if(!observationStage)return; promptChoice=null; openDialog('observation'); }
function automaticObservation() {
  const s=selectedSample(), step=simulation.questionStage(selected), key=questionKey();
  if(key!==pendingQuestionKey) {pendingQuestionKey=key;pendingQuestionSince=performance.now();}
  const resume=Boolean(step && dismissedQuestion===key);
  $('#observationCue').hidden=phase!=='lab' || Boolean(s.record) || (!step && (s.location==='bench' || s.held));
  $('#resumeObservation').hidden=!resume; $('#resumeObservation').textContent=t('resumeObservation');
  $('#observationCueText').textContent=t(resume?'pendingObservation':s.held?'offStation':s.heated && ['heat','bench'].includes(s.location)?'tryCooling':'watchChange');
  if(phase==='lab' && step && !paused && !dialogType && !s.held && !scene?.drag && dismissedQuestion!==key && performance.now()-pendingQuestionSince>700) openObservation();
}
function selectMaterial(id) { if (!materialById[id]) return false; if(!simulation.isSelectable(id)){toast(t('finishRecord'));return false;} selected = id; scene?.setSelected(id); refresh(); beep();return true; }
function moveMaterial(id, location) {
  if (phase !== 'lab') return;
  if(!simulation.isSelectable(id)){toast(t('finishRecord'));return;}
  const displaced = simulation.move(id, location); selectMaterial(id);
  if(location==='freeze' && id!=='ice') toast(t('freezeExplore'));
  if (displaced) toast(`${n(displaced)} · ${t('bench')}`);
  refresh();
}
function shell(content, className = '') {
  return `<div class="stage-shell ${className}"><div class="stage-eyebrow">${platformHost?'WONDER LAB':'CHANGE LAB'} <span> / </span> ${t('title')}</div>${content}</div>`;
}
function footer(left, right) { return `<div class="stage-footer">${left}${right}</div>`; }
function enterChapter(target) {
  chapterTarget = target; chapterRemaining = settings.reduced ? 900 : 1900;
  phase = 'chapter'; stage(); $('#stage').scrollTop = 0;
}
function advanceChapter() {
  if (phase !== 'chapter') return;
  phase = chapterTarget; chapterTarget = null; chapterRemaining = 0;
  stage(); $('#stage').scrollTop = 0;
}
function stage() {
  savePlatformSession();
  const beat = phase === 'chapter' ? `chapter-${chapterTarget}` : phase;
  if (flowHistory.at(-1) !== beat) flowHistory.push(beat);
  $('#stage').dataset.kind = phase; $('#stage').dataset.slide = beat;
  $('#stage').hidden = phase === 'lab'; $('#laboratory').inert = phase !== 'lab';
  $('#notesButton').disabled = phase !== 'lab';
  scene && (scene.controls.enabled = phase === 'lab' && !dialogType);
  if (phase === 'lab') return;
  if (phase === 'loading') { $('#stageContent').replaceChildren(); return; }
  if (phase === 'chapter') {
    const keys = chapterTarget === 'observe' ? ['chapterOne','chapterObserve','chapterObserveLead'] : chapterTarget === 'hypothesis' ? ['chapterTwo','chapterHypothesis','chapterHypothesisLead'] : ['chapterFour','chapterAnalyse','chapterAnalyseLead'];
    $('#stageContent').innerHTML = `<div class="chapter-card" role="button" tabindex="0"><span class="chapter-step">${t(keys[0])}</span><h2>${t(keys[1])}</h2><p>${t(keys[2])}</p></div>`;
    return;
  }
  if (phase === 'observe') {
    $('#stageContent').innerHTML = shell(`<h2>${t('observe')}</h2><div class="observation-grid"><figure class="observation-figure"><img src="${observationImage}" alt="${escape(settings.language === 'zh' ? '示意圖：冰塊受熱熔化成水，冷凍後重新凝固成冰。' : 'Ice melts into water and freezes back into ice.')}"><figcaption class="captions">${pairList('captions').map(label => `<span>${label}</span>`).join('')}</figcaption></figure><div class="observation-copy"><p>${t('observeText')}</p></div></div>${footer(`<span>${t('chapterOne')} · ${t('chapterObserve')}</span>`, `<button class="primary" data-action="wonder">${t('next')} →</button>`)}`);
  } else if (phase === 'wonder') {
    $('#stageContent').innerHTML = shell(`<h2>${t('wonderTitle')}</h2><div class="wonder standalone-wonder">${t('wonder')}</div>${footer(`<button class="text-button" data-action="observe">← ${t('back')}</button>`, `<button class="primary" data-action="hypothesis">${t('toHypothesis')} →</button>`)}`, 'question-shell');
  } else if (phase === 'hypothesis') {
    const options = predictionLabels().map((label, i) => `<button class="prediction-option" data-prediction="${i}" aria-pressed="${prediction === i}"><span class="option-letter">${'ABC'[i]}</span><span>${label}</span></button>`).join('');
    $('#stageContent').innerHTML = shell(`<h2>${t('hypothesis')}</h2><p class="stage-lead">${t('hypothesisHint')}</p><div class="prediction-options">${options}</div>${footer(`<button class="text-button" data-action="wonder">← ${t('back')}</button>`, `<button class="primary" data-action="begin" ${prediction === null ? 'disabled' : ''}>${t('begin')} →</button>`)}`, 'hypothesis-shell');
  } else if (phase === 'analysis') renderAnalysis();
  else if (phase === 'complete') {
    $('#stageContent').innerHTML = shell(`<div class="success-orbit" aria-hidden="true">✓</div><h2>${t('success')}</h2><p class="stage-lead">${t('conclusion')}</p><p class="stage-lead">${prediction === 1 ? t('supported') : t('modified')}</p><p class="science-note">${t('scope')}</p>${footer(`<span>${simulation.records().length} / 6 ${t('samples')} · ${t('complete')}</span>`, `<button class="primary" data-action="lab">${t('continue')} →</button>`)}`, 'success-shell');
  }
}
// Array-valued content uses a dedicated accessor; text() is for bilingual pairs.
function pairList(key) { return CONTENT_ARRAYS[key].map(pair => pair[settings.language === 'en' ? 1 : 0]); }
function predictionLabels() { return pairList('predictions'); }
function coldHeading(s) { return t(s.cold?.location === 'freeze' ? 'afterFreeze' : 'afterCool'); }
function evidenceSequence(s, draft = null, reveal = true) {
  const languageIndex=settings.language==='en'?1:0, story=RECORD_STORY[s.id];
  const steps=[
    {title:t('beforeChange'),label:story.initial[languageIndex],temp:materialById[s.id].initial},
    {title:t('afterHeat'),label:reveal?story.hot[languageIndex]:draft?.hot?recordChoiceText(s.id,draft.hot,settings.language):t('chooseBelow'),temp:s.hot?.temperature},
    {title:coldHeading(s),label:reveal?story.cold[languageIndex]:draft?.cold?recordChoiceText(s.id,draft.cold,settings.language):t('chooseBelow'),temp:s.cold?.temperature},
  ];
  return `<div class="evidence-sequence" aria-label="${t('comparePrompt')}">${steps.map((step,i)=>`<div class="evidence-step"><small>${i+1} · ${step.title}</small><strong>${step.label}</strong><span>${step.temp?.toFixed(1)} °C</span></div>${i<2?'<span class="evidence-arrow" aria-hidden="true">→</span>':''}`).join('')}</div>`;
}
function verdictExplanation(id) { return t(id==='ice'?'iceCycle':`${id}Explain`); }
function recordCard(s, explanation = false) {
  const r = s.record;
  const evidence={...s,hot:r.hotEvidence,cold:r.coldEvidence};
  return `<article class="record-card" data-evidence="${s.id}"><h3>${s.id==='ice'?t('iceSample'):name(s.id,settings.language)} <span class="verdict ${r.verdict}">✓ ${t(r.verdict)}</span></h3>${evidenceSequence(evidence)}<p class="evidence-explanation">${verdictExplanation(s.id)}</p></article>`;
}
function renderAnalysis() {
  const records = simulation.records();
  if (analysisStep === 0) {
    $('#stageContent').innerHTML = shell(`<h2>${t('evidenceTitle')}</h2><p class="stage-lead">${t('evidenceLead')}</p><div class="evidence-list">${records.map(s => recordCard(s)).join('')}</div><div class="analysis-question">${t('conclusionQuestion')}</div><div class="quiz-options">${predictionLabels().map((label, i) => `<button data-conclusion="${i}">${label}</button>`).join('')}</div><p id="analysisFeedback" class="form-feedback" role="status"></p>${footer(`<button class="text-button" data-action="lab">← ${t('continue')}</button>`, '<span>01 / 02</span>')}`, 'analysis-shell');
  } else {
    $('#stageContent').innerHTML = shell(`<h2>${t('challenge')}</h2><p class="stage-lead">${t('challengeText')}</p><div class="quiz-options"><button data-challenge="yes">${t('yes')}</button><button data-challenge="no">${t('no')}</button></div><p id="analysisFeedback" class="form-feedback" role="status"></p><div class="evidence-list">${records.map(s => recordCard(s, true)).join('')}</div><p class="science-note">${t('scope')}</p>${footer(`<button class="text-button" data-action="evidence">← ${t('back')}</button>`, '<span>02 / 02</span>')}`, 'analysis-shell');
  }
}
function openDialog(type) {
  dialogType = type; scene && (scene.controls.enabled = false); renderDialog();
  if (!$('#dialog').open) $('#dialog').showModal();
}
function closeDialog(dismiss = true) {
  if(dismiss && dialogType==='observation') dismissedQuestion=questionKey();
  $('#dialog').close(); dialogType = null; promptChoice=null; observationStage=null;
  scene && (scene.controls.enabled = phase === 'lab');
}
function dialogHeader(title) { return `<div class="dialog-header"><h2>${title}</h2><button class="icon-button" data-action="close" aria-label="${t('close')}">×</button></div>`; }
function renderDialog() {
  $('#dialog').classList.toggle('observation-dialog',dialogType==='observation');
  if(platformHost){$('#dialog').classList.toggle('settings-dialog',dialogType==='settings');$('#dialog').classList.toggle('glass-dialog',dialogType!=='records');$('#dialog').classList.toggle('drawer-dialog',dialogType==='records');}
  let content;
  if(dialogType==='settings' && platformHost)content=platformHost.settingsHtml(settings);
  else if (dialogType === 'settings') {
    content = dialogHeader(t('settings')) + `<label class="setting-row">${t('language')}<select id="languageSelect"><option value="zh" ${settings.language === 'zh' ? 'selected' : ''}>繁體中文</option><option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option></select></label><label class="setting-row">${t('speed')}<select id="speedSelect">${[60, 90, 180, 360].map(value => `<option value="${value}" ${settings.speed === value ? 'selected' : ''}>×${value}</option>`).join('')}</select></label><label class="setting-row">${t('sound')}<input id="soundToggle" type="checkbox" ${settings.sound ? 'checked' : ''}></label><label class="setting-row">${t('motion')}<input id="motionToggle" type="checkbox" ${settings.reduced ? 'checked' : ''}></label><p class="science-note">${t('model')}</p><p class="science-note">${t('safety')}</p>`;
  } else if (dialogType === 'help') content = dialogHeader(t('help')) + `<p class="dialog-copy">${t('helpText')}</p><p class="science-note">${t('helpScience')}</p><p class="science-note">${t('charcoalModel')}</p><p class="science-note">${t('safety')}</p>`;
  else if (dialogType === 'records') content = dialogHeader(t('records')) + (simulation.records().length ? simulation.records().map(s => recordCard(s)).join('') : `<p class="dialog-copy">${t('empty')}</p>`);
  else if (dialogType === 'fresh') content = dialogHeader(`${n(selected)} · ${t('reset')}`) + `<p class="dialog-copy">${t('resetQuestion')}</p><div class="stage-footer"><button data-action="close">${t('cancel')}</button><button class="primary" data-action="reset-sample">${t('confirm')}</button></div>`;
  else if (dialogType === 'observation') {
    const s=selectedSample(), group=observationStage, expected=simulation.expected(selected)[group];
    const choices=group==='verdict'?['reversible','irreversible','unsure'].map(value=>({value,label:[text(value,'zh'),text(value,'en')]})):RECORD_CHOICES[selected][group];
    const heading=group==='hot'?t('hotQuestion'):group==='verdict'?t('classify'):settings.language==='zh'?`${coldHeading(s)}，你看到甚麼？`:`What did you observe ${s.cold?.location==='freeze'?'after freezing':'after cooling'}?`;
    const correct=promptChoice===expected;
    const explanation=group==='verdict'?verdictExplanation(selected):recordChoiceText(selected,expected,settings.language);
    content=dialogHeader(`${name(selected,settings.language)} · ${t('observationStep')} ${group==='hot'?1:group==='cold'?2:3} / 3`)+`<section class="observation-question" data-observation-stage="${group}"><h2>${heading}</h2>${group==='verdict'?evidenceSequence(s):`<p class="question-caption">${t('chooseObservation')}</p>`}<div class="prediction-options">${choices.map((item,i)=>`<button type="button" class="prediction-option ${promptChoice===item.value?(correct?'answer-correct':'answer-incorrect'):''}" data-observation-choice="${item.value}" aria-pressed="${promptChoice===item.value}"><span class="option-letter">${'ABC'[i]}</span><span>${item.label[settings.language==='en'?1:0]}</span></button>`).join('')}</div><div id="observationFeedback" class="answer-feedback ${promptChoice?(correct?'correct':'incorrect'):''}" role="status">${promptChoice?`<strong>${correct?'✓':'✕'} ${t(correct?'answerRight':'answerWrong')}</strong><span>${explanation}</span>`:''}</div><div class="question-footer"><span>${group==='verdict'?t('comparePrompt'):t('automaticRecord')}</span><button type="button" class="primary" data-action="confirm-observation" ${correct?'':'disabled'}>${t(group==='verdict'?'finishMaterial':group==='cold'?'toVerdict':'continueExperiment')} →</button></div></section>`;
  }
  $('#dialogContent').innerHTML = content ?? '';
}
function language(value) {
  if (!['zh', 'en'].includes(value)) return;
  settings.language = value; storage.set('change-lab-language', value);
  $('#toast').classList.remove('visible'); renderChrome(); stage(); if (dialogType) renderDialog();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.material) return selectMaterial(button.dataset.material);
  if(button.dataset.observationChoice) {promptChoice=button.dataset.observationChoice;beep();return renderDialog();}
  if (button.dataset.prediction !== undefined) { prediction = Number(button.dataset.prediction); beep(); return stage(); }
  if (button.dataset.conclusion !== undefined) {
    if (Number(button.dataset.conclusion) === 1) { analysisStep = 1; beep(); stage(); $('#stage').scrollTop = 0; }
    else $('#analysisFeedback').textContent = t('evidenceWrong');
    return;
  }
  if (button.dataset.challenge) {
    if (button.dataset.challenge === 'yes') { phase = 'complete'; beep(); stage(); $('#stage').scrollTop = 0; }
    else $('#analysisFeedback').textContent = t('chocolateExplain');
    return;
  }
  switch (button.id) {
    case 'settingsButton': return openDialog('settings');
    case 'soundButton': settings.sound=!settings.sound;beep();applyPlatformSettings();return;
    case 'helpButton': return openDialog('help');
    case 'notesButton': return openDialog('records');
    case 'resumeObservation': dismissedQuestion=null; return openObservation();
    case 'freshButton': return openDialog('fresh');
    case 'analyseButton': if (!simulation.canAnalyse()) return toast(t('requirement')); analysisStep = 0; return enterChapter('analysis');
    case 'cameraButton': return scene?.resetCamera();
    case 'pauseButton': paused = !paused; $('#pauseButton').textContent = paused ? '▶' : 'Ⅱ'; renderChrome(); return;
  }
  switch (button.dataset.action) {
    case 'observe': phase = 'observe'; break;
    case 'wonder': phase = 'wonder'; break;
    case 'hypothesis': return enterChapter('hypothesis');
    case 'begin': if (prediction === null) return; phase = 'lab'; toast(t('dragHint')); break;
    case 'lab': phase = 'lab'; break;
    case 'evidence': analysisStep = 0; break;
    case 'close': return closeDialog();
    case 'help': return openDialog('help');
    case 'reset-sample': simulation.reset(selected); dismissedQuestion=null; closeDialog(); refresh(); return;
    case 'confirm-observation': return confirmObservation();
    default: return;
  }
  beep(); stage(); $('#stage').scrollTop = 0;
});
document.addEventListener('change', event => {
  const element = event.target;
  if (element.id === 'languageSelect') language(element.value);
  else if (element.id === 'speedSelect') { settings.speed = Number(element.value); refresh(); }
  else if (element.id === 'soundToggle') { settings.sound = element.checked; beep(); }
  else if (element.id === 'motionToggle') { settings.reduced = element.checked;document.body.classList.toggle('reduced-motion',settings.reduced); if (scene) scene.reduced = settings.reduced; }
  else if(element.id==='contrastToggle')settings.highContrast=element.checked;
  else if(element.id==='qualitySelect')settings.quality=element.value;
  if(platformHost&&['speedSelect','soundToggle','motionToggle','contrastToggle','qualitySelect'].includes(element.id))applyPlatformSettings();
});
function confirmObservation() {
  const group=observationStage, s=selectedSample();
  if(promptChoice!==simulation.expected(selected)[group])return;
  if(group==='verdict') {
    const result=simulation.record(selected,{...s.observations,verdict:promptChoice});
    if(!result.ok)return;
    closeDialog(false);refresh();savePlatformSession();beep();toast(t('saved'));return;
  }
  if(!simulation.observe(selected,group,promptChoice).ok)return;
  savePlatformSession();
  if(group==='cold') {observationStage='verdict';promptChoice=null;renderDialog();$('#dialog').scrollTop=0;}
  else {closeDialog(false);refresh();toast(t('tryCooling'));}
}
document.addEventListener('keydown', event => {
  if (phase === 'chapter' && !dialogType && ['Enter', ' '].includes(event.key) && !event.target.closest('button, select, input')) { event.preventDefault(); advanceChapter(); return; }
  if (phase === 'lab' && !dialogType && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const location = { h: 'heat', c: 'cool', f: 'freeze', b: 'bench' }[event.key.toLowerCase()];
    if (location) { event.preventDefault(); moveMaterial(selected, location); }
  }
});
$('#dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
$('#stage').addEventListener('click', () => { if (phase === 'chapter' && !dialogType) advanceChapter(); });
$('#dialog').addEventListener('click', event => { if (event.target === $('#dialog')) { const r = $('#dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
document.addEventListener('visibilitychange', () => { last = performance.now(); });
window.addEventListener('pagehide',savePlatformSession);
function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
  if (!document.hidden) {
    if (phase === 'chapter' && !dialogType) { chapterRemaining -= dt * 1000; if (chapterRemaining <= 0) advanceChapter(); }
    if (phase === 'lab' && !paused && !dialogType) simulation.tick(dt * settings.speed);
    scene?.update(paused || dialogType ? 0 : dt);
    uiClock += dt;
    if (uiClock > .15) { uiClock = 0; refresh(); }
    if(platformHost){saveClock+=dt;if(saveClock>1){saveClock=0;savePlatformSession();}}
    if (scene && phase === 'lab') {
      const parent = $('#world').getBoundingClientRect();
      for (const label of document.querySelectorAll('[data-label]')) {
        const id = label.dataset.label, p = scene.anchor(id);
        label.hidden = !scene.models[id].group.visible || !p.visible;
        label.classList.toggle('selected', id === selected);
        const half = label.offsetWidth / 2 + 2;
        label.style.left = `${Math.max(half, Math.min(parent.width - half, p.x))}px`;
        label.style.top = `${Math.min(parent.height - 55, Math.max(12, p.y))}px`;
      }
      for (const label of document.querySelectorAll('[data-station-label]')) {
        const p = scene.stationAnchor(label.dataset.stationLabel), half = label.offsetWidth / 2 + 2;
        label.hidden = scene.compact;
        label.style.left = `${Math.max(half, Math.min(parent.width - half, p.x))}px`;
        label.style.top = `${Math.max(5, Math.min(parent.height - 55, p.y))}px`;
      }
    }
  }
  requestAnimationFrame(frame);
}
function bootProgress(value, key) {
  bootMessageKey = key; $('#bootMessage').textContent = t(key);
  $('#bootProgress').setAttribute('aria-valuenow', `${value}`); $('#bootFill').style.width = `${value}%`;
}
async function boot() {
  const started = performance.now(); $('.topbar').inert = true; renderChrome(); stage();
  bootProgress(12, 'bootOpening');
  // Let the paper loading screen paint before creating the WebGL environment.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    bootProgress(28, 'bootApparatus');
    scene = new ChangeScene($('#labCanvas'), { simulation, onSelect: selectMaterial, onMove: moveMaterial,
      onIssue: key => key && toast(t(key)),palette:platformHost?.palette });
    scene.setSelected(selected);if(platformHost)scene.setQuality(settings.quality);
    charcoalIcon=charcoalThumbnail();renderChrome();
    scene.reduced = settings.reduced;
    bootProgress(62, 'bootImages');
    await Promise.all([observationImage, materialAtlas].map(async src => { const image = new Image(); image.src = src; await image.decode(); }));
    bootProgress(86, 'bootView'); scene.update(0);
    await new Promise(resolve => requestAnimationFrame(resolve));
    bootProgress(100, 'bootReady');
    // As in Air Lab, keep the loading beat readable even with local assets.
    await new Promise(resolve => setTimeout(resolve, Math.max(100, 1200 - (performance.now() - started))));
    $('#bootScreen').setAttribute('aria-busy', 'false'); $('#bootScreen').hidden = true;
    $('.topbar').inert = false; last = performance.now();
    if(resumePhase){phase=resumePhase;stage();}else enterChapter('observe');
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error); $('#bootScreen').hidden = true; $('.topbar').inert = false;
    phase = 'error'; stage(); $('#stageContent').innerHTML = shell(`<h2>${t('error')}</h2>`);
  }
}
boot();
// Read-only diagnostics are available only when a test harness explicitly opts
// in before load. Tests exercise real UI controls rather than mutate this state.
if (window.__CHANGE_LAB_QA__) window.__changeLabTest = {
  state: () => structuredClone({ selected, phase, chapterTarget, chapterRemaining, flowHistory, activeId:simulation.activeId, prediction, paused, settings, samples: simulation.samples }),
  visual: id => scene.visualState(id),
  screenPoint: id => { const p = scene.pointFor(id), r = $('#labCanvas').getBoundingClientRect(); return { x: p.x + r.x, y: p.y + r.y }; },
};
