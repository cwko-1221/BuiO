import { experiments, experimentById, getNextExperiment } from './data/experiments.js';
import { LabSimulation } from './simulation/LabSimulation.js';
import { ProgressStore } from './persistence/ProgressStore.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { LabRenderer } from './render/LabRenderer.js';
import { FallbackRenderer } from './render/FallbackRenderer.js';
import { illustrationSvg } from './ui/illustrations.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dom = {
  boot: $('#bootScreen'), bootMessage: $('#bootMessage'), bootFill: $('#bootMeterFill'),
  topbar: $('#topbar'), main: $('#mainContent'), catalog: $('#catalogScreen'), lab: $('#labScreen'),
  grid: $('#experimentGrid'), continue: $('#continueButton'), tour: $('#tourButton'),
  home: $('#homeButton'), back: $('#backToCatalogButton'),
  progressCount: $('#progressCount'), progressRing: $('#progressRing'),
  labNumber: $('#labNumber'), labMeta: $('#labMeta'), labTitle: $('#labTitle'),
  stepLabel: $('#stepLabel'), stepProgress: $('#stepProgress'), missionVerb: $('#missionVerb'),
  missionTitle: $('#missionTitle'), missionInstruction: $('#missionInstruction'), missionCue: $('#missionCue'),
  missionPanel: $('#missionPanel'), missionPanelToggle: $('#missionPanelToggle'),
  missionPeekStep: $('#missionPeekStep'), missionPeekTitle: $('#missionPeekTitle'),
  hint: $('#hintButton'), hintBox: $('#hintBox'), reset: $('#resetButton'), accessible: $('#accessibleActionButton'),
  variable: $('#variableControl'), variableLabel: $('#variableLabel'), variableValue: $('#variableValue'), slider: $('#variableSlider'),
  observation: $('#observationStrip'), observationText: $('#observationText'), interactionLabel: $('#interactionLabel'),
  stage: $('#stageScreen'), stageKicker: $('#stageKicker'), stageBody: $('#stageBody'),
  stageDots: $('#stageDots'), stageNext: $('#stageNext'),
  recordPanel: $('#recordPanel'), recordLabel: $('#recordLabel'), recordOptions: $('#recordOptions'),
  resultDialog: $('#resultDialog'), resultTitle: $('#resultTitle'), resultStars: $('#resultStars'), resultScoreText: $('#resultScoreText'),
  resultPrediction: $('#resultPrediction'), resultObservation: $('#resultObservation'), resultExplanation: $('#resultExplanation'), resultCodes: $('#resultCodes'),
  resultComparison: $('#resultComparison'), comparisonLeftLabel: $('#comparisonLeftLabel'), comparisonLeftValue: $('#comparisonLeftValue'),
  comparisonRightLabel: $('#comparisonRightLabel'), comparisonRightValue: $('#comparisonRightValue'), comparisonConclusion: $('#comparisonConclusion'),
  replay: $('#replayButton'), next: $('#nextExperimentButton'),
  notebookButton: $('#notebookButton'), notebookDialog: $('#notebookDialog'), notebookSummary: $('#notebookSummary'), notebookEntries: $('#notebookEntries'),
  settingsButton: $('#settingsButton'), settingsDialog: $('#settingsDialog'), soundButton: $('#soundButton'), soundToggle: $('#soundToggle'),
  motionToggle: $('#motionToggle'), contrastToggle: $('#contrastToggle'), qualitySelect: $('#qualitySelect'),
  tourDialog: $('#tourDialog'), toast: $('#toastRegion'), flash: $('#screenFlash'),
  phenomenonStage: $('#phenomenonStage'), phenomenonTitle: $('#phenomenonTitle'), phenomenonText: $('#phenomenonText'),
  phenomenonComparison: $('#phenomenonComparison'), phenomenonCountdown: $('#phenomenonCountdown'),
  phenomenonTimerBar: $('#phenomenonTimerBar'), phenomenonExplain: $('#phenomenonExplainButton'),
  cameraLeft: $('#cameraLeftButton'), cameraReset: $('#cameraResetButton'), cameraRight: $('#cameraRightButton'),
};

let store;
let audio;
let renderer;
let simulation;
let currentExperiment;
let selectedPrediction = null;
let selectedReflection = null;
let observationTimer;
let phenomenonTimer;
let phenomenonCountdownTimer;
let pendingResultScore = null;
let analysisScore = null;
let settings = ProgressStore.loadSettings();
const activeExperimentIds = experiments.map((experiment) => experiment.id);

async function boot() {
  setBoot(12, '正在載入實驗內容…');
  let studentId;
  try {
    studentId = await resolveStudentId();
  } catch (error) {
    console.error('3D laboratory initialization failed.', error);
    setBoot(100, '登入資料已失效，正在返回平台…');
    setTimeout(() => { location.href = '/'; }, 900);
    return;
  }
  store = new ProgressStore(studentId);
  audio = new AudioEngine(settings.sound);
  setBoot(35, '正在生成卡通器材…');
  try {
    renderer = new LabRenderer($('#labCanvas'), {
      settings,
      audio,
      onAction: (action) => simulation?.dispatchAction(action) || { accepted: false },
      onPreview: ({ subject, value }) => {
        simulation?.previewVariable(subject, value);
        syncVariableValue(value);
      },
      onHover: showInteractionLabel,
      onContextIssue: (message) => showToast(message, 'try'),
    });
    await renderer.init();
  } catch {
    document.body.classList.add('no-webgl');
    renderer = new FallbackRenderer($('#labCanvas'), {
      onAction: (action) => simulation?.dispatchAction(action) || { accepted: false },
      onPreview: ({ subject, value }) => {
        simulation?.previewVariable(subject, value);
        syncVariableValue(value);
      },
    });
    await renderer.init();
    showToast('裝置未能啟動 3D，已切換至可完整操作的簡化場景。', 'try');
  }
  if (location.pathname.endsWith('/preview')) {
    window.__scienceLabTest = {
      getState: () => simulation?.serialize() || null,
      getEntityPoint: (id) => renderer?.getScreenPoint?.(id) || null,
      getEntityScreenBounds: (id) => renderer?.getScreenBounds?.(id) || null,
      getTargetPoint: (id) => renderer?.getScreenPoint?.(id, { target: true }) || null,
      getTargetWorldPose: (id) => renderer?.getTargetWorldPose?.(id) || null,
      getEntityHomePose: (id) => renderer?.getEntityHomePose?.(id) || null,
      getPourDebug: (id) => renderer?.getPourDebug?.(id) || null,
      getDebugStats: () => renderer?.getDebugStats?.() || null,
      getPhysicsPose: (id) => renderer?.getPhysicsPose?.(id) || null,
      getPhysicsDebug: (id, targetId) => renderer?.getPhysicsDebug?.(id, targetId) || null,
      rendererKind: () => document.body.classList.contains('no-webgl') ? 'fallback' : 'webgl',
    };
  }
  setBoot(68, '正在整理你的科學筆記…');
  renderCards();
  renderProgress();
  applySettings();
  bindEvents();
  setBoot(100, '實驗室準備好了！');
  setTimeout(() => {
    dom.boot.classList.add('done');
    dom.topbar.hidden = false;
    dom.main.hidden = false;
    routeFromHash();
  }, 380);
}

async function resolveStudentId() {
  // Preview is intentionally local and has no platform session. Avoid making
  // a guaranteed 401 request; the protected route still validates auth below.
  if (location.pathname.endsWith('/preview')) return 'local-preview';
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (!response.ok) {
      throw new Error('session unavailable');
    }
    const data = await response.json();
    const id = data?.student?.id || data?.student?.studentId;
    if (!id) throw new Error('student id missing');
    return id;
  } catch (error) {
    throw error;
  }
}

function setBoot(percent, message) {
  dom.bootFill.style.width = `${percent}%`;
  dom.bootMessage.textContent = message;
}

function renderCards(filter = 'all') {
  dom.grid.innerHTML = experiments.map((experiment) => {
    const progress = store.getExperiment(experiment.id);
    const completed = Boolean(progress?.completed);
    const stars = completed ? '★'.repeat(progress.bestScore || 1) + '☆'.repeat(3 - (progress.bestScore || 1)) : '☆☆☆';
    return `<button class="experiment-card ${completed ? 'completed' : ''}" style="--accent:${experiment.color}" data-experiment="${experiment.id}" data-topic="${experiment.topic}" ${filter !== 'all' && experiment.topic !== filter ? 'hidden' : ''} type="button" aria-label="${experiment.title}，${experiment.question}">
      <span class="card-art"><span class="card-illustration">${illustrationSvg(experiment.icon)}</span><span class="card-complete" aria-label="已完成">✓</span></span>
      <span class="card-copy">
        <span class="card-topline"><span class="card-topic">${experiment.topic}</span><span>${experiment.minutes} 分鐘 · ${experiment.grades}</span></span>
        <h3>${experiment.title}</h3><p>${experiment.question}</p>
        <span class="card-footer"><span class="card-stars" aria-label="${completed ? `${progress.bestScore} 星` : '未完成'}">${stars}</span><span class="card-arrow" aria-hidden="true">→</span></span>
      </span>
    </button>`;
  }).join('');
  $$('.experiment-card').forEach((card) => card.addEventListener('click', () => startExperiment(card.dataset.experiment)));
}

function renderProgress() {
  const complete = store.getCompletedCount(activeExperimentIds);
  dom.progressCount.textContent = `${complete} / ${experiments.length}`;
  const percentage = Math.round((complete / experiments.length) * 100);
  dom.progressRing.style.background = `conic-gradient(var(--yellow) ${percentage}%, rgba(255,255,255,.18) 0)`;
  dom.continue.querySelector('span').textContent = complete ? '繼續我的探究' : '開始第一個實驗';
}

function startExperiment(id, { forceNew = false } = {}) {
  const definition = experimentById.get(id);
  if (!definition || !renderer) return;
  cancelPhenomenon();
  closeAllDialogs();
  audio.unlock();
  currentExperiment = definition;
  const saved = !forceNew ? store.getSession(id) : null;
  const canRestore = saved && !saved.complete && saved.currentStep > 0;
  simulation = new LabSimulation(definition, canRestore ? saved : null);
  bindSimulation();
  renderer.loadExperiment(definition, canRestore ? saved.actionHistory : []);
  dom.catalog.hidden = true;
  dom.lab.hidden = false;
  dom.labNumber.textContent = String(definition.number).padStart(2, '0');
  dom.labMeta.textContent = `${definition.topic} · ${definition.grades} · 約 ${definition.minutes} 分鐘`;
  dom.labTitle.textContent = definition.title;
  setMissionCollapsed(true);
  dom.hintBox.hidden = true;
  dom.observation.hidden = true;
  dom.recordPanel.hidden = true;
  history.replaceState(null, '', `#${definition.id}`);
  updateMission();
  if (canRestore) {
    showToast(`已回復到步驟 ${saved.currentStep + 1}，可以繼續探究。`, 'success');
  } else {
    openObservation();
  }
}

function bindSimulation() {
  simulation.addEventListener('statechange', () => {
    store.saveSession(currentExperiment.id, simulation.serialize());
    updateMission();
  });
  simulation.addEventListener('actionrejected', (event) => {
    const messages = {
      'wrong-object': '這件器材也很有趣，但今步要使用發光提示的器材。',
      'wrong-target': '位置未對準。留意目標位置的光圈，再放近一點。',
      'wrong-verb': '試試依照任務提示，用另一種操作方法。',
      'adjust-more': '方向正確！再調校一點，留意數值變化。',
      'record-mismatch': '再看清楚儀器上的讀數，然後選一次。',
      'record-missing': '請在數據面板選一個讀數。',
    };
    showToast(messages[event.detail.reason] || '再觀察一下器材和目標位置。', 'try');
  });
  simulation.addEventListener('stepcomplete', (event) => {
    showObservation(event.detail.step.observation);
    showToast('觀察完成，證據已記入科學筆記。', 'success');
    audio.play('step');
    flashScreen();
  });
  simulation.addEventListener('complete', (event) => {
    const score = event.detail.score;
    store.markComplete(currentExperiment.id, simulation.serialize(), score);
    renderProgress();
    renderCards($('.filter-chip.active')?.dataset.filter || 'all');
    audio.play('success');
    showPhenomenon(score);
  });
  simulation.addEventListener('reset', () => renderer.loadExperiment(currentExperiment, []));
}

function updateMission() {
  if (!simulation || !currentExperiment) return;
  const step = simulation.step;
  if (!step) return;
  const index = simulation.state.currentStep;
  dom.stepLabel.textContent = `步驟 ${index + 1} / ${currentExperiment.steps.length}`;
  dom.missionPeekStep.textContent = `步驟 ${index + 1} / ${currentExperiment.steps.length}`;
  dom.stepProgress.style.width = `${((index + 1) / currentExperiment.steps.length) * 100}%`;
  dom.missionVerb.textContent = step.verb;
  dom.missionTitle.textContent = step.title;
  dom.missionPeekTitle.textContent = step.title;
  dom.missionInstruction.textContent = step.instruction;
  dom.missionCue.lastElementChild.textContent = step.cue;
  dom.hintBox.hidden = true;
  dom.hintBox.textContent = step.hint;
  dom.accessible.setAttribute('aria-label', `以按鈕完成：${step.instruction}`);
  dom.accessible.textContent = step.action.type === 'adjust' ? '套用建議數值'
    : step.action.type === 'record' ? '填入儀器讀數' : '按鈕操作';
  renderer.setStep(step);
  configureVariable(step);
  configureRecord(step);
}

function configureRecord(step) {
  const action = step.action;
  const isRecord = action.type === 'record';
  dom.recordPanel.hidden = !isRecord;
  if (!isRecord) return;
  dom.recordLabel.textContent = `${action.label || '讀數'}${action.unit ? `（${action.unit}）` : ''}`;
  dom.recordOptions.replaceChildren(...action.options.map((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'record-option';
    button.dataset.record = String(index);
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.textContent = option;
    button.addEventListener('click', () => {
      simulation?.dispatchAction({ type: 'record', subject: action.subject, value: index });
    });
    return button;
  }));
}

function configureVariable(step) {
  const action = step.action;
  const isAdjust = action.type === 'adjust';
  dom.variable.hidden = !isAdjust;
  if (!isAdjust) return;
  const range = action.range || [0, 100];
  const low = Math.min(...range), high = Math.max(...range);
  const value = simulation.state.variables[action.subject] ?? action.start ?? range[0];
  dom.slider.min = String(low);
  dom.slider.max = String(high);
  dom.slider.step = high - low <= 10 ? '0.5' : '1';
  dom.slider.value = String(value);
  dom.variableLabel.textContent = step.verb === '公轉' ? '軌道角度' : step.verb === '自轉' ? '自轉角度' : step.verb === '抽氣' ? '鐘罩氣壓' : step.verb === '推進' ? '經過時間' : '調校數值';
  dom.variable.dataset.subject = action.subject;
  dom.variable.dataset.unit = action.unit || '';
  syncVariableValue(value);
  renderer.previewVariable(action.subject, value);
}

function syncVariableValue(value) {
  const unit = dom.variable.dataset.unit || '';
  const rounded = Math.abs(value - Math.round(value)) < .05 ? Math.round(value) : Number(value).toFixed(1);
  dom.variableValue.value = `${rounded}${unit}`;
  dom.slider.value = String(value);
}

const MEDIA_BASE = '/science-lab/media';
let observationClips = null;

async function loadObservationClips() {
  if (observationClips) return observationClips;
  try {
    const response = await fetch(`${MEDIA_BASE}/index.json`, { credentials: 'include' });
    observationClips = new Set(response.ok ? (await response.json()).clips || [] : []);
  } catch {
    observationClips = new Set();
  }
  return observationClips;
}

// --- slide stage ------------------------------------------------------------
// One idea per screen. Each phase of the inquiry cycle is a short run of slides
// rather than a dense dialog, so nothing on screen is smaller than a child will
// read and nothing asks them to take in five things at once.
let stageSlides = [];
let stageIndex = 0;
let stageDone = null;
let stageAdvanceTimer = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function runStage(slides, onDone) {
  stageSlides = slides.filter(Boolean);
  stageIndex = 0;
  stageDone = onDone;
  dom.stage.hidden = false;
  dom.lab.classList.add('stage-open');
  renderStageSlide();
}

function closeStage() {
  clearTimeout(stageAdvanceTimer);
  stageAdvanceTimer = null;
  dom.stage.hidden = true;
  dom.lab.classList.remove('stage-open');
  dom.stageBody.replaceChildren();
  stageSlides = [];
  const done = stageDone;
  stageDone = null;
  done?.();
}

function advanceStage() {
  clearTimeout(stageAdvanceTimer);
  stageAdvanceTimer = null;
  const slide = stageSlides[stageIndex];
  if (slide?.onLeave && slide.onLeave() === false) return;
  stageIndex += 1;
  if (stageIndex >= stageSlides.length) { closeStage(); return; }
  renderStageSlide();
}

function renderStageSlide() {
  const slide = stageSlides[stageIndex];
  if (!slide) { closeStage(); return; }
  dom.stage.dataset.slide = slide.id || slide.kind;
  dom.stage.dataset.kind = slide.kind;
  dom.stageKicker.textContent = slide.kicker || '';
  dom.stageKicker.hidden = !slide.kicker;
  dom.stageBody.replaceChildren(slide.render());
  // Restart the entry animation for every slide, including a repeat of the
  // same kind, so each screen reads as a new beat.
  dom.stageBody.classList.remove('entering');
  void dom.stageBody.offsetWidth;
  dom.stageBody.classList.add('entering');

  const total = stageSlides.filter((item) => item.kind !== 'chapter').length;
  const position = stageSlides.slice(0, stageIndex + 1).filter((item) => item.kind !== 'chapter').length;
  dom.stageDots.replaceChildren(...Array.from({ length: total }, (_, index) => {
    const dot = element('i', index < position ? 'on' : '');
    return dot;
  }));
  dom.stageDots.hidden = slide.kind === 'chapter' || total < 2;

  dom.stageNext.textContent = slide.next || '繼續';
  dom.stageNext.disabled = Boolean(slide.locked);
  if (slide.kind === 'analysis') dom.stageNext.disabled = false;
  dom.stageNext.hidden = slide.kind === 'chapter';

  if (slide.kind === 'chapter') {
    // A chapter card is a beat, not a task: it moves on by itself, and a tap
    // skips it for a child who has read it already.
    stageAdvanceTimer = setTimeout(advanceStage, settings.reduceMotion ? 900 : 1900);
  }
  slide.onEnter?.();
}

function unlockStage(next) {
  const slide = stageSlides[stageIndex];
  if (slide) slide.locked = false;
  if (next) dom.stageNext.textContent = next;
  dom.stageNext.disabled = false;
}

function chapterSlide(step, title, note) {
  return {
    kind: 'chapter',
    id: `chapter-${step}`,
    render() {
      const wrap = element('div', 'stage-chapter');
      wrap.append(element('span', 'stage-chapter-step', step));
      wrap.append(element('h2', 'stage-chapter-title', title));
      if (note) wrap.append(element('p', 'stage-chapter-note', note));
      return wrap;
    },
  };
}

function videoSlide(definition) {
  return {
    kind: 'video',
    id: 'observe-video',
    kicker: '第一步 · 觀察 OBSERVE',
    next: '看完了',
    render() {
      const wrap = element('div', 'stage-video');
      wrap.append(element('h2', 'stage-heading', definition.observe.title));
      const frame = element('div', 'stage-video-frame');
      const video = document.createElement('video');
      video.id = 'observeVideo';
      video.className = 'stage-video-player';
      video.playsInline = true;
      video.controls = true;
      video.preload = 'metadata';
      video.hidden = true;
      const fallback = element('div', 'stage-video-fallback');
      fallback.id = 'observeFallback';
      fallback.append(element('span', null, '◎'));
      fallback.append(element('p', null, '這個探究的觀察影片尚未加入。先記住下面的問題，在實驗中親自觀察。'));
      frame.append(video, fallback);
      wrap.append(frame);
      wrap.append(element('p', 'stage-caption', definition.observe.caption));
      this.video = video;
      this.fallback = fallback;
      return wrap;
    },
    async onEnter() {
      const experimentId = definition.id;
      const clips = await loadObservationClips();
      const name = ['mp4', 'webm'].map((ext) => `${experimentId}.${ext}`).find((file) => clips.has(file));
      if (!name || currentExperiment?.id !== experimentId || !this.video?.isConnected) return;
      this.video.onloadeddata = () => { this.video.hidden = false; this.fallback.hidden = true; };
      this.video.onerror = () => { this.video.hidden = true; this.fallback.hidden = false; };
      this.video.src = `${MEDIA_BASE}/${name}`;
    },
    onLeave() {
      this.video?.pause();
    },
  };
}

function noticeSlide(definition) {
  return {
    kind: 'notice',
    id: 'observe-notice',
    kicker: '第一步 · 觀察 OBSERVE',
    render() {
      const wrap = element('div', 'stage-notice');
      wrap.append(element('h2', 'stage-heading', '看的時候留意'));
      const list = element('ul', 'stage-list');
      list.id = 'observeNotice';
      for (const item of definition.observe.notice) list.append(element('li', null, item));
      wrap.append(list);
      return wrap;
    },
  };
}

function wonderSlide(definition) {
  return {
    kind: 'wonder',
    id: 'observe-wonder',
    kicker: '第一步 · 觀察 OBSERVE',
    next: '我要提出假說',
    render() {
      const wrap = element('div', 'stage-wonder');
      wrap.append(element('p', 'stage-lead', '我的疑問是⋯⋯'));
      const question = element('h2', 'stage-question', definition.observe.wonder);
      question.id = 'observeWonder';
      wrap.append(question);
      return wrap;
    },
  };
}

function hypothesisSlide(definition) {
  return {
    kind: 'hypothesis',
    id: 'hypothesis',
    kicker: '第二步 · 假說 HYPOTHESIS',
    next: '用實驗驗證',
    locked: true,
    render() {
      const wrap = element('div', 'stage-choice');
      wrap.append(element('h2', 'stage-heading', definition.prediction.prompt));
      const options = element('div', 'stage-options');
      options.id = 'predictionOptions';
      options.setAttribute('role', 'radiogroup');
      options.setAttribute('aria-label', '選擇你的假說');
      definition.prediction.options.forEach((option, index) => {
        const button = element('button', 'stage-option');
        button.type = 'button';
        button.dataset.prediction = String(index);
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.append(element('i', null, String.fromCharCode(65 + index)));
        button.append(element('span', null, option));
        button.addEventListener('click', () => {
          selectedPrediction = index;
          $$('[data-prediction]').forEach((item) => {
            const active = item === button;
            item.classList.toggle('selected', active);
            item.setAttribute('aria-checked', String(active));
          });
          unlockStage();
        });
        options.append(button);
      });
      wrap.append(options);
      const safety = element('p', 'stage-safety');
      safety.append(element('b', null, '安全提示：'));
      safety.append(document.createTextNode(definition.safety));
      wrap.append(safety);
      return wrap;
    },
    onLeave() {
      if (selectedPrediction == null) return false;
      simulation.setPrediction(selectedPrediction);
      return true;
    },
  };
}

function analysisSlide(definition) {
  return {
    kind: 'analysis',
    id: 'analysis',
    kicker: '第四步 · 分析與反思 ANALYSE',
    next: '看科學解釋',
    locked: true,
    render() {
      const wrap = element('div', 'stage-analysis');
      wrap.append(element('h2', 'stage-heading', '你的假說站得住嗎？'));

      const chosen = simulation.state.prediction;
      const matched = chosen === definition.prediction.answer;
      const verdict = element('div', 'stage-verdict');
      const mine = element('section', matched ? 'held' : 'revised');
      mine.append(element('span', 'stage-label', '你的假說'));
      const hypothesis = element('p', null, chosen == null
        ? '未有假說紀錄'
        : `${definition.prediction.options[chosen]}${matched ? '（證據支持）' : '（證據不支持，要修正）'}`);
      hypothesis.id = 'analysisHypothesis';
      mine.append(hypothesis);
      const evidenceBox = element('section');
      evidenceBox.append(element('span', 'stage-label', '實驗證據'));
      const evidence = element('p', null, definition.analysis.evidence);
      evidence.id = 'analysisEvidence';
      evidenceBox.append(evidence);
      verdict.append(mine, evidenceBox);
      wrap.append(verdict);

      const records = simulation.state.records || [];
      if (records.length) {
        const data = element('section', 'stage-data');
        data.id = 'analysisData';
        data.append(element('span', 'stage-label', '你記錄的數據'));
        const table = element('table', 'stage-table');
        const body = element('tbody');
        body.id = 'analysisTableBody';
        for (const row of records) {
          const tr = element('tr');
          const th = element('th', null, row.label);
          th.scope = 'row';
          tr.append(th, element('td', null, row.unit ? `${row.value} ${row.unit}` : row.value));
          body.append(tr);
        }
        table.append(body);
        data.append(table);
        wrap.append(data);
      }
      return wrap;
    },
  };
}

function reflectionSlide(definition) {
  const reflection = definition.analysis.reflection;
  return {
    kind: 'reflection',
    id: 'reflection',
    kicker: '第四步 · 分析與反思 ANALYSE',
    next: '看科學解釋',
    locked: true,
    render() {
      const wrap = element('div', 'stage-choice');
      wrap.append(element('p', 'stage-lead', '再想一步'));
      wrap.append(element('h2', 'stage-heading', reflection.prompt));
      const options = element('div', 'stage-options');
      options.id = 'analysisReflectOptions';
      options.setAttribute('role', 'radiogroup');
      options.setAttribute('aria-label', '選擇你的想法');
      const feedback = element('p', 'stage-feedback');
      feedback.id = 'analysisReflectFeedback';
      feedback.hidden = true;
      reflection.options.forEach((option, index) => {
        const button = element('button', 'stage-option');
        button.type = 'button';
        button.dataset.reflection = String(index);
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        button.append(element('i', null, String.fromCharCode(65 + index)));
        button.append(element('span', null, option));
        button.addEventListener('click', () => {
          selectedReflection = index;
          simulation.setReflection(index);
          $$('[data-reflection]').forEach((item) => {
            const active = item === button;
            item.classList.toggle('selected', active);
            item.setAttribute('aria-checked', String(active));
          });
          const right = index === reflection.answer;
          feedback.textContent = right ? `答對了。${reflection.because}` : `再想想。${reflection.because}`;
          feedback.classList.toggle('right', right);
          feedback.hidden = false;
          unlockStage();
        });
        options.append(button);
      });
      wrap.append(options, feedback);
      return wrap;
    },
  };
}

function openObservation() {
  const definition = currentExperiment;
  if (!definition.observe) { openHypothesisOnly(); return; }
  runStage([
    chapterSlide('第一步', '觀察', '先看清楚發生了甚麼'),
    videoSlide(definition),
    noticeSlide(definition),
    wonderSlide(definition),
    chapterSlide('第二步', '假說', '你認為答案是甚麼？'),
    hypothesisSlide(definition),
  ], () => {
    renderer.setStep(simulation.step);
    showToast('假說已記下。現在用實驗證據驗證它！', 'success');
  });
}

function openHypothesisOnly() {
  runStage([
    chapterSlide('第二步', '假說', '你認為答案是甚麼？'),
    hypothesisSlide(currentExperiment),
  ], () => {
    renderer.setStep(simulation.step);
  });
}

function openAnalysis(score) {
  const definition = currentExperiment;
  if (!definition.analysis) { openResult(score); return; }
  analysisScore = score;
  selectedReflection = null;
  runStage([
    chapterSlide('第四步', '分析與反思', '證據怎樣說？'),
    analysisSlide(definition),
    reflectionSlide(definition),
  ], () => openResult(analysisScore ?? simulation.score()));
}

function normalizeComparison(result) {
  const raw = result?.comparison || result?.comparisons;
  if (!raw) return null;
  const comparison = Array.isArray(raw) ? { items: raw } : raw;
  const items = comparison.items || comparison.conditions || [];
  const left = comparison.left || items[0] || {};
  const right = comparison.right || items[1] || {};
  const normalized = {
    leftLabel: comparison.leftLabel || left.label || left.name || '',
    leftValue: comparison.leftValue || left.value || left.result || '',
    rightLabel: comparison.rightLabel || right.label || right.name || '',
    rightValue: comparison.rightValue || right.value || right.result || '',
    conclusion: comparison.conclusion || comparison.summary || '',
  };
  return normalized.leftLabel && normalized.leftValue && normalized.rightLabel && normalized.rightValue ? normalized : null;
}

function showPhenomenon(score) {
  cancelPhenomenon();
  pendingResultScore = score;
  const result = currentExperiment.result;
  const comparison = normalizeComparison(result);
  const duration = settings.reduceMotion ? 3200 : 4200;
  const startedAt = performance.now();

  setMissionCollapsed(true);
  clearTimeout(observationTimer);
  dom.toast.replaceChildren();
  dom.observation.hidden = true;
  dom.interactionLabel.hidden = true;
  dom.lab.classList.add('showing-phenomenon');
  dom.phenomenonTitle.textContent = result.phenomenonTitle || '留心觀看最後的實驗現象';
  dom.phenomenonText.textContent = result.observation;
  dom.phenomenonComparison.hidden = !comparison;
  dom.phenomenonComparison.textContent = comparison
    ? `${comparison.leftLabel}：${comparison.leftValue}　↔　${comparison.rightLabel}：${comparison.rightValue}`
    : '';
  dom.phenomenonStage.hidden = false;
  dom.phenomenonTimerBar.style.setProperty('--phenomenon-duration', `${duration}ms`);
  dom.phenomenonTimerBar.style.animation = 'none';
  void dom.phenomenonTimerBar.offsetWidth;
  dom.phenomenonTimerBar.style.animation = '';

  const updateCountdown = () => {
    const seconds = Math.max(1, Math.ceil((duration - (performance.now() - startedAt)) / 1000));
    dom.phenomenonCountdown.textContent = `${seconds} 秒後顯示解釋`;
  };
  updateCountdown();
  phenomenonCountdownTimer = setInterval(updateCountdown, 250);
  phenomenonTimer = setTimeout(revealExplanation, duration);
}

function revealExplanation() {
  if (pendingResultScore == null) return;
  const score = pendingResultScore;
  cancelPhenomenon();
  openAnalysis(score);
}

function cancelPhenomenon() {
  clearTimeout(phenomenonTimer);
  clearInterval(phenomenonCountdownTimer);
  phenomenonTimer = null;
  phenomenonCountdownTimer = null;
  pendingResultScore = null;
  dom.phenomenonStage.hidden = true;
  dom.lab.classList.remove('showing-phenomenon');
}

function openResult(score) {
  const definition = currentExperiment;
  const comparison = normalizeComparison(definition.result);
  dom.resultTitle.textContent = definition.result.title;
  dom.resultStars.textContent = '★'.repeat(score) + '☆'.repeat(3 - score);
  dom.resultScoreText.textContent = simulation.state.prediction == null ? '完成操作，但未有假說紀錄' : score === 3 ? '獨立而細心地完成' : score === 2 ? '善用提示完成探究' : '堅持重試完成探究';
  const prediction = simulation.state.prediction == null ? '未提出假說' : definition.prediction.options[simulation.state.prediction];
  const correct = simulation.state.prediction === definition.prediction.answer;
  dom.resultPrediction.textContent = simulation.state.prediction == null ? prediction : `${prediction}${correct ? '（與觀察結果一致）' : '（實驗證據令我修正了想法）'}`;
  dom.resultObservation.textContent = definition.result.observation;
  dom.resultComparison.hidden = !comparison;
  if (comparison) {
    dom.comparisonLeftLabel.textContent = comparison.leftLabel;
    dom.comparisonLeftValue.textContent = comparison.leftValue;
    dom.comparisonRightLabel.textContent = comparison.rightLabel;
    dom.comparisonRightValue.textContent = comparison.rightValue;
    dom.comparisonConclusion.textContent = comparison.conclusion;
  }
  dom.resultExplanation.textContent = `${definition.result.explanation} 模型限制：${definition.modelNote}`;
  dom.resultCodes.textContent = `教具 ${definition.curriculum.items} · ${definition.curriculum.codes.join(' · ')}`;
  dom.resultDialog.showModal();
}

function showObservation(text) {
  clearTimeout(observationTimer);
  dom.observationText.textContent = text;
  dom.observation.hidden = false;
  observationTimer = setTimeout(() => { dom.observation.hidden = true; }, settings.reduceMotion ? 2400 : 4200);
}

function showInteractionLabel(info) {
  if (!info || dom.lab.hidden) { dom.interactionLabel.hidden = true; return; }
  dom.interactionLabel.textContent = info.label;
  // Keep the full 16 px apparatus name on screen even when the mesh sits near
  // a narrow-phone edge. Measure after inserting the text, then clamp the
  // label centre rather than clipping half the word off-canvas.
  dom.interactionLabel.hidden = false;
  const halfWidth = dom.interactionLabel.getBoundingClientRect().width / 2;
  const safeX = Math.min(innerWidth - halfWidth - 8, Math.max(halfWidth + 8, info.clientX));
  dom.interactionLabel.style.left = `${safeX}px`;
  dom.interactionLabel.style.top = `${info.clientY}px`;
}

function showToast(message, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  dom.toast.replaceChildren(toast);
  setTimeout(() => toast.remove(), 3000);
}

function flashScreen() {
  if (settings.reduceMotion) return;
  dom.flash.classList.remove('active');
  requestAnimationFrame(() => dom.flash.classList.add('active'));
}

function setMissionCollapsed(collapsed) {
  dom.missionPanel.classList.toggle('collapsed', collapsed);
  dom.lab.classList.toggle('mission-open', !collapsed);
  dom.missionPanelToggle.setAttribute('aria-expanded', String(!collapsed));
  dom.missionPanelToggle.setAttribute('aria-label', collapsed ? '展開任務卡' : '收起任務卡');
}

function showCatalog({ canonicalize = true } = {}) {
  cancelPhenomenon();
  closeAllDialogs();
  currentExperiment = null;
  simulation = null;
  dom.lab.hidden = true;
  dom.catalog.hidden = false;
  dom.variable.hidden = true;
  dom.observation.hidden = true;
  dom.recordPanel.hidden = true;
  dom.lab.classList.remove('mission-open');
  renderer.loadCatalog();
  renderCards($('.filter-chip.active')?.dataset.filter || 'all');
  renderProgress();
  if (canonicalize) history.replaceState(null, '', `${location.pathname}${location.search}`);
  scrollTo({ top: 0, behavior: settings.reduceMotion ? 'auto' : 'smooth' });
}

function renderNotebook() {
  const completed = store.getCompletedCount(activeExperimentIds);
  const stars = experiments.reduce((sum, item) => sum + (store.getExperiment(item.id)?.bestScore || 0), 0);
  const topics = new Set(experiments.filter((item) => store.getExperiment(item.id)?.completed).map((item) => item.topic)).size;
  dom.notebookSummary.innerHTML = `<div class="summary-tile"><b>${completed}</b><span>完成探究</span></div><div class="summary-tile"><b>${stars}</b><span>能力星章</span></div><div class="summary-tile"><b>${topics}</b><span>探索範疇</span></div>`;
  dom.notebookEntries.innerHTML = experiments.map((item) => {
    const progress = store.getExperiment(item.id);
    const done = Boolean(progress?.completed);
    return `<button class="notebook-entry ${done ? '' : 'locked'}" data-notebook-id="${item.id}" type="button"><span class="entry-number">${String(item.number).padStart(2,'0')}</span><span><b>${item.title}</b><small>${done ? `完成於 ${new Date(progress.completedAt).toLocaleDateString('zh-HK')}` : '尚未完成'}</small></span><span class="entry-stars">${done ? '★'.repeat(progress.bestScore || 1) : '○'}</span></button>`;
  }).join('');
  $$('[data-notebook-id]').forEach((button) => button.addEventListener('click', () => { dom.notebookDialog.close(); startExperiment(button.dataset.notebookId); }));
}

function applySettings() {
  dom.soundToggle.checked = settings.sound;
  dom.motionToggle.checked = settings.reduceMotion;
  dom.contrastToggle.checked = settings.highContrast;
  dom.qualitySelect.value = settings.quality;
  dom.soundButton.setAttribute('aria-pressed', String(settings.sound));
  dom.soundButton.setAttribute('aria-label', settings.sound ? '關閉聲音' : '開啟聲音');
  audio?.setEnabled(settings.sound);
  renderer?.setSettings(settings);
}

function saveSettings() {
  settings = {
    sound: dom.soundToggle.checked,
    reduceMotion: dom.motionToggle.checked,
    highContrast: dom.contrastToggle.checked,
    quality: dom.qualitySelect.value,
  };
  ProgressStore.saveSettings(settings);
  applySettings();
}

function bindEvents() {
  dom.continue.addEventListener('click', () => {
    const last = store.getLastPlayed(activeExperimentIds);
    const next = last && experimentById.has(last) && !store.getExperiment(last)?.completed
      ? last
      : experiments.find((item) => !store.getExperiment(item.id)?.completed)?.id || experiments[0].id;
    startExperiment(next);
  });
  dom.tour.addEventListener('click', () => dom.tourDialog.showModal());
  dom.home.addEventListener('click', showCatalog);
  dom.back.addEventListener('click', showCatalog);
  dom.hint.addEventListener('click', () => {
    if (dom.hintBox.hidden) simulation?.useHint();
    dom.hintBox.hidden = !dom.hintBox.hidden;
    renderer?.setStep(simulation?.step);
  });
  dom.reset.addEventListener('click', () => {
    if (!simulation || !confirm('重新開始這個實驗？已完成的整體紀錄會保留。')) return;
    simulation.reset({ keepPrediction: true });
    showToast('本次實驗已回到第一步。');
  });
  dom.accessible.addEventListener('click', () => {
    const action = simulation?.step?.action;
    if (action?.type === 'record') {
      simulation.dispatchAction({ type: 'record', subject: action.subject, value: action.answer });
      return;
    }
    renderer?.performAccessibleAction();
  });
  dom.missionPanelToggle.addEventListener('click', () => {
    setMissionCollapsed(!dom.missionPanel.classList.contains('collapsed'));
  });
  dom.stageNext.addEventListener('click', advanceStage);
  dom.stage.addEventListener('click', (event) => {
    // A chapter card advances on any tap; other slides need their own control.
    if (dom.stage.dataset.kind === 'chapter' && !event.target.closest('button')) advanceStage();
  });
  dom.phenomenonExplain.addEventListener('click', revealExplanation);
  dom.replay.addEventListener('click', () => { dom.resultDialog.close(); startExperiment(currentExperiment.id, { forceNew: true }); });
  dom.next.addEventListener('click', () => {
    const next = getNextExperiment(currentExperiment.id);
    dom.resultDialog.close();
    if (next) startExperiment(next.id);
    else showCatalog();
  });
  dom.notebookButton.addEventListener('click', () => { renderNotebook(); dom.notebookDialog.showModal(); });
  dom.settingsButton.addEventListener('click', () => dom.settingsDialog.showModal());
  dom.soundButton.addEventListener('click', () => { settings.sound = !settings.sound; ProgressStore.saveSettings(settings); applySettings(); if (settings.sound) audio.unlock().then(() => audio.play('step')); });
  [dom.soundToggle, dom.motionToggle, dom.contrastToggle, dom.qualitySelect].forEach((control) => control.addEventListener('change', saveSettings));
  dom.slider.addEventListener('input', () => { const value = Number(dom.slider.value); renderer.previewVariable(dom.variable.dataset.subject, value); });
  dom.slider.addEventListener('change', () => renderer.commitVariable(dom.variable.dataset.subject, Number(dom.slider.value)));
  dom.cameraLeft.addEventListener('click', () => renderer.rotateCamera(-1));
  dom.cameraRight.addEventListener('click', () => renderer.rotateCamera(1));
  dom.cameraReset.addEventListener('click', () => renderer.resetCamera());
  $$('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
    $$('.filter-chip').forEach((item) => {
      item.classList.toggle('active', item === chip);
      item.setAttribute('aria-pressed', String(item === chip));
    });
    renderCards(chip.dataset.filter);
  }));
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  addEventListener('hashchange', routeFromHash);
}

function routeFromHash() {
  const id = location.hash.slice(1);
  if (id && experimentById.has(id)) {
    if (currentExperiment?.id !== id) startExperiment(id);
    return;
  }
  if (id || currentExperiment) showCatalog();
}

function closeAllDialogs() {
  $$('dialog[open]').forEach((dialog) => dialog.close());
}

boot();
