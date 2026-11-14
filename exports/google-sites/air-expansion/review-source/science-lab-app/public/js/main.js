import { experiments, experimentById, selectExperimentLanguage } from './data/experiments.js';

// The shared runtime is loaded blocking in <head>, so the dictionary is ready
// before this module's first render.
const t = window.BuiI18n.t;
import { LabSimulation } from './simulation/LabSimulation.js';
import { ProgressStore } from './persistence/ProgressStore.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { FallbackRenderer } from './render/FallbackRenderer.js';


const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const dom = {
  boot: $('#bootScreen'), bootMessage: $('#bootMessage'), bootFill: $('#bootMeterFill'),
  topbar: $('#topbar'), main: $('#mainContent'), lab: $('#labScreen'),
  progressCount: $('#progressCount'), progressRing: $('#progressRing'),
  labTitle: $('#labTitle'),
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
  replay: $('#replayButton'), settingsButton: $('#settingsButton'), settingsDialog: $('#settingsDialog'), soundButton: $('#soundButton'), soundToggle: $('#soundToggle'),
  motionToggle: $('#motionToggle'), contrastToggle: $('#contrastToggle'), qualitySelect: $('#qualitySelect'),
  toast: $('#toastRegion'), flash: $('#screenFlash'),
  phenomenonStage: $('#phenomenonStage'), phenomenonTitle: $('#phenomenonTitle'), phenomenonText: $('#phenomenonText'),
  phenomenonComparison: $('#phenomenonComparison'), phenomenonCountdown: $('#phenomenonCountdown'),
  phenomenonTimerBar: $('#phenomenonTimerBar'), phenomenonExplain: $('#phenomenonExplainButton'),
  cameraLeft: $('#cameraLeftButton'), cameraReset: $('#cameraResetButton'), cameraRight: $('#cameraRightButton'),
};

let store;
let audio;
let renderer;
let rendererPromise;
let selectionRevision = 0;
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
    if ([401, 403].includes(error.status)) { location.href = '/'; return; }
    window.BuiLoading.recover(error, undefined, dom.boot);
    return;
  }
  store = new ProgressStore(studentId);
  audio = new AudioEngine(settings.sound);
  if (window.__BUIO_EXPORT_QA__) {
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

// No authentication or backend calls in the competition edition.
async function resolveStudentId() { return 'competition-air-expansion'; }

function setBoot(percent, message) {
  dom.bootFill.style.width = `${percent}%`;
  dom.bootMessage.textContent = message;
}

function renderProgress() {
  const complete = store.getCompletedCount(activeExperimentIds);
  dom.progressCount.textContent = `${complete} / ${experiments.length}`;
  const percentage = Math.round((complete / experiments.length) * 100);
  dom.progressRing.style.background = `conic-gradient(var(--yellow) ${percentage}%, rgba(255,255,255,.18) 0)`;
}

async function ensureRenderer() {
  if (!rendererPromise) rendererPromise = (async () => {
    const options = {
      settings, audio,
      onAction: (action) => simulation?.dispatchAction(action) || { accepted: false },
      onPreview: ({ subject, value }) => { simulation?.previewVariable(subject, value); syncVariableValue(value); },
      onHover: showInteractionLabel,
      onContextIssue: (message) => showToast(message, 'try'),
    };
    try {
      const { LabRenderer } = await import('./render/LabRenderer.js');
      renderer = new LabRenderer($('#labCanvas'), options);
      await renderer.init();
    } catch {
      try { renderer?.dispose?.(); } catch { /* init can fail before the scene exists */ }
      document.body.classList.add('no-webgl');
      renderer = new FallbackRenderer($('#labCanvas'), options);
      await renderer.init();
      showToast(t('sl.fallbackNotice'), 'try');
    }
    return renderer;
  })().catch(error => { rendererPromise = null; throw error; });
  return rendererPromise;
}

async function startExperiment(id, { forceNew = false } = {}) {
  const definition = experimentById.get(id);
  if (!definition) return;
  const revision = ++selectionRevision;
  dom.boot.classList.remove('done');
  setBoot(35, t('sl.bootApparatus'));
  try {
    await ensureRenderer();
    if (revision !== selectionRevision) return;
    await renderer.prepareExperiment?.(definition);
    if (revision !== selectionRevision) return;
  } catch (error) {
    if (revision === selectionRevision) window.BuiLoading.recover(error, () => startExperiment(id, { forceNew }));
    return;
  } finally {
    if (revision === selectionRevision) dom.boot.classList.add('done');
  }
  cancelPhenomenon();
  closeAllDialogs();
  audio.unlock();
  currentExperiment = definition;
  const saved = !forceNew ? store.getSession(id) : null;
  const canRestore = saved && !saved.complete && saved.currentStep > 0
    && (saved.definitionSchema || 1) === (definition.schema || 1);
  simulation = new LabSimulation(definition, canRestore ? saved : null);
  bindSimulation();
  renderer.loadExperiment(definition, canRestore ? saved.actionHistory : []);
  dom.lab.hidden = false;
  dom.labTitle.textContent = definition.title;
  setMissionCollapsed(true);
  dom.hintBox.hidden = true;
  dom.observation.hidden = true;
  dom.recordPanel.hidden = true;
  // Embed navigation stays inside the experiment.
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

function noticeSlide(definition) {
  return {
    kind: 'notice',
    id: 'observe-notice',
    kicker: t('sl.stepOneKicker'),
    render() {
      const wrap = element('div', 'stage-notice');
      wrap.append(element('h2', 'stage-heading', definition.observe.title));
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

function applySettings() {
  document.querySelector('#languageSelect').value = window.BuiI18n.lang;
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

// Included in the application bundle by the standalone exporter. These bindings
// belong to main.js; changing language keeps the same simulation and progress.
function changeLanguage(language) {
  const previousDefinition = currentExperiment;
  const visibleSlide = !dom.stage.hidden ? dom.stage.dataset.slide : null;
  const prediction = selectedPrediction;
  const reflection = selectedReflection;
  window.BuiI18n.setLanguage(language);
  dom.toast.replaceChildren();
  selectExperimentLanguage(window.BuiI18n.lang);
  currentExperiment = experimentById.get('air-expansion');
  if (!simulation) return;
  simulation.definition = currentExperiment;
  const state = simulation.state;
  state.records = state.records.map(row => {
    const previous = previousDefinition.steps.find(step => step.action.subject === row.subject)?.action;
    const next = currentExperiment.steps.find(step => step.action.subject === row.subject)?.action;
    const index = previous?.options?.indexOf(row.value) ?? -1;
    return next ? { ...row, label: next.label, value: next.options[index >= 0 ? index : next.answer], unit: next.unit || '' } : row;
  });
  state.observations = currentExperiment.steps.slice(0, state.currentStep).map(step => step.observation).filter(Boolean);
  // Translate the current scene in place, keeping its camera and animated
  // balloon shape as well as its scientific state.
  for (const [id, entity] of renderer.entities || []) {
    const key = `air.label.${id}`;
    const translated = window.BuiI18n.t(key);
    if (translated !== key) entity.label = translated;
  }
  for (const [id, target] of renderer.targets || []) {
    const key = `air.target.${id}`;
    const translated = window.BuiI18n.t(key);
    if (translated !== key) target.label = translated;
  }
  dom.interactionLabel.hidden = true;
  dom.interactionLabel.textContent = '';
  dom.labTitle.textContent = currentExperiment.title;
  renderProgress();
  updateMission();
  if (!dom.observation.hidden) dom.observationText.textContent = state.observations.at(-1) || '';
  store.saveSession(currentExperiment.id, simulation.serialize());
  if (visibleSlide) {
    if (state.complete) openAnalysis(simulation.score());
    else openObservation();
    const index = stageSlides.findIndex(slide => (slide.id || slide.kind) === visibleSlide);
    if (index >= 0) { stageIndex = index; renderStageSlide(); }
    selectedPrediction = prediction;
    selectedReflection = reflection;
    if (prediction != null) dom.stageBody.querySelector(`[data-prediction="${prediction}"]`)?.click();
    if (reflection != null) dom.stageBody.querySelector(`[data-reflection="${reflection}"]`)?.click();
  } else if (state.complete) {
    cancelPhenomenon();
    showPhenomenon(simulation.score());
  }
}

function bindEvents() {
  document.querySelector('#languageSelect').addEventListener('change', event => changeLanguage(event.target.value));
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
  dom.settingsButton.addEventListener('click', () => dom.settingsDialog.showModal());
  dom.soundButton.addEventListener('click', () => { settings.sound = !settings.sound; ProgressStore.saveSettings(settings); applySettings(); if (settings.sound) audio.unlock().then(() => audio.play('step')); });
  [dom.soundToggle, dom.motionToggle, dom.contrastToggle, dom.qualitySelect].forEach((control) => control.addEventListener('change', saveSettings));
  dom.slider.addEventListener('input', () => { const value = Number(dom.slider.value); renderer.previewVariable(dom.variable.dataset.subject, value); });
  dom.slider.addEventListener('change', () => renderer.commitVariable(dom.variable.dataset.subject, Number(dom.slider.value)));
  dom.cameraLeft.addEventListener('click', () => renderer.rotateCamera(-1));
  dom.cameraRight.addEventListener('click', () => renderer.rotateCamera(1));
  dom.cameraReset.addEventListener('click', () => renderer.resetCamera());
  $$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => button.closest('dialog')?.close()));
  // The standalone edition has a single inquiry.
}

function routeFromHash() {
  if (!currentExperiment) startExperiment('air-expansion');
}

function closeAllDialogs() {
  $$('dialog[open]').forEach((dialog) => dialog.close());
}

boot().catch(error => window.BuiLoading.recover(error));
