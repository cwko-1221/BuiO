import { experiments, experimentById, getNextExperiment } from './data/experiments.js';

// The shared runtime is loaded blocking in <head>, so the dictionary is ready
// before this module's first render.
const t = window.BuiI18n.t;
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
  setBoot(12, t('sl.bootContent'));
  let studentId;
  try {
    studentId = await resolveStudentId();
  } catch (error) {
    console.error('3D laboratory initialization failed.', error);
    setBoot(100, t('sl.bootExpired'));
    setTimeout(() => { location.href = '/'; }, 900);
    return;
  }
  store = new ProgressStore(studentId);
  audio = new AudioEngine(settings.sound);
  setBoot(35, t('sl.bootApparatus'));
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
    showToast(t('sl.fallbackNotice'), 'try');
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
  setBoot(68, t('sl.bootNotebook'));
  renderCards();
  renderProgress();
  applySettings();
  bindEvents();
  setBoot(100, t('sl.bootReady'));
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
      <span class="card-art"><span class="card-illustration">${illustrationSvg(experiment.icon)}</span><span class="card-complete" aria-label="${t('sl.completed')}">✓</span></span>
      <span class="card-copy">
        <span class="card-topline"><span class="card-topic">${experiment.topic}</span><span>${t('sl.cardMeta', { minutes: experiment.minutes, grades: experiment.grades })}</span></span>
        <h3>${experiment.title}</h3><p>${experiment.question}</p>
        <span class="card-footer"><span class="card-stars" aria-label="${completed ? t('sl.starsLabel', { count: progress.bestScore }) : t('sl.notCompleted')}">${stars}</span><span class="card-arrow" aria-hidden="true">→</span></span>
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
  dom.continue.querySelector('span').textContent = t(complete ? 'sl.continueMine' : 'sl.startFirst');
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
  dom.labMeta.textContent = t('sl.labMeta', { topic: definition.topic, grades: definition.grades, minutes: definition.minutes });
  dom.labTitle.textContent = definition.title;
  setMissionCollapsed(true);
  dom.hintBox.hidden = true;
  dom.observation.hidden = true;
  dom.recordPanel.hidden = true;
  history.replaceState(null, '', `#${definition.id}`);
  updateMission();
  if (canRestore) {
    showToast(t('sl.resumed', { n: saved.currentStep + 1 }), 'success');
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
      'wrong-object': t('sl.tryWrongObject'),
      'wrong-target': t('sl.tryWrongTarget'),
      'wrong-verb': t('sl.tryWrongVerb'),
      'adjust-more': t('sl.tryAdjustMore'),
      'record-mismatch': t('sl.tryRecordMismatch'),
      'record-missing': t('sl.tryRecordMissing'),
    };
    showToast(messages[event.detail.reason] || t('sl.tryDefault'), 'try');
  });
  simulation.addEventListener('stepcomplete', (event) => {
    showObservation(event.detail.step.observation);
    showToast(t('sl.observeDone'), 'success');
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
  dom.stepLabel.textContent = t('sl.stepOf', { n: index + 1, total: currentExperiment.steps.length });
  dom.missionPeekStep.textContent = dom.stepLabel.textContent;
  dom.stepProgress.style.width = `${((index + 1) / currentExperiment.steps.length) * 100}%`;
  dom.missionVerb.textContent = step.verb;
  dom.missionTitle.textContent = step.title;
  dom.missionPeekTitle.textContent = step.title;
  dom.missionInstruction.textContent = step.instruction;
  dom.missionCue.lastElementChild.textContent = step.cue;
  dom.hintBox.hidden = true;
  dom.hintBox.textContent = step.hint;
  dom.accessible.setAttribute('aria-label', t('sl.accessibleAria', { instruction: step.instruction }));
  dom.accessible.textContent = step.action.type === 'adjust' ? t('sl.accessibleAdjust')
    : step.action.type === 'record' ? t('sl.accessibleRecord') : t('sl.accessible');
  renderer.setStep(step);
  configureVariable(step);
  configureRecord(step);
}

function configureRecord(step) {
  const action = step.action;
  const isRecord = action.type === 'record';
  dom.recordPanel.hidden = !isRecord;
  if (!isRecord) return;
  dom.recordLabel.textContent = action.unit ? t('sl.readingWithUnit', { label: action.label || t('sl.reading'), unit: action.unit }) : (action.label || t('sl.reading'));
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
  dom.variableLabel.textContent = t('sl.variableLabel');
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

  dom.stageNext.textContent = slide.next || t('sl.continue');
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
    kicker: t('sl.stepOneKicker'),
    next: t('sl.watched'),
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
      fallback.append(element('p', null, t('sl.noClip')));
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
    kicker: t('sl.stepOneKicker'),
    render() {
      const wrap = element('div', 'stage-notice');
      wrap.append(element('h2', 'stage-heading', t('sl.watchFor')));
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
    kicker: t('sl.stepOneKicker'),
    next: t('sl.toHypothesis'),
    render() {
      const wrap = element('div', 'stage-wonder');
      wrap.append(element('p', 'stage-lead', t('sl.myQuestion')));
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
    kicker: t('sl.stepTwoKicker'),
    next: t('sl.testIt'),
    locked: true,
    render() {
      const wrap = element('div', 'stage-choice');
      wrap.append(element('h2', 'stage-heading', definition.prediction.prompt));
      const options = element('div', 'stage-options');
      options.id = 'predictionOptions';
      options.setAttribute('role', 'radiogroup');
      options.setAttribute('aria-label', t('sl.chooseHypothesis'));
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
      safety.append(element('b', null, t('sl.safetyLead')));
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
    kicker: t('sl.stepFourKicker'),
    next: t('sl.seeExplanation'),
    locked: true,
    render() {
      const wrap = element('div', 'stage-analysis');
      wrap.append(element('h2', 'stage-heading', t('sl.doesItHold')));

      const chosen = simulation.state.prediction;
      const matched = chosen === definition.prediction.answer;
      const verdict = element('div', 'stage-verdict');
      const mine = element('section', matched ? 'held' : 'revised');
      mine.append(element('span', 'stage-label', t('sl.yourHypothesis')));
      const hypothesis = element('p', null, chosen == null
        ? t('sl.noHypothesis')
        : `${definition.prediction.options[chosen]}${t(matched ? 'sl.supported' : 'sl.notSupported')}`);
      hypothesis.id = 'analysisHypothesis';
      mine.append(hypothesis);
      const evidenceBox = element('section');
      evidenceBox.append(element('span', 'stage-label', t('sl.evidenceLabel')));
      const evidence = element('p', null, definition.analysis.evidence);
      evidence.id = 'analysisEvidence';
      evidenceBox.append(evidence);
      verdict.append(mine, evidenceBox);
      wrap.append(verdict);

      const records = simulation.state.records || [];
      if (records.length) {
        const data = element('section', 'stage-data');
        data.id = 'analysisData';
        data.append(element('span', 'stage-label', t('sl.yourData')));
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
    kicker: t('sl.stepFourKicker'),
    next: t('sl.seeExplanation'),
    locked: true,
    render() {
      const wrap = element('div', 'stage-choice');
      wrap.append(element('p', 'stage-lead', t('sl.thinkFurther')));
      wrap.append(element('h2', 'stage-heading', reflection.prompt));
      const options = element('div', 'stage-options');
      options.id = 'analysisReflectOptions';
      options.setAttribute('role', 'radiogroup');
      options.setAttribute('aria-label', t('sl.chooseThought'));
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
          feedback.textContent = t(right ? 'sl.rightBecause' : 'sl.wrongBecause', { because: reflection.because });
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
    chapterSlide(t('sl.chapterOne'), t('sl.chapterObserve'), t('sl.chapterObserveLead')),
    videoSlide(definition),
    noticeSlide(definition),
    wonderSlide(definition),
    chapterSlide(t('sl.chapterTwo'), t('sl.chapterHypothesis'), t('sl.chapterHypothesisLead')),
    hypothesisSlide(definition),
  ], () => {
    renderer.setStep(simulation.step);
    showToast(t('sl.hypothesisSaved'), 'success');
  });
}

function openHypothesisOnly() {
  runStage([
    chapterSlide(t('sl.chapterTwo'), t('sl.chapterHypothesis'), t('sl.chapterHypothesisLead')),
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
    chapterSlide(t('sl.chapterFour'), t('sl.chapterAnalyse'), t('sl.chapterAnalyseLead')),
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
  dom.phenomenonTitle.textContent = result.phenomenonTitle || t('sl.watchFinal');
  dom.phenomenonText.textContent = result.observation;
  dom.phenomenonComparison.hidden = !comparison;
  dom.phenomenonComparison.textContent = comparison
    ? t('sl.comparisonLine', { leftLabel: comparison.leftLabel, leftValue: comparison.leftValue, rightLabel: comparison.rightLabel, rightValue: comparison.rightValue })
    : '';
  dom.phenomenonStage.hidden = false;
  dom.phenomenonTimerBar.style.setProperty('--phenomenon-duration', `${duration}ms`);
  dom.phenomenonTimerBar.style.animation = 'none';
  void dom.phenomenonTimerBar.offsetWidth;
  dom.phenomenonTimerBar.style.animation = '';

  const updateCountdown = () => {
    const seconds = Math.max(1, Math.ceil((duration - (performance.now() - startedAt)) / 1000));
    dom.phenomenonCountdown.textContent = t('sl.explainIn', { seconds });
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
  dom.resultScoreText.textContent = simulation.state.prediction == null ? t('sl.scoreNone') : score === 3 ? t('sl.scoreThree') : score === 2 ? t('sl.scoreTwo') : t('sl.scoreOne');
  const prediction = simulation.state.prediction == null ? t('sl.noPrediction') : definition.prediction.options[simulation.state.prediction];
  const correct = simulation.state.prediction === definition.prediction.answer;
  dom.resultPrediction.textContent = simulation.state.prediction == null ? prediction : `${prediction}${t(correct ? 'sl.predictionMatched' : 'sl.predictionRevised')}`;
  dom.resultObservation.textContent = definition.result.observation;
  dom.resultComparison.hidden = !comparison;
  if (comparison) {
    dom.comparisonLeftLabel.textContent = comparison.leftLabel;
    dom.comparisonLeftValue.textContent = comparison.leftValue;
    dom.comparisonRightLabel.textContent = comparison.rightLabel;
    dom.comparisonRightValue.textContent = comparison.rightValue;
    dom.comparisonConclusion.textContent = comparison.conclusion;
  }
  dom.resultExplanation.textContent = t('sl.modelLimit', { explanation: definition.result.explanation, note: definition.modelNote });
  dom.resultCodes.textContent = t('sl.curriculumLine', { items: definition.curriculum.items, codes: definition.curriculum.codes.join(' · ') });
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
  dom.missionPanelToggle.setAttribute('aria-label', t(collapsed ? 'sl.expandMission' : 'sl.collapseMission'));
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
  dom.notebookSummary.innerHTML = `<div class="summary-tile"><b>${completed}</b><span>${t('sl.summaryDone')}</span></div><div class="summary-tile"><b>${stars}</b><span>${t('sl.summaryStars')}</span></div><div class="summary-tile"><b>${topics}</b><span>${t('sl.summaryTopics')}</span></div>`;
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
  dom.soundButton.setAttribute('aria-label', t(settings.sound ? 'sl.soundOff' : 'sl.soundOn'));
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
    if (!simulation || !confirm(t('sl.confirmRestart'))) return;
    simulation.reset({ keepPrediction: true });
    showToast(t('sl.restarted'));
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
