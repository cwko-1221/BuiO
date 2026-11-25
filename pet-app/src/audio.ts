type SoundName = 'brawlBlock' | 'brawlHeavy' | 'brawlWarning' | 'tap' | 'buy' | 'coin' | 'arcadeDrop' | 'arcadeLand' | 'arcadeRattle' | 'arcadeTiming' | 'arcadePayout' | 'arcadeKeepsake' | 'arcadeStroke' | 'hatch' | 'evolve' | 'feed' | 'happy' | 'step' | 'attack' | 'skill' | 'hurt' | 'win' | 'lose' | 'decorate' | 'reaction';

import {brawlSound} from '../lib/brawl/sound.mjs';
import {skySound,SKY_CUES} from '../lib/sky-sound.mjs';
import {fishingSound,FISHING_CUES} from '../lib/fishing-sound.mjs';
const THEMES: Record<string, { tempo: number; root: number; scale: number[]; pattern: number[] }> = {
  brawl: { tempo: 118, root: 55, scale: [0,2,3,7,9], pattern: [0,0,3,2,4,3,2,1] },
  bedroom: { tempo: 92, root: 60, scale: [0,2,4,7,9], pattern: [0,2,4,2,1,3,4,3] },
  shop: { tempo: 116, root: 65, scale: [0,2,4,7,9], pattern: [0,1,2,4,3,2,1,3] },
  arcade: { tempo: 128, root: 72, scale: [0,2,4,7,9], pattern: [0,4,2,3,4,2,1,3] },
  flight: { tempo: 124, root: 62, scale: [0,3,5,7,10], pattern: [0,2,4,3,2,1,3,4,0,2,3,4,2,1,0,3] },
  banana: { tempo: 106, root: 65, scale: [0,2,4,7,9], pattern: [0,3,2,1,4,2,3,1] },
  fishing: { tempo: 72, root: 60, scale: [0,2,4,7,9], pattern: [0,2,4,2,1,3,2,1] },
  'fishing-fight': { tempo: 112, root: 57, scale: [0,2,3,7,10], pattern: [0,2,3,1,4,2,3,1] },
};

export class AudioEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private sfxGain?: GainNode;
  private timer = 0;
  private step = 0;
  private theme = 'bedroom';
  private accessLocked = false;
  private musicPaused = false;
  private skyBuffers = new Map<string,AudioBuffer>();
  private skyBus?:DynamicsCompressorNode;
  private skyVoices = new Set<AudioBufferSourceNode>();
  skySoundsPlayed = 0;
  private fishingBuffers=new Map<string,AudioBuffer>();
  private fishingVoices=new Set<AudioBufferSourceNode>();
  fishingSoundsPlayed=0;
  prepareFishingSounds(){const c=this.context;if(!c)return;for(const cue of FISHING_CUES)if(!this.fishingBuffers.has(cue)){const samples=fishingSound(cue,c.sampleRate),buffer=c.createBuffer(1,samples.length,c.sampleRate);buffer.copyToChannel(samples,0);this.fishingBuffers.set(cue,buffer);}}
  fishing(cue:string){const c=this.context,b=this.fishingBuffers.get(cue);if(!c||!b||!this.sfxGain||c.state!=='running'||!this.enabled||this.isDocumentHidden()||this.sfxLevel<=0||this.fishingVoices.size>=8)return;const source=c.createBufferSource();source.buffer=b;source.connect(this.sfxGain);this.fishingVoices.add(source);this.fishingSoundsPlayed++;source.onended=()=>{this.fishingVoices.delete(source);source.disconnect();};source.start();}
  stopFishingSounds(){for(const source of this.fishingVoices){try{source.stop();}catch{}}this.fishingVoices.clear();}
  getTheme() { return this.theme; }
  setMusicPaused(paused:boolean) { this.musicPaused=paused; this.updateLevels(); this.syncMusicLoop(); }
  stopSkySounds() { for(const voice of this.skyVoices) { try { voice.stop(); } catch { /* Already ended. */ } } this.skyVoices.clear(); }
  async prepareSkySounds() {
    const context=this.context;if(!context)return;
    for(const cue of SKY_CUES)if(!this.skyBuffers.has(cue)){
      const samples=skySound(cue,context.sampleRate),buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.copyToChannel(samples,0);this.skyBuffers.set(cue,buffer);
      await new Promise<void>(resolve=>window.setTimeout(resolve,0));
    }
  }
  sky(cue:string,pan=0,level=1) {
    const context=this.context,destination=this.sfxGain;
    if(!context||!destination||context.state!=='running'||!this.enabled||this.isDocumentHidden()||this.sfxLevel<=0||this.skyVoices.size>=18)return;
    let buffer=this.skyBuffers.get(cue);
    if(!buffer){const samples=skySound(cue,context.sampleRate);buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.copyToChannel(samples,0);this.skyBuffers.set(cue,buffer);}
    if(!this.skyBus){this.skyBus=context.createDynamicsCompressor();this.skyBus.threshold.value=-18;this.skyBus.knee.value=12;this.skyBus.ratio.value=8;this.skyBus.attack.value=.003;this.skyBus.release.value=.12;this.skyBus.connect(destination);}
    const source=context.createBufferSource(),gain=context.createGain(),panner=context.createStereoPanner();source.buffer=buffer;
    gain.gain.value=Math.max(0,Math.min(.8,level*.48));panner.pan.value=Math.max(-.7,Math.min(.7,pan));source.connect(gain).connect(panner).connect(this.skyBus);this.skyVoices.add(source);this.skySoundsPlayed++;
    source.onended=()=>{this.skyVoices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  setAccessLocked(locked: boolean) { this.accessLocked = locked; this.updateLevels(); this.syncMusicLoop(); }
  private brawlBuffers=new Map<string,AudioBuffer>();
  private brawlVoices=0;
  brawlSoundsPlayed=0;
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
    return this.accessLocked || (typeof document !== 'undefined' && document.hidden);
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
      && !this.musicPaused
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
      const Context=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
      if(!Context)return;
      this.context = new Context();
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
    this.music.gain.value = this.musicPaused ? 0 : this.musicLevel;
    this.sfxGain.gain.value = this.sfxLevel;
  }

  setTheme(theme: string) { const next=THEMES[theme]?theme:'bedroom';if(next===this.theme)return;this.stopMusicLoop();this.theme=next;this.step=0;this.syncMusicLoop(); }
  brawl(cue:string,pan=0,level=1){
    const context=this.context,destination=this.sfxGain;
    if(!context||!destination||context.state!=='running'||!this.enabled||this.isDocumentHidden()||this.brawlVoices>=24)return;
    let buffer=this.brawlBuffers.get(cue);
    if(!buffer){const samples=brawlSound(cue,context.sampleRate);buffer=context.createBuffer(1,samples.length,context.sampleRate);buffer.copyToChannel(samples as Float32Array<ArrayBuffer>,0);this.brawlBuffers.set(cue,buffer);}
    const source=context.createBufferSource(),gain=context.createGain(),panner=context.createStereoPanner();source.buffer=buffer;
    gain.gain.value=Math.max(0,Math.min(.85,level*.55));panner.pan.value=Math.max(-.7,Math.min(.7,pan));
    source.connect(gain).connect(panner).connect(destination);this.brawlVoices++;this.brawlSoundsPlayed++;
    source.onended=()=>{this.brawlVoices--;source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  private startLoop() {
    if (!this.context || !this.enabled || this.musicPaused || this.musicLevel <= 0 || this.isDocumentHidden()) return;
    const tick = () => {
      this.timer = 0;
      if (!this.context || !this.enabled || this.musicPaused || this.musicLevel <= 0 || this.isDocumentHidden()) return;
      const theme = THEMES[this.theme];
      const duration = 60 / theme.tempo / 2;
      const index = theme.pattern[this.step % theme.pattern.length];
      const midi = theme.root + theme.scale[index % theme.scale.length] + (this.step % 16 > 11 ? 12 : 0);
      this.tone(440 * Math.pow(2, (midi - 69) / 12), duration * .82, 'triangle', .08, this.music);
      if (this.step % 4 === 0) this.tone(440 * Math.pow(2, (theme.root - 24 - 69) / 12), duration * 1.8, 'sine', .06, this.music);
      if (this.step % 2 === 0 && !this.theme.startsWith('fishing')) this.noise(.025, .025, this.music);
      if(this.theme.startsWith('fishing')&&this.step%8===0){
        for(const offset of [0,4,7])this.tone(440*Math.pow(2,(theme.root+offset-12-69)/12),duration*6,'sine',.018,this.music);
      }
      if(this.theme==='brawl'){
        if(this.step%4===0)this.tone(62,.15,'sine',.22,this.music);
        if(this.step%4===2)this.noise(.09,.075,this.music);
        this.noise(.018,.026,this.music);
        if(this.step%8===0)for(const offset of [0,3,7])this.tone(440*Math.pow(2,(theme.root+offset-69)/12),duration*5,'triangle',.035,this.music);
      }
      if(this.theme==='fishing-fight'&&this.step%2===0)this.tone(this.step%4?85:62,.13,'sine',.055,this.music);
      if(this.theme==='flight'){
        if(this.step%4===0)for(const offset of [0,3,7])this.tone(440*Math.pow(2,(theme.root+offset-69)/12),duration*3.5,'sine',.024,this.music);
        if(this.step%2===0)this.tone(78,duration*.85,'sine',.045,this.music);
        if(this.step%4===2)this.noise(.055,.026,this.music);
      }
      this.step += 1;
      this.timer = window.setTimeout(tick, duration * 1000);
    };
    tick();
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    destination = this.sfxGain,
    delay = 0,
    pan = 0,
  ) {
    if (!this.context || !destination) return;
    const oscillator = this.context.createOscillator(); const envelope = this.context.createGain();
    const start = this.context.currentTime + delay; oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(.0001, start); envelope.gain.exponentialRampToValueAtTime(Math.max(.001, gain), start + .015); envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope);
    const stereoPan = Number.isFinite(pan) ? Math.max(-.72, Math.min(.72, pan)) : 0;
    if (stereoPan && typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      panner.pan.setValueAtTime(stereoPan, start);
      envelope.connect(panner).connect(destination);
    } else envelope.connect(destination);
    oscillator.start(start); oscillator.stop(start + duration + .03);
  }
  private noise(duration: number, gain: number, destination = this.sfxGain, pan = 0) {
    if (!this.context || !destination) return;
    const length = Math.max(1, Math.floor(this.context.sampleRate * duration)); const buffer = this.context.createBuffer(1, length, this.context.sampleRate); const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) channel[index] = Math.random() * 2 - 1;
    const source = this.context.createBufferSource(); const envelope = this.context.createGain(); source.buffer = buffer; envelope.gain.setValueAtTime(gain, this.context.currentTime); envelope.gain.exponentialRampToValueAtTime(.0001, this.context.currentTime + duration); source.connect(envelope);
    const stereoPan = Number.isFinite(pan) ? Math.max(-.72, Math.min(.72, pan)) : 0;
    if (stereoPan && typeof this.context.createStereoPanner === 'function') {
      const panner = this.context.createStereoPanner();
      panner.pan.setValueAtTime(stereoPan, this.context.currentTime);
      envelope.connect(panner).connect(destination);
    } else envelope.connect(destination);
    source.start();
  }

  private pusherStroke(direction: 'forward' | 'return', voice: number, strokeDurationSeconds: number) {
    if (!this.context || !this.sfxGain) return;
    const start = this.context.currentTime;
    // Follow most of the model's smooth travel, then fade before its end pause. This keeps the
    // motor cue attached to the moving plate without overlapping the opposite stroke.
    const physicalDuration = Number.isFinite(strokeDurationSeconds)
      ? Math.max(.3, Math.min(5, strokeDurationSeconds))
      : 1.95;
    const duration = physicalDuration * .84;
    const attack = Math.min(.06, duration * .05);
    const pitch = 1 + ((voice % 5) - 2) * .018;
    const base = direction === 'forward' ? 86 : 101;
    const lowpass = this.context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(direction === 'forward' ? 440 : 500, start);
    lowpass.frequency.exponentialRampToValueAtTime(185, start + duration);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(.006, start + attack);
    envelope.gain.exponentialRampToValueAtTime(.0055, start + duration * .76);
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

  sfx(name: SoundName, voice = 0, pan = 0, strokeDurationSeconds = 1.95) {
    if (!this.enabled || !this.context || this.context.state !== 'running' || this.isDocumentHidden()) return;
    if (name === 'arcadeStroke') {
      this.pusherStroke(voice < 3 ? 'forward' : 'return', voice, strokeDurationSeconds);
      return;
    }
    const timingRise = Number.isFinite(voice) ? Math.min(7, Math.max(0, Math.floor(voice) - 1)) : 0;
    const shift = name === 'arcadeTiming'
      ? 1 + timingRise * .018
      : 1 + ((voice % 7) - 3) * .035;
    const notes: Partial<Record<SoundName, number[]>> = {
      brawlBlock:[350,720],brawlHeavy:[145,100,65],brawlWarning:[660,880,660],
      tap: [540], buy: [420,620,840], coin: [820,1080], arcadeDrop: [220,440,660], arcadeLand: [880,1320], arcadeRattle: [659,988], arcadeTiming: [1175,1568], arcadePayout: [659,784,988,1318], arcadeKeepsake: [784,988,1175,1568], hatch: [280,420,620,920], evolve: [330,440,660,880,1180],
      feed: [380,520], happy: [620,820,980], step: [160], attack: [240,180], skill: [420,680], hurt: [180,130],
      win: [440,554,660,880], lose: [330,260,196], decorate: [360,540], reaction: [620,780,1040],
    };
    const wave: OscillatorType = ['hurt','attack','arcadeDrop'].includes(name) ? 'sawtooth' : ['arcadeLand','arcadeRattle','arcadeTiming','arcadeKeepsake'].includes(name) ? 'sine' : 'triangle';
    const gain = name === 'arcadeDrop' ? .075 : name === 'arcadeLand' ? .055 : name === 'arcadeRattle' ? .032 : name === 'arcadeTiming' ? .045 : name === 'arcadeKeepsake' ? .07 : name === 'arcadePayout' ? .095 : .12;
    (notes[name] || [440]).forEach((frequency, index) => this.tone(frequency * shift,
      ['arcadeLand','arcadeRattle','arcadeTiming'].includes(name) ? .075 : name === 'arcadeKeepsake' ? .14 : .12 + index * .025,
      wave, gain, this.sfxGain,
      index * (name === 'arcadeKeepsake' ? .055 : ['arcadePayout','arcadeLand','arcadeRattle','arcadeTiming'].includes(name) ? .045 : .07), pan));
    if (['attack','skill','hatch','evolve'].includes(name)) this.noise(.07, .035);
    else if (name === 'arcadeDrop') this.noise(.045, .018);
    else if (name === 'arcadeLand') this.noise(.018, .006, this.sfxGain, pan);
    else if (name === 'arcadeRattle') this.noise(.025, .007, this.sfxGain, pan);
    else if (name === 'arcadeKeepsake') this.noise(.06, .009);
  }
}

export const audio = new AudioEngine();
