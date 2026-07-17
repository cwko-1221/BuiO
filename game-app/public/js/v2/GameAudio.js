const NOTE = 440;
const semitone = value => NOTE * 2 ** (value / 12);

export class GameAudio {
  constructor() {
    this.context=null;
    this.master=null;
    this.music=null;
    this.effects=null;
    this.musicTimer=null;
    this.musicStep=0;
    this.nextMusicTime=0;
    this.stepVariant=false;
    try { this.muted=localStorage.getItem('dld-muted')==='1'; }
    catch { this.muted=false; }
  }

  async unlock() {
    if (!this.context) this.createGraph();
    if (!this.context) return false;
    if (this.context.state==='suspended') await this.context.resume();
    if (!this.musicTimer&&!this.muted) this.startMusic();
    return this.context.state==='running';
  }

  createGraph() {
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if (!AudioContext) return;
    this.context=new AudioContext();
    this.master=this.context.createGain();
    this.music=this.context.createGain();
    this.effects=this.context.createGain();
    this.master.gain.value=this.muted?0:.78;
    this.music.gain.value=.24;
    this.effects.gain.value=.66;
    this.music.connect(this.master);
    this.effects.connect(this.master);
    this.master.connect(this.context.destination);
  }

  setMuted(value) {
    this.muted=Boolean(value);
    try { localStorage.setItem('dld-muted',this.muted?'1':'0'); }
    catch { /* Storage can be disabled in embedded/private browser modes. */ }
    if (this.master&&this.context) {
      try {
        this.master.gain.cancelScheduledValues(this.context.currentTime);
        this.master.gain.setTargetAtTime(this.muted?0:.78,this.context.currentTime,.025);
      } catch { /* Keep the HUD responsive if an audio backend is unavailable. */ }
    }
    if (!this.muted) this.unlock();
    return this.muted;
  }

  toggleMuted() { return this.setMuted(!this.muted); }

  startMusic() {
    if (!this.context||this.musicTimer) return;
    this.musicStep=0;
    this.nextMusicTime=this.context.currentTime+.06;
    this.musicTimer=setInterval(()=>this.scheduleMusic(),90);
    this.scheduleMusic();
  }

  scheduleMusic() {
    if (!this.context||this.context.state!=='running'||this.muted) return;
    const sixteenth=60/112/2;
    const melody=[0,4,7,11,7,4,2,7,0,4,9,7,4,2,-1,2];
    const bass=[-24,-24,-19,-19,-21,-21,-17,-17];
    while (this.nextMusicTime<this.context.currentTime+.7) {
      const step=this.musicStep++;
      const at=this.nextMusicTime;
      const pitch=melody[step%melody.length];
      if (step%2===0) this.tone(semitone(pitch),at,sixteenth*1.45,.055,'triangle',this.music);
      if (step%4===0) this.tone(semitone(bass[(step/4)%bass.length|0]),at,sixteenth*3.5,.065,'sine',this.music);
      if (step%8===0) {
        for (const chord of [pitch-12,pitch-5,pitch]) this.tone(semitone(chord),at,sixteenth*7,.014,'sine',this.music);
      }
      this.nextMusicTime+=sixteenth;
    }
  }

  tone(frequency,at,duration,volume,type='sine',destination=this.effects,endFrequency=null) {
    if (!this.context||!destination) return;
    const oscillator=this.context.createOscillator();
    const gain=this.context.createGain();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(Math.max(30,frequency),at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,endFrequency),at+duration);
    gain.gain.setValueAtTime(.0001,at);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),at+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain); gain.connect(destination);
    oscillator.start(at); oscillator.stop(at+duration+.025);
  }

  noise(at,duration,volume,highpass=180) {
    if (!this.context) return;
    const length=Math.max(1,Math.floor(this.context.sampleRate*duration));
    const buffer=this.context.createBuffer(1,length,this.context.sampleRate);
    const data=buffer.getChannelData(0);
    for (let i=0;i<length;i++) data[i]=(Math.random()*2-1)*(1-i/length);
    const source=this.context.createBufferSource();
    const filter=this.context.createBiquadFilter();
    const gain=this.context.createGain();
    source.buffer=buffer; filter.type='highpass'; filter.frequency.value=highpass;
    gain.gain.setValueAtTime(volume,at); gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.effects);
    source.start(at); source.stop(at+duration+.01);
  }

  play(name) {
    if (this.muted) return;
    if (!this.context||this.context.state!=='running') { this.unlock(); return; }
    const now=this.context.currentTime;
    switch (name) {
      case 'step': {
        this.stepVariant=!this.stepVariant;
        this.noise(now,.045,.045,420);
        this.tone(this.stepVariant?105:120,now,.055,.045,'sine');
        break;
      }
      case 'jump':
        this.tone(360,now,.13,.11,'triangle',this.effects,660); break;
      case 'doubleJump':
        this.tone(520,now,.16,.12,'square',this.effects,930);
        this.tone(760,now+.045,.12,.055,'triangle',this.effects,1120); break;
      case 'land':
        this.noise(now,.09,.085,95); this.tone(92,now,.1,.09,'sine',this.effects,58); break;
      case 'bounce':
        this.tone(250,now,.2,.12,'sine',this.effects,820); break;
      case 'checkpoint':
        [0,4,7,12].forEach((note,index)=>this.tone(semitone(note),now+index*.075,.22,.09,'triangle')); break;
      case 'correct':
        [0,7,12].forEach((note,index)=>this.tone(semitone(note+4),now+index*.07,.18,.08,'triangle')); break;
      case 'wrong':
        this.tone(260,now,.18,.09,'sawtooth',this.effects,180); break;
      case 'finish':
        [0,4,7,12,16].forEach((note,index)=>this.tone(semitone(note),now+index*.1,.36,.1,'triangle')); break;
      case 'rapidFall':
      case 'manual':
      case 'respawn':
      case 'laser':
        this.tone(440,now,.25,.1,'sine',this.effects,125);
        this.noise(now+.08,.16,.05,250); break;
      default: break;
    }
  }
}
