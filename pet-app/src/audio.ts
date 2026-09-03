type SoundName = 'tap' | 'buy' | 'coin' | 'hatch' | 'evolve' | 'feed' | 'happy' | 'step' | 'attack' | 'skill' | 'hurt' | 'win' | 'lose' | 'decorate' | 'reaction';

const THEMES: Record<string, { tempo: number; root: number; scale: number[]; pattern: number[] }> = {
  bedroom: { tempo: 92, root: 60, scale: [0,2,4,7,9], pattern: [0,2,4,2,1,3,4,3] },
  shop: { tempo: 116, root: 65, scale: [0,2,4,7,9], pattern: [0,1,2,4,3,2,1,3] },
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

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain(); this.music = this.context.createGain(); this.sfxGain = this.context.createGain();
      this.master.connect(this.context.destination); this.music.connect(this.master); this.sfxGain.connect(this.master);
      this.updateLevels();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.timer) this.startLoop();
  }

  setEnabled(value: boolean) { this.enabled = value; localStorage.setItem('pet-audio-muted', value ? '0' : '1'); this.updateLevels(); }
  setLevels(music: number, sfx: number) { this.musicLevel = music; this.sfxLevel = sfx; localStorage.setItem('pet-music-level', String(music)); localStorage.setItem('pet-sfx-level', String(sfx)); this.updateLevels(); }
  private updateLevels() {
    if (!this.master || !this.music || !this.sfxGain) return;
    this.master.gain.value = this.enabled ? .85 : 0; this.music.gain.value = this.musicLevel; this.sfxGain.gain.value = this.sfxLevel;
  }

  setTheme(theme: string) { this.theme = THEMES[theme] ? theme : 'bedroom'; this.step = 0; }
  private startLoop() {
    const tick = () => {
      if (!this.context) return;
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

  sfx(name: SoundName, voice = 0) {
    if (!this.enabled || !this.context) return;
    const shift = 1 + ((voice % 7) - 3) * .035;
    const notes: Partial<Record<SoundName, number[]>> = {
      tap: [540], buy: [420,620,840], coin: [820,1080], hatch: [280,420,620,920], evolve: [330,440,660,880,1180],
      feed: [380,520], happy: [620,820,980], step: [160], attack: [240,180], skill: [420,680], hurt: [180,130],
      win: [440,554,660,880], lose: [330,260,196], decorate: [360,540], reaction: [620,780,1040],
    };
    (notes[name] || [440]).forEach((frequency, index) => this.tone(frequency * shift, .12 + index * .025, name === 'hurt' || name === 'attack' ? 'sawtooth' : 'triangle', .12, this.sfxGain, index * .07));
    if (['attack','skill','hatch','evolve'].includes(name)) this.noise(.07, .035);
  }
}

export const audio = new AudioEngine();
