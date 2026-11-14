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
