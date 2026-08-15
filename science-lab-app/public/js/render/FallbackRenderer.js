export class FallbackRenderer {
  constructor(canvas, { onAction, onPreview } = {}) {
    this.canvas = canvas;
    this.actionHandler = onAction;
    this.previewHandler = onPreview;
    this.currentStep = null;
    this.definition = null;
  }

  init() {
    this.canvas.hidden = true;
    this.stage = document.createElement('div');
    this.stage.className = 'fallback-stage';
    this.stage.setAttribute('role', 'img');
    this.stage.setAttribute('aria-label', '簡化版科學實驗場景');
    this.canvas.after(this.stage);
    this.loadCatalog();
  }

  loadCatalog() {
    if (!this.stage) return;
    this.definition = null;
    this.stage.className = 'fallback-stage catalog-fallback';
    this.stage.innerHTML = `
      <div class="fallback-island" aria-hidden="true">
        <span class="fallback-flask"><i></i></span>
        <span class="fallback-atom"><i></i><i></i><i></i></span>
        <span class="fallback-orb"></span>
      </div>`;
  }

  loadExperiment(definition) {
    this.definition = definition;
    this.stage.className = 'fallback-stage experiment-fallback';
    const apparatus = definition.apparatus.slice(0, 6).map((item, index) => `
      <span class="fallback-object" style="--index:${index};--lift:${(index % 3) * 15}px"><i></i><b>${escapeHtml(item)}</b></span>`).join('');
    this.stage.innerHTML = `<div class="fallback-bench"><div class="fallback-apparatus">${apparatus}</div></div>`;
    this.setStep(definition.steps[0]);
  }

  setStep(step) {
    this.currentStep = step;
    if (!this.stage || !step) return;
    this.stage.dataset.verb = step.verb;
    this.stage.querySelectorAll('.fallback-object').forEach((object) => object.classList.remove('active'));
    const objects = [...this.stage.querySelectorAll('.fallback-object')];
    objects[(this.definition?.steps.indexOf(step) || 0) % Math.max(1, objects.length)]?.classList.add('active');
  }

  performAccessibleAction() {
    const expected = this.currentStep?.action;
    if (!expected) return false;
    const action = { type: expected.type, subject: expected.subject, target: expected.target };
    if (expected.type === 'adjust') {
      action.value = (expected.min + expected.max) / 2;
      this.previewVariable(expected.subject, action.value);
    }
    if (expected.type === 'stir') action.amount = expected.amount;
    const result = this.actionHandler?.(action) || { accepted: false };
    if (result.accepted) this.#pulse();
    return result.accepted;
  }

  previewVariable(subject, value) {
    this.previewHandler?.({ subject, value: Number(value) });
  }

  commitVariable(subject, value) {
    const result = this.actionHandler?.({ type: 'adjust', subject, value: Number(value) }) || { accepted: false };
    if (result.accepted) this.#pulse();
    return result;
  }

  setSettings(settings) {
    this.settings = settings;
    document.documentElement.classList.toggle('reduce-motion', Boolean(settings.reduceMotion));
    document.documentElement.classList.toggle('high-contrast', Boolean(settings.highContrast));
  }
  rotateCamera() {}
  resetCamera() {}

  getDebugStats() {
    return { mode: this.mode, worldChildren: 0, environmentChildren: 0, background: 'fallback' };
  }
  getScreenPoint() { return null; }

  #pulse() {
    this.stage.classList.remove('accepted');
    requestAnimationFrame(() => this.stage.classList.add('accepted'));
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}
