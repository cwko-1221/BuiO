export class AudioEngine {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.activeLoops = new Map();
    this.visibilityHandler = () => this.#handleVisibility();
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  async unlock() {
    if (!this.enabled) return false;
    if (!this.context) this.#createContext();
    if (this.context?.state === 'suspended') {
      try { await this.context.resume(); } catch { return false; }
    }
    return this.context?.state === 'running';
  }

  #createContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.context.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.context.destination);
    this.noiseBuffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * 1.4), this.context.sampleRate);
    const channel = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.enabled ? 0.22 : 0, this.context.currentTime, 0.025);
    }
    if (!this.enabled) this.stopAllLoops();
  }

  play(name, options = {}) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const library = {
      hover: () => this.#tone(620, .035, 'sine', .055, 740),
      pickup: () => this.#tone(310, .085, 'triangle', .12, 430),
      drop: () => { this.#tone(210, .09, 'sine', .16, 145); this.#tone(480, .04, 'triangle', .05, 390, .035); },
      connect: () => { this.#tone(430, .07, 'square', .07, 610); this.#tone(760, .08, 'sine', .06, 910, .05); },
      switch: () => this.#tone(170, .06, 'square', .12, 110),
      measure: () => { this.#tone(660, .08, 'sine', .07, 660); this.#tone(880, .11, 'sine', .08, 880, .09); },
      wrong: () => { this.#tone(190, .11, 'triangle', .1, 150); this.#tone(140, .12, 'triangle', .08, 115, .08); },
      step: () => { this.#tone(520, .08, 'sine', .1, 690); this.#tone(780, .12, 'triangle', .08, 920, .075); },
      success: () => this.#successChord(),
      pour: () => this.#noise(.65, 650, .07),
      splash: () => this.#noise(.24, 1100, .09),
      stir: () => this.#noise(.22, 430, .045),
      whoosh: () => this.#noise(.35, 900, .04),
      impact: () => {
        const level = Number.isFinite(options.level) ? options.level : .055;
        this.#tone(105, .075, 'sine', level, 62);
        this.#noise(.055, 260, level * .48);
      },
      tuningFork: () => this.#tone(
        options.frequency || 440,
        options.duration || 1.3,
        'sine',
        Number.isFinite(options.level) ? options.level : .13,
        options.frequency || 440,
      ),
    };
    library[name]?.();
  }

  startLoop(name) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.activeLoops.has(name)) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = name === 'water' ? 1050 : 380;
    filter.Q.value = 1.1;
    gain.gain.value = 0.035;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.activeLoops.set(name, { source, gain });
  }

  stopLoop(name) {
    const loop = this.activeLoops.get(name);
    if (!loop) return;
    try { loop.source.stop(); } catch { /* already stopped */ }
    loop.source.disconnect();
    loop.gain.disconnect();
    this.activeLoops.delete(name);
  }

  stopAllLoops() {
    [...this.activeLoops.keys()].forEach((name) => this.stopLoop(name));
  }

  #tone(startFrequency, duration, type, level, endFrequency, delay = 0) {
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, level), now + Math.min(.018, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    oscillator.addEventListener('ended', () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
  }

  #noise(duration, frequency, level) {
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * .35), now + duration);
    filter.Q.value = .75;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + .02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration + .03);
    source.addEventListener('ended', () => { source.disconnect(); filter.disconnect(); gain.disconnect(); }, { once: true });
  }

  #successChord() {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      this.#tone(frequency, .32 + index * .03, index < 3 ? 'triangle' : 'sine', .09, frequency * 1.01, index * .075);
    });
  }

  async #handleVisibility() {
    if (!this.context) return;
    if (document.hidden) {
      this.stopAllLoops();
      try { await this.context.suspend(); } catch { /* ignore */ }
    } else if (this.enabled) {
      // Browsers may still require another gesture; the next interaction calls unlock().
      try { await this.context.resume(); } catch { /* ignore */ }
    }
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.stopAllLoops();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
