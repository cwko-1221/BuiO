const STORAGE_KEY = 'buio-science-lab:v1';
const SETTINGS_KEY = 'buio-science-lab:settings:v1';

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export class ProgressStore {
  constructor(studentId = 'local') {
    this.studentId = String(studentId || 'local').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'local';
    this.key = `${STORAGE_KEY}:${this.studentId}`;
    this.data = this.#load();
  }

  #load() {
    const raw = safeParse(localStorage.getItem(this.key), null);
    if (!raw || raw.version !== 1) return { version: 1, experiments: {}, updatedAt: Date.now() };
    return { version: 1, experiments: raw.experiments || {}, updatedAt: raw.updatedAt || Date.now() };
  }

  saveSession(experimentId, state) {
    const previous = this.data.experiments[experimentId] || {};
    this.data.experiments[experimentId] = {
      ...previous,
      session: state,
      lastPlayedAt: Date.now(),
      attempts: (previous.attempts || 0) + (state.complete && !previous.session?.complete ? 1 : 0),
    };
    this.#write();
  }

  markComplete(experimentId, state, score) {
    const previous = this.data.experiments[experimentId] || {};
    this.data.experiments[experimentId] = {
      ...previous,
      completed: true,
      bestScore: Math.max(previous.bestScore || 0, Number(score) || 1),
      session: state,
      completedAt: Date.now(),
      lastPlayedAt: Date.now(),
      attempts: Math.max(1, previous.attempts || 0),
    };
    this.#write();
  }

  getExperiment(experimentId) {
    return this.data.experiments[experimentId] || null;
  }

  getSession(experimentId) {
    return this.getExperiment(experimentId)?.session || null;
  }

  getCompletedCount(validIds = null) {
    const allow = validIds ? new Set(validIds) : null;
    return Object.entries(this.data.experiments)
      .filter(([id, entry]) => (!allow || allow.has(id)) && entry.completed)
      .length;
  }

  getLastPlayed(validIds = null) {
    const allow = validIds ? new Set(validIds) : null;
    return Object.entries(this.data.experiments)
      .filter(([id, entry]) => (!allow || allow.has(id)) && entry.lastPlayedAt)
      .sort((a, b) => b[1].lastPlayedAt - a[1].lastPlayedAt)[0]?.[0] || null;
  }

  clearSession(experimentId) {
    const entry = this.data.experiments[experimentId];
    if (!entry) return;
    delete entry.session;
    this.#write();
  }

  #write() {
    this.data.updatedAt = Date.now();
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { /* private mode or quota */ }
  }

  static loadSettings() {
    return {
      sound: true,
      reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      highContrast: false,
      quality: 'auto',
      ...safeParse(localStorage.getItem(SETTINGS_KEY), {}),
    };
  }

  static saveSettings(settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }
}
