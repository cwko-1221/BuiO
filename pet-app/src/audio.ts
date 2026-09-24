type SoundName = 'tap' | 'buy' | 'coin' | 'arcadeDrop' | 'arcadeLand' | 'arcadeTiming' | 'arcadePayout' | 'arcadeStroke' | 'hatch' | 'evolve' | 'feed' | 'happy' | 'step' | 'attack' | 'skill' | 'hurt' | 'win' | 'lose' | 'decorate' | 'reaction';

const THEMES: Record<string, { tempo: number; root: number; scale: number[]; pattern: number[] }> = {
  bedroom: { tempo: 92, root: 60, scale: [0,2,4,7,9], pattern: [0,2,4,2,1,3,4,3] },
  shop: { tempo: 116, root: 65, scale: [0,2,4,7,9], pattern: [0,1,2,4,3,2,1,3] },
  arcade: { tempo: 128, root: 72, scale: [0,2,4,7,9], pattern: [0,4,2,3,4,2,1,3] },
};

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private sfxGain?: GainNode;
  private timer = 0;
  private step = 0;
  private theme = 'bedroom';
  enabled = localStorage.getItem('pet-audio-muted') !== '1';
  musicLevel = Number(localStorage.getItem('pet-music-level') ?? .36);
  sfxLevel = Number(localStorage.getItem('pet-sfx-level') ?? .58);

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private readonly onVisibilityChange = () => {
    this.updateLevels();
    this.syncMusicLoop();
  };
  private readonly onAudioStateChange = () => this.syncMusicLoop();

  private isDocumentHidden() {
    return typeof document !== 'undefined' && document.hidden;
  }

  private stopMusicLoop() {
    if (!this.timer) return;
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private syncMusicLoop() {
    const canPlay = !!this.context
      && this.context.state === 'running'
      && this.enabled
      && this.musicLevel > 0
      && !this.isDocumentHidden();
    if (canPlay) {
      if (!this.timer) this.startLoop();
    } else {
      this.stopMusicLoop();
    }
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.context.addEventListener('statechange', this.onAudioStateChange);
      this.master = this.context.createGain(); this.music = this.context.createGain(); this.sfxGain = this.context.createGain();
      this.master.connect(this.context.destination); this.music.connect(this.master); this.sfxGain.connect(this.master);
      this.updateLevels();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.syncMusicLoop();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    localStorage.setItem('pet-audio-muted', value ? '0' : '1');
    this.updateLevels();
    this.syncMusicLoop();
  }
  setLevels(music: number, sfx: number) {
    this.musicLevel = music;
    this.sfxLevel = sfx;
    localStorage.setItem('pet-music-level', String(music));
    localStorage.setItem('pet-sfx-level', String(sfx));
    this.updateLevels();
    this.syncMusicLoop();
  }
  private updateLevels() {
    if (!this.master || !this.music || !this.sfxGain) return;
    this.master.gain.value = this.enabled && !this.isDocumentHidden() ? .85 : 0;
    this.music.gain.value = this.musicLevel;
    this.sfxGain.gain.value = this.sfxLevel;
  }

  setTheme(theme: string) { this.theme = THEMES[theme] ? theme : 'bedroom'; this.step = 0; }
  private startLoop() {
    if (!this.context || !this.enabled || this.musicLevel <= 0 || this.isDocumentHidden()) return;
    const tick = () => {
      this.timer = 0;
      if (!this.context || !this.enabled || this.musicLevel <= 0 || this.isDocumentHidden()) return;
      const theme = THEMES[this.theme];
      const duration = 60 / theme.tempo / 2;
      const index = theme.pattern[this.step % theme.pattern.length];
      const midi = theme.root + theme.scale[index % theme.scale.length] + (this.step % 16 > 11 ? 12 : 0);
      this.tone(440 * Math.pow(2, (midi - 69) / 12), duration * .82, 'triangle', .08, this.music);
      if (this.step % 4 === 0) this.tone(440 * Math.pow(2, (theme.root - 24 - 69) / 12), duration * 1.8, 'sine', .06, this.music);
      if (this.step % 2 === 0) this.noise(.025, .025, this.music);
      this.step += 1;
      this.timer = window.setTimeout(tick, duration * 1000);
    };
    tick();
  }

  private tone(frequency: number, duration: number, type: OscillatorType, gain: number, destination = this.sfxGain, delay = 0) {
    if (!this.context || !destination) return;
    const oscillator = this.context.createOscillator(); const envelope = this.context.createGain();
    const start = this.context.currentTime + delay; oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(.0001, start); envelope.gain.exponentialRampToValueAtTime(Math.max(.001, gain), start + .015); envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(destination); oscillator.start(start); oscillator.stop(start + duration + .03);
  }
  private noise(duration: number, gain: number, destination = this.sfxGain) {
    if (!this.context || !destination) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration)); const buffer = this.context.createBuffer(1, length, this.context.sampleRate); const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(); const envelope = this.context.createGain(); source.buffer = buffer; envelope.gain.setValueAtTime(gain, this.context.currentTime); envelope.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration); source.connect(envelope).connect(destination); source.start();
  }

  private pusherStroke(direction: 'forward' | 'return', voice: number) {
    if (!this.context || !this.sfxGain) return;
    const start = this.context.currentTime;
    const duration = .34;
    const pitch = 1 + ((voice % 5) - 2) * .018;
    const base = direction === 'forward' ? 86 : 101;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(direction === 'forward' ? 440 : 500, start);
    lowpass.frequency.exponentialRampToValueAtTime(185, start + duration);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(.032, start + .025);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    lowpass.connect(envelope).connect(this.sfxGain);
    const motor = this.context.createOscillator();
    motor.type = 'triangle';
    motor.frequency.setValueAtTime(base * pitch, start);
    motor.frequency.exponentialRampToValueAtTime(base * .68 * pitch, start + duration);
    const overtone = this.context.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(base * 2.08 * pitch, start);
    overtone.frequency.exponentialRampToValueAtTime(base * 1.52 * pitch, start + duration);
    motor.connect(lowpass);
    overtone.connect(lowpass);
    motor.onended = () => { motor.disconnect(); overtone.disconnect(); lowpass.disconnect(); envelope.disconnect(); };
    motor.start(start); overtone.start(start);
    motor.stop(start + duration + .02); overtone.stop(start + duration + .02);
  }

  sfx(name: SoundName, voice = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.isDocumentHidden()) return;
    if (name === 'arcadeStroke') {
      this.pusherStroke(voice < 3 ? 'forward' : 'return', voice);
      return;
    }
    const shift = 1 + ((voice % 7) - 3) * .035;
    const notes: Partial<Record<SoundName, number[]>> = {
      tap: [540], buy: [420,620,840], coin: [820,1080], arcadeDrop: [220,440,660], arcadeLand: [880,1320], arcadeTiming: [1175,1568], arcadePayout: [659,784,988,1318], hatch: [280,420,620,920], evolve: [330,440,660,880,1180],
      feed: [380,520], happy: [620,820,980], step: [160], attack: [240,180], skill: [420,680], hurt: [180,130],
      win: [440,554,660,880], lose: [330,260,196], decorate: [360,540], reaction: [620,780,1040],
    };
    const wave: OscillatorType = ['hurt','attack','arcadeDrop'].includes(name) ? 'sawtooth' : ['arcadeLand','arcadeTiming'].includes(name) ? 'sine' : 'triangle';
    const gain = name === 'arcadeDrop' ? .075 : name === 'arcadeLand' ? .055 : name === 'arcadeTiming' ? .045 : name === 'arcadePayout' ? .095 : .12;
    (notes[name] || [440]).forEach((frequency, index) => this.tone(frequency * shift,
      ['arcadeLand','arcadeTiming'].includes(name) ? .075 : .12 + index * .025,
      wave, gain, this.sfxGain,
      index * (['arcadePayout','arcadeLand','arcadeTiming'].includes(name) ? .045 : .07)));
    if (['attack','skill','hatch','evolve'].includes(name)) this.noise(.07, .035);
    else if (name === 'arcadeDrop') this.noise(.045, .018);
    else if (name === 'arcadeLand') this.noise(.018, .006);
  }
}

export const audio = new AudioEngine();
