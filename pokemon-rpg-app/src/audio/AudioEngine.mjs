// Polyphonic WebAudio Music Sequencer & Custom Foley/Elemental SFX Synthesizer
// Produces 6 multi-voice original RPG soundtracks + 28 distinct battle/overworld sound effects.

const NOTE_FREQ = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const TRACKS = {
  title: {
    bpm: 108,
    wave: 'triangle',
    padWave: 'sine',
    melody: [
      72, 76, 79, 84, 83, 79, 76, 79,
      77, 81, 84, 88, 86, 83, 79, 74,
      72, 76, 79, 84, 86, 88, 84, 79,
      77, 79, 81, 79, 76, 74, 72, 0,
    ],
    bass: [
      48, 55, 60, 55, 47, 55, 59, 55,
      45, 53, 57, 53, 43, 50, 55, 50,
      48, 55, 60, 55, 52, 55, 60, 55,
      53, 57, 55, 50, 48, 55, 48, 48,
    ],
    drums: false,
  },
  town: {
    bpm: 102,
    wave: 'sine',
    padWave: 'triangle',
    melody: [
      76, 79, 81, 79, 76, 72, 74, 0,
      74, 77, 79, 77, 76, 79, 76, 0,
      81, 84, 83, 79, 76, 79, 74, 76,
      72, 74, 76, 74, 72, 0, 72, 0,
    ],
    bass: [
      48, 60, 55, 60, 50, 57, 53, 57,
      43, 55, 50, 55, 48, 55, 60, 55,
      53, 60, 55, 59, 45, 52, 50, 53,
      48, 55, 50, 55, 48, 55, 48, 0,
    ],
    drums: false,
  },
  field: {
    bpm: 124,
    wave: 'square',
    leadGain: 0.11,
    padWave: 'triangle',
    melody: [
      74, 74, 78, 81, 83, 81, 78, 74,
      76, 79, 83, 86, 85, 83, 81, 0,
      74, 78, 81, 86, 88, 86, 83, 79,
      81, 78, 76, 74, 76, 78, 74, 0,
    ],
    bass: [
      50, 57, 50, 57, 50, 57, 50, 57,
      52, 59, 52, 59, 45, 52, 45, 52,
      50, 57, 54, 62, 55, 62, 55, 62,
      57, 54, 52, 50, 45, 52, 50, 50,
    ],
    drums: true,
  },
  twilight: {
    bpm: 94,
    wave: 'sine',
    padWave: 'triangle',
    melody: [
      76, 79, 83, 86, 84, 83, 79, 76,
      75, 78, 83, 87, 86, 83, 78, 0,
      76, 83, 88, 86, 84, 81, 79, 76,
      78, 76, 75, 71, 76, 0, 76, 0,
    ],
    bass: [
      40, 47, 52, 55, 45, 52, 57, 52,
      47, 54, 59, 54, 40, 47, 52, 47,
      40, 47, 52, 55, 48, 55, 60, 55,
      47, 54, 47, 47, 40, 47, 40, 0,
    ],
    drums: false,
  },
  wild_battle: {
    bpm: 148,
    wave: 'sawtooth',
    leadGain: 0.095,
    padWave: 'square',
    melody: [
      76, 77, 79, 81, 79, 76, 72, 76,
      74, 76, 77, 79, 77, 74, 71, 74,
      76, 79, 84, 83, 81, 79, 77, 76,
      74, 77, 81, 79, 76, 74, 76, 0,
    ],
    bass: [
      45, 57, 45, 57, 45, 57, 48, 55,
      43, 55, 43, 55, 43, 55, 47, 50,
      45, 57, 48, 60, 53, 60, 50, 57,
      43, 55, 47, 59, 45, 52, 45, 45,
    ],
    drums: true,
  },
  boss_battle: {
    bpm: 160,
    wave: 'sawtooth',
    leadGain: 0.105,
    padWave: 'square',
    melody: [
      74, 77, 81, 86, 85, 81, 77, 81,
      82, 86, 89, 88, 86, 82, 79, 76,
      74, 81, 86, 89, 93, 89, 86, 81,
      82, 81, 79, 77, 76, 79, 74, 74,
    ],
    bass: [
      38, 50, 38, 50, 37, 49, 37, 49,
      46, 58, 46, 58, 45, 57, 38, 45,
      38, 50, 41, 53, 43, 55, 45, 57,
      46, 53, 45, 52, 38, 45, 38, 38,
    ],
    drums: true,
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.muted = localStorage.getItem('buio_pokerpg_muted') === '1';
    this.musicVolume = Number(localStorage.getItem('buio_pokerpg_bgm') ?? 0.34);
    this.sfxVolume = Number(localStorage.getItem('buio_pokerpg_sfx') ?? 0.56);
    this.currentTrack = null;
    this.stepIndex = 0;
    this.timerId = null;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.pauseLoop();
        else if (this.currentTrack && !this.muted) this.startLoop();
      });
    }
  }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      comp.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();

      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(comp);
      this.syncGains();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.currentTrack && !this.timerId && !this.muted) {
      this.startLoop();
    }
  }

  syncGains() {
    if (!this.master || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, now, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicVolume, now, 0.04);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, now, 0.02);
  }

  setMuted(flag) {
    this.muted = Boolean(flag);
    localStorage.setItem('buio_pokerpg_muted', this.muted ? '1' : '0');
    this.syncGains();
    if (this.muted) this.pauseLoop();
    else if (this.currentTrack) this.startLoop();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMusicTrack(trackName) {
    if (!TRACKS[trackName]) return;
    if (this.currentTrack === trackName && this.timerId) return;
    this.currentTrack = trackName;
    this.stepIndex = 0;
    this.pauseLoop();
    if (!this.muted && this.ctx) {
      this.startLoop();
    }
  }

  pauseLoop() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  startLoop() {
    this.pauseLoop();
    const track = TRACKS[this.currentTrack];
    if (!track || !this.ctx || this.muted) return;
    const stepMs = (60 / track.bpm / 2) * 1000;
    this.timerId = setInterval(() => this.tickMusic(track), stepMs);
  }

  tickMusic(track) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || (typeof document !== 'undefined' && document.hidden)) {
      return;
    }
    const now = this.ctx.currentTime;
    const stepLen = 60 / track.bpm / 2;
    const idx = this.stepIndex % track.melody.length;
    const melNote = track.melody[idx];
    const bassNote = track.bass[idx % track.bass.length];

    if (melNote > 0) {
      this.tone({
        freq: NOTE_FREQ(melNote),
        type: track.wave,
        dur: stepLen * 0.88,
        gain: track.leadGain || 0.14,
        bus: this.musicBus,
        filterFreq: track.wave === 'sawtooth' ? 2300 : 3400,
      });
      // Soft fifth/third harmony every 4th beat
      if (idx % 4 === 0) {
        this.tone({
          freq: NOTE_FREQ(melNote - 5),
          type: 'sine',
          dur: stepLen * 1.6,
          gain: 0.06,
          bus: this.musicBus,
        });
      }
    }

    if (bassNote > 0) {
      this.tone({
        freq: NOTE_FREQ(bassNote),
        type: track.padWave || 'triangle',
        dur: stepLen * 0.92,
        gain: 0.15,
        bus: this.musicBus,
        filterFreq: 900,
      });
    }

    if (track.drums) {
      if (idx % 4 === 0) {
        this.kick(now, 0.16, this.musicBus);
      } else if (idx % 4 === 2) {
        this.noiseHit(now, 0.07, 0.06, 1800, this.musicBus);
      } else if (idx % 2 === 1) {
        this.noiseHit(now, 0.03, 0.025, 5200, this.musicBus);
      }
    }

    this.stepIndex += 1;
  }

  tone({ freq, freqEnd = null, type = 'sine', start = 0, dur = 0.15, gain = 0.2, bus = null, filterFreq = 4500 }) {
    if (!this.ctx || this.muted) return;
    const targetBus = bus || this.sfxBus;
    if (!targetBus) return;
    const t0 = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), t0 + dur);
    }

    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(filterFreq, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.015, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filt);
    filt.connect(g);
    g.connect(targetBus);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  kick(t0, gainVal = 0.25, bus = null) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.11);
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + 0.13);
  }

  noiseHit(t0, dur = 0.1, gainVal = 0.15, bandFreq = 1600, bus = null) {
    if (!this.ctx || this.muted) return;
    const len = Math.max(256, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = bandFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainVal, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || this.sfxBus);
    src.start(t0);
  }

  playSfx(name) {
    this.unlock();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'ui_click':
        this.tone({ freq: 680, freqEnd: 880, type: 'sine', dur: 0.055, gain: 0.16 });
        break;
      case 'ui_confirm':
        this.tone({ freq: 587, type: 'triangle', dur: 0.07, gain: 0.2 });
        this.tone({ freq: 880, type: 'triangle', start: 0.06, dur: 0.11, gain: 0.22 });
        break;
      case 'ui_cancel':
        this.tone({ freq: 480, freqEnd: 310, type: 'triangle', dur: 0.09, gain: 0.18 });
        break;
      case 'dialogue_blip':
        this.tone({ freq: 520 + Math.random() * 90, type: 'sine', dur: 0.035, gain: 0.09 });
        break;
      case 'step_grass':
        this.noiseHit(now, 0.065, 0.08, 2800);
        break;
      case 'step_stone':
        this.tone({ freq: 180, freqEnd: 95, type: 'triangle', dur: 0.04, gain: 0.07 });
        break;
      case 'encounter_alert':
        [0, 0.07, 0.14, 0.21, 0.28].forEach((t, i) => {
          this.tone({ freq: 520 + i * 135, type: 'sawtooth', start: t, dur: 0.08, gain: 0.24 });
        });
        break;
      case 'ball_throw':
        this.tone({ freq: 340, freqEnd: 980, type: 'sine', dur: 0.24, gain: 0.22 });
        break;
      case 'ball_open':
        this.tone({ freq: 920, freqEnd: 420, type: 'triangle', dur: 0.18, gain: 0.22 });
        this.noiseHit(now + 0.03, 0.14, 0.14, 3200);
        break;
      case 'ball_shake':
        this.tone({ freq: 310, freqEnd: 440, type: 'sine', dur: 0.09, gain: 0.2 });
        break;
      case 'catch_break':
        this.noiseHit(now, 0.22, 0.24, 1400);
        this.tone({ freq: 420, freqEnd: 170, type: 'sawtooth', dur: 0.22, gain: 0.22 });
        break;
      case 'catch_success':
        [72, 76, 79, 84].forEach((m, i) => {
          this.tone({
            freq: NOTE_FREQ(m),
            type: 'triangle',
            start: i === 3 ? 0.34 : i * 0.1,
            dur: i === 3 ? 0.45 : 0.1,
            gain: 0.28,
          });
        });
        break;
      case 'hit_normal':
        this.kick(now, 0.32);
        this.noiseHit(now, 0.1, 0.2, 1300);
        break;
      case 'hit_super':
        this.kick(now, 0.42);
        this.noiseHit(now, 0.18, 0.3, 1800);
        this.tone({ freq: 620, freqEnd: 190, type: 'sawtooth', dur: 0.22, gain: 0.28 });
        break;
      case 'hit_weak':
        this.tone({ freq: 240, freqEnd: 150, type: 'triangle', dur: 0.11, gain: 0.18 });
        break;
      case 'hit_crit':
        this.kick(now, 0.48);
        this.noiseHit(now, 0.25, 0.35, 2200);
        this.tone({ freq: 880, freqEnd: 220, type: 'sawtooth', dur: 0.28, gain: 0.32 });
        this.tone({ freq: 1174, type: 'triangle', start: 0.05, dur: 0.18, gain: 0.22 });
        break;
      case 'mon_cry':
        this.tone({ freq: 650, freqEnd: 880, type: 'sine', dur: 0.12, gain: 0.22 });
        this.tone({ freq: 880, freqEnd: 1100, type: 'triangle', start: 0.08, dur: 0.16, gain: 0.20 });
        break;
      case 'fx_fire':
        this.noiseHit(now, 0.38, 0.28, 950);
        this.tone({ freq: 280, freqEnd: 560, type: 'sawtooth', dur: 0.32, gain: 0.2, filterFreq: 1600 });
        break;
      case 'fx_water':
        this.noiseHit(now, 0.32, 0.24, 2400);
        this.tone({ freq: 520, freqEnd: 320, type: 'sine', dur: 0.28, gain: 0.22 });
        break;
      case 'fx_grass':
        [0, 0.06, 0.12].forEach((t, i) => {
          this.noiseHit(now + t, 0.08, 0.16, 3600);
          this.tone({ freq: 640 + i * 110, type: 'triangle', start: t, dur: 0.09, gain: 0.18 });
        });
        break;
      case 'fx_electric':
        [0, 0.05, 0.1, 0.16].forEach((t, i) => {
          this.tone({ freq: i % 2 === 0 ? 1180 : 760, freqEnd: 380, type: 'sawtooth', start: t, dur: 0.07, gain: 0.24 });
        });
        this.noiseHit(now + 0.05, 0.22, 0.22, 4200);
        break;
      case 'fx_ice':
        [88, 91, 95].forEach((m, i) => {
          this.tone({ freq: NOTE_FREQ(m), type: 'sine', start: i * 0.07, dur: 0.18, gain: 0.22 });
        });
        break;
      case 'fx_psychic':
      case 'fx_ghost':
        this.tone({ freq: 440, freqEnd: 880, type: 'sine', dur: 0.22, gain: 0.22 });
        this.tone({ freq: 880, freqEnd: 520, type: 'triangle', start: 0.16, dur: 0.24, gain: 0.2 });
        break;
      case 'fx_dragon':
      case 'fx_fighting':
        this.kick(now, 0.38);
        this.tone({ freq: 220, freqEnd: 95, type: 'sawtooth', dur: 0.34, gain: 0.26, filterFreq: 1400 });
        break;
      case 'heal_potion':
        [67, 71, 74, 79].forEach((m, i) => {
          this.tone({ freq: NOTE_FREQ(m), type: 'sine', start: i * 0.07, dur: 0.16, gain: 0.22 });
        });
        break;
      case 'hospital_jingle':
        // Classic 5-note warm hospital recovery melody: B4 - B4 - B4 - G#4 - E5!
        [
          { m: 71, t: 0, d: 0.16 },
          { m: 71, t: 0.18, d: 0.16 },
          { m: 71, t: 0.36, d: 0.16 },
          { m: 68, t: 0.54, d: 0.18 },
          { m: 76, t: 0.74, d: 0.48 },
        ].forEach((n) => {
          this.tone({ freq: NOTE_FREQ(n.m), type: 'triangle', start: n.t, dur: n.d, gain: 0.28 });
          this.tone({ freq: NOTE_FREQ(n.m - 12), type: 'sine', start: n.t, dur: n.d, gain: 0.14 });
        });
        break;
      case 'buy_coin':
        this.tone({ freq: 988, type: 'sine', dur: 0.07, gain: 0.22 });
        this.tone({ freq: 1319, type: 'sine', start: 0.065, dur: 0.2, gain: 0.24 });
        break;
      case 'level_up':
        [60, 64, 67, 72, 76, 79].forEach((m, i) => {
          this.tone({ freq: NOTE_FREQ(m), type: 'triangle', start: i * 0.065, dur: 0.16, gain: 0.24 });
        });
        break;
      case 'evolve_fanfare':
        [60, 65, 69, 72, 77, 81, 84].forEach((m, i) => {
          this.tone({ freq: NOTE_FREQ(m), type: 'triangle', start: i * 0.09, dur: i === 6 ? 0.55 : 0.14, gain: 0.26 });
        });
        break;
      case 'victory_fanfare':
        [72, 72, 72, 72, 68, 70, 72, 70, 72].forEach((m, i) => {
          const times = [0, 0.11, 0.22, 0.33, 0.48, 0.64, 0.8, 0.94, 1.08];
          const durs = [0.09, 0.09, 0.09, 0.13, 0.14, 0.14, 0.12, 0.12, 0.52];
          this.tone({ freq: NOTE_FREQ(m), type: 'triangle', start: times[i], dur: durs[i], gain: 0.25 });
        });
        break;
      case 'faint':
        this.tone({ freq: 380, freqEnd: 110, type: 'sawtooth', dur: 0.42, gain: 0.22, filterFreq: 1200 });
        break;
      default:
        this.tone({ freq: 600, type: 'sine', dur: 0.06, gain: 0.15 });
    }
  }
}
