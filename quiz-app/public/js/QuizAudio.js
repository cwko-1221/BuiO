import { GameAudio } from '/game/js/v2/GameAudio.js?v=20260717-louder-2';

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const STORAGE = 'buio:quiz:audio';

export class QuizAudio extends GameAudio {
  constructor({ host = false } = {}) {
    super();
    this.phase = null;
    this.host = host;
    this.musicEnabled = host;
    this.effectsEnabled = true;
    this.volume = .45;
    this.muted = false;
    this.urgent = false;
    this.paused = false;
    try {
      const settings = JSON.parse(localStorage.getItem(`${STORAGE}:${host ? 'host' : 'student'}`) || 'null');
      if (settings) {
        this.musicEnabled = settings.music === true;
        this.effectsEnabled = settings.effects !== false;
        this.volume = Math.max(0, Math.min(1, Number(settings.volume) || 0));
      }
    } catch {}
  }

  persist() {
    try { localStorage.setItem(`${STORAGE}:${this.host ? 'host' : 'student'}`, JSON.stringify({
      music: this.musicEnabled, effects: this.effectsEnabled, volume: this.volume,
    })); } catch {}
  }

  createGraph() {
    super.createGraph();
    if (!this.context) return;
    this.master.gain.value = this.volume;
    this.music.gain.value = .38;
    this.effects.gain.value = this.effectsEnabled ? .7 : 0;
  }

  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') this.createGraph();
      if (!this.context || this.paused || document.hidden) return false;
      if (this.pauseTask) await this.pauseTask;
      if (this.paused || document.hidden) return false;
      if (this.context.state === 'suspended') await this.context.resume();
      if (this.canPlayMusic()) this.startMusic();
      return this.context.state === 'running';
    } catch { return false; }
  }

  canPlayMusic() {
    return this.musicEnabled && this.volume > 0 && !this.paused && !document.hidden
      && ['lobby', 'question', 'leaderboard'].includes(this.phase);
  }

  setSettings({ music = this.musicEnabled, effects = this.effectsEnabled, volume = this.volume } = {}) {
    this.musicEnabled = Boolean(music); this.effectsEnabled = Boolean(effects);
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
    this.persist();
    if (this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .025);
      this.effects.gain.setTargetAtTime(this.effectsEnabled ? .7 : 0, this.context.currentTime, .025);
    }
    if (!this.canPlayMusic()) this.stopMusic();
    void this.unlock();
  }

  setPhase(phase) {
    if (this.phase === phase) return;
    this.phase = phase;
    this.urgent = false;
    this.stopMusic();
    if (this.canPlayMusic() && this.context?.state === 'running') this.startMusic();
  }

  startMusic() {
    if (!this.context || this.musicTimer || !this.canPlayMusic()) return;
    this.music.gain.setTargetAtTime(.38, this.context.currentTime, .04);
    this.musicStep = 0; this.nextMusicTime = this.context.currentTime + .16;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 80);
    this.scheduleMusic();
  }

  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = null;
    if (this.context) this.music.gain.setTargetAtTime(0, this.context.currentTime, .025);
  }

  scheduleMusic() {
    if (!this.canPlayMusic() || this.context?.state !== 'running') return;
    // Schedule a short horizon so a result or a mute never leaves a long queued soundtrack.
    if (this.nextMusicTime < this.context.currentTime) this.nextMusicTime = this.context.currentTime + .025;
    const question = this.phase === 'question';
    const bpm = question ? this.urgent ? 156 : 124 : 104;
    const beat = 60 / bpm / 2;
    const roots = question ? [57, 53, 60, 55] : [60, 67, 69, 65];
    const melody = question ? [0, 7, 12, 7, 3, 7, 10, 7] : [0, 4, 7, 12, 7, 4, 9, 7];
    while (this.nextMusicTime < this.context.currentTime + .2) {
      const step = this.musicStep++, at = this.nextMusicTime;
      const root = roots[Math.floor(step / 8) % roots.length];
      this.tone(frequency(root + 12 + melody[step % 8]), at, beat * .65, .045, 'triangle', this.music);
      if (step % 2 === 0) this.tone(frequency(root - 12), at, beat * 1.3, .09, 'sine', this.music);
      if (step % 4 === 0) this.tone(95, at, .1, .085, 'sine', this.music, 42);
      if (step % 4 === 2) this.noise(at, .07, .018, 1200, this.music);
      this.nextMusicTime += beat;
    }
  }

  play(name) {
    if (!this.effectsEnabled || this.volume === 0 || this.paused || document.hidden || this.context?.state !== 'running') return;
    const now = this.context.currentTime;
    const notes = (values, spacing = .085, length = .2, volume = .13) => values.forEach((note, i) => this.tone(frequency(note), now + i * spacing, length, volume, 'triangle'));
    switch (name) {
      case 'countdown': this.tone(620, now, .08, .11, 'sine'); break;
      case 'go': notes([72, 79], .08, .22); break;
      case 'submit': this.tone(500, now, .09, .1, 'triangle', this.effects, 820); break;
      case 'answer': this.tone(880, now, .055, .035, 'sine'); break;
      case 'reveal': notes([60, 67, 72, 76], .065, .24); break;
      case 'correct': notes([72, 76, 79, 84], .075, .23); break;
      case 'wrong': this.tone(290, now, .22, .11, 'triangle', this.effects, 185); break;
      case 'scores': notes([64, 67, 72], .08, .2, .1); break;
      case 'finish': notes([60, 64, 67, 72, 76, 79, 84], .11, .38, .14); break;
      default: break;
    }
  }

  pause(value = true) {
    value = Boolean(value);
    if (this.paused === value) return;
    this.paused = value;
    if (value) {
      this.stopMusic();
      if (this.context && this.context.state !== 'closed') this.pauseTask = this.context.suspend().catch(() => {});
    } else if (this.context) void this.unlock();
  }

  destroy() {
    this.stopMusic();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
