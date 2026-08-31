const STATE_VERSION = 2;

export class LabSimulation extends EventTarget {
  constructor(definition, restoredState = null) {
    super();
    this.definition = definition;
    this.state = restoredState ? this.#restore(restoredState) : this.#initialState();
  }

  #initialState() {
    return {
      version: STATE_VERSION,
      experimentId: this.definition.id,
      currentStep: 0,
      completedSteps: [],
      attempts: 0,
      hintsUsed: 0,
      prediction: null,
      variables: {},
      observations: [],
      records: [],
      reflection: null,
      actionHistory: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      complete: false,
    };
  }

  #restore(candidate) {
    if (!candidate || candidate.version !== STATE_VERSION || candidate.experimentId !== this.definition.id) {
      return this.#initialState();
    }
    const state = { ...this.#initialState(), ...candidate };
    state.currentStep = Math.max(0, Math.min(this.definition.steps.length, Number(state.currentStep) || 0));
    state.completedSteps = Array.isArray(state.completedSteps) ? state.completedSteps.slice(0, state.currentStep) : [];
    state.observations = Array.isArray(state.observations) ? state.observations.slice(0, state.currentStep) : [];
    state.records = Array.isArray(state.records) ? state.records : [];
    state.actionHistory = Array.isArray(state.actionHistory) ? state.actionHistory.slice(-100) : [];
    return state;
  }

  get step() {
    return this.definition.steps[this.state.currentStep] || null;
  }

  setReflection(optionIndex) {
    const reflection = this.definition.analysis?.reflection;
    if (!reflection || !Number.isInteger(optionIndex)) return false;
    if (optionIndex < 0 || optionIndex >= reflection.options.length) return false;
    this.state.reflection = optionIndex;
    this.#touch();
    this.#emit('statechange', { reason: 'reflection' });
    return true;
  }

  setPrediction(optionIndex) {
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= this.definition.prediction.options.length) return false;
    this.state.prediction = optionIndex;
    this.#touch();
    this.#emit('statechange', { reason: 'prediction' });
    return true;
  }

  useHint() {
    if (!this.step || this.state.complete) return;
    this.state.hintsUsed += 1;
    this.#touch();
    this.#emit('statechange', { reason: 'hint' });
  }

  previewVariable(subject, value) {
    if (!this.step || this.step.action.type !== 'adjust' || this.step.action.subject !== subject) return false;
    const range = this.step.action.range || [0, 100];
    const low = Math.min(...range);
    const high = Math.max(...range);
    this.state.variables[subject] = Math.min(high, Math.max(low, Number(value)));
    this.#touch();
    this.#emit('preview', { subject, value: this.state.variables[subject] });
    return true;
  }

  dispatchAction(action) {
    const expected = this.step?.action;
    if (!expected || this.state.complete) return { accepted: false, reason: 'complete' };

    const result = this.#validateAction(expected, action);
    this.state.actionHistory.push({
      at: Date.now(),
      stepId: this.step.id || `${this.definition.id}-${this.state.currentStep + 1}`,
      action: this.#sanitiseAction(action),
      accepted: result.accepted,
    });
    this.state.actionHistory = this.state.actionHistory.slice(-100);
    this.#touch();

    if (!result.accepted) {
      this.state.attempts += 1;
      this.#emit('actionrejected', { expected, action, reason: result.reason });
      this.#emit('statechange', { reason: 'attempt' });
      return result;
    }

    if (expected.type === 'adjust') this.state.variables[expected.subject] = Number(action.value);
    if (expected.type === 'record') {
      // Keep one row per measurement so a repeated step overwrites rather than
      // stacking a second reading of the same quantity into the table.
      const row = {
        subject: expected.subject,
        label: expected.label || expected.subject,
        value: expected.options[Number(action.value)],
        unit: expected.unit || '',
      };
      const existing = this.state.records.findIndex((item) => item.subject === row.subject);
      if (existing >= 0) this.state.records[existing] = row;
      else this.state.records.push(row);
    }
    const completedIndex = this.state.currentStep;
    const completedStep = this.step;
    this.state.completedSteps.push(completedStep.id || `${this.definition.id}-${completedIndex + 1}`);
    if (completedStep.observation) this.state.observations.push(completedStep.observation);
    this.state.currentStep += 1;
    this.#emit('stepcomplete', { index: completedIndex, step: completedStep, action });

    if (this.state.currentStep >= this.definition.steps.length) {
      this.state.complete = true;
      this.state.completedAt = Date.now();
      this.#emit('complete', { score: this.score() });
    }
    this.#emit('statechange', { reason: this.state.complete ? 'complete' : 'step' });
    return { accepted: true, complete: this.state.complete };
  }

  #validateAction(expected, action) {
    if (!action || action.type !== expected.type) return { accepted: false, reason: 'wrong-verb' };
    if (expected.subject && action.subject !== expected.subject) return { accepted: false, reason: 'wrong-object' };
    if (expected.target && action.target !== expected.target) return { accepted: false, reason: 'wrong-target' };
    if (expected.type === 'adjust') {
      const value = Number(action.value);
      if (!Number.isFinite(value)) return { accepted: false, reason: 'invalid-value' };
      if (value < expected.min || value > expected.max) return { accepted: false, reason: 'adjust-more' };
    }
    if (expected.type === 'record') {
      const choice = Number(action.value);
      if (!Number.isInteger(choice) || choice < 0 || choice >= expected.options.length) {
        return { accepted: false, reason: 'record-missing' };
      }
      if (choice !== expected.answer) return { accepted: false, reason: 'record-mismatch' };
    }
    if (expected.type === 'stir') {
      const amount = Number(action.amount);
      if (!Number.isFinite(amount) || amount < expected.amount) return { accepted: false, reason: 'stir-more' };
    }
    if (expected.evidence) {
      const evidence = action.evidence;
      if (!evidence || typeof evidence !== 'object') return { accepted: false, reason: 'physical-evidence' };
      if (expected.evidence.contact && evidence.contact !== true) return { accepted: false, reason: 'physical-evidence' };
      if (Number.isFinite(expected.evidence.maxDistance) && Number(evidence.distance) > expected.evidence.maxDistance) {
        return { accepted: false, reason: 'physical-evidence' };
      }
      if (Number.isFinite(expected.evidence.maxAngleDeg) && Number(evidence.angleErrorDeg) > expected.evidence.maxAngleDeg) {
        return { accepted: false, reason: 'physical-evidence' };
      }
      if (Number.isFinite(expected.evidence.minImpulse) && Number(evidence.impulse) < expected.evidence.minImpulse) {
        return { accepted: false, reason: 'physical-evidence' };
      }
    }
    return { accepted: true };
  }

  #sanitiseAction(action) {
    if (!action || typeof action !== 'object') return {};
    return {
      type: String(action.type || ''),
      subject: String(action.subject || ''),
      target: String(action.target || ''),
      ...(Number.isFinite(Number(action.value)) ? { value: Number(action.value) } : {}),
      ...(Number.isFinite(Number(action.amount)) ? { amount: Number(action.amount) } : {}),
      ...(action.evidence && typeof action.evidence === 'object' ? {
        evidence: Object.fromEntries(Object.entries(action.evidence)
          .filter(([, value]) => typeof value === 'boolean' || Number.isFinite(Number(value)))
          .map(([key, value]) => [key, typeof value === 'boolean' ? value : Number(value)])),
      } : {}),
    };
  }

  score() {
    const hintPenalty = Math.min(2, this.state.hintsUsed);
    const attemptPenalty = this.state.attempts > 4 ? 1 : 0;
    const predictionPenalty = this.state.prediction == null ? 1 : 0;
    return Math.max(1, 3 - hintPenalty - attemptPenalty - predictionPenalty);
  }

  reset({ keepPrediction = true } = {}) {
    const prediction = keepPrediction ? this.state.prediction : null;
    this.state = this.#initialState();
    this.state.prediction = prediction;
    this.#emit('reset', {});
    this.#emit('statechange', { reason: 'reset' });
  }

  serialize() {
    return JSON.parse(JSON.stringify(this.state));
  }

  #touch() {
    this.state.updatedAt = Date.now();
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
