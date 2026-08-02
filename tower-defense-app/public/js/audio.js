export class CrystalAudio {
  constructor() {
    this.context=null;
    this.master=null;
    this.musicGain=null;
    this.sfxGain=null;
    this.muted=localStorage.getItem('buio-td-muted')==='1';
    this.musicTimer=null;
    this.musicStep=0;
  }

  async unlock() {
    if (!this.context) {
      const AudioContext=window.AudioContext||window.webkitAudioContext;
      if (!AudioContext) return;
      this.context=new AudioContext();
      this.master=this.context.createGain();
      this.musicGain=this.context.createGain();
      this.sfxGain=this.context.createGain();
      this.musicGain.gain.value=.16;
      this.sfxGain.gain.value=.38;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.context.destination);
      this.refreshMute();
    }
    if (this.context.state==='suspended') await this.context.resume();
  }

  refreshMute() {
    if (!this.master||!this.context) return;
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(this.muted?0:1,this.context.currentTime,.02);
  }

  toggle() {
    this.muted=!this.muted;
    localStorage.setItem('buio-td-muted',this.muted?'1':'0');
    this.refreshMute();
    return this.muted;
  }

  tone({ frequency=440,endFrequency=frequency,duration=.12,type='sine',gain=.18,when=0,pan=0 }={}) {
    if (!this.context||this.muted) return;
    const start=this.context.currentTime+when;
    const oscillator=this.context.createOscillator();
    const envelope=this.context.createGain();
    const panner=this.context.createStereoPanner?.();
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(Math.max(30,frequency),start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30,endFrequency),start+duration);
    envelope.gain.setValueAtTime(.0001,start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),start+.012);
    envelope.gain.exponentialRampToValueAtTime(.0001,start+duration);
    oscillator.connect(envelope);
    if (panner) {
      panner.pan.value=Math.max(-1,Math.min(1,pan));
      envelope.connect(panner);panner.connect(this.sfxGain);
    } else envelope.connect(this.sfxGain);
    oscillator.start(start);oscillator.stop(start+duration+.02);
  }

  noise({ duration=.16,gain=.12,highpass=400,when=0 }={}) {
    if (!this.context||this.muted) return;
    const frames=Math.max(1,Math.floor(this.context.sampleRate*duration));
    const buffer=this.context.createBuffer(1,frames,this.context.sampleRate);
    const data=buffer.getChannelData(0);
    for (let index=0;index<frames;index++) data[index]=(Math.random()*2-1)*(1-index/frames);
    const source=this.context.createBufferSource();
    const filter=this.context.createBiquadFilter();
    const envelope=this.context.createGain();
    filter.type='highpass';filter.frequency.value=highpass;
    envelope.gain.value=gain;
    source.buffer=buffer;source.connect(filter);filter.connect(envelope);envelope.connect(this.sfxGain);
    const start=this.context.currentTime+when;source.start(start);source.stop(start+duration);
  }

  sfx(name) {
    const sounds={
      ui:()=>this.tone({frequency:520,endFrequency:650,duration:.07,type:'sine',gain:.07}),
      build:()=>{this.tone({frequency:180,endFrequency:520,duration:.18,type:'triangle',gain:.16});this.tone({frequency:640,endFrequency:920,duration:.12,when:.08,gain:.09});},
      upgrade:()=>[0,.08,.16].forEach((when,index)=>this.tone({frequency:[420,560,760][index],duration:.2,when,type:'triangle',gain:.11})),
      sell:()=>this.tone({frequency:680,endFrequency:260,duration:.24,type:'triangle',gain:.12}),
      bolt:()=>this.tone({frequency:760,endFrequency:1180,duration:.07,type:'square',gain:.06}),
      cannon:()=>{this.tone({frequency:110,endFrequency:46,duration:.28,type:'sawtooth',gain:.22});this.noise({duration:.18,gain:.15,highpass:120});},
      rocket:()=>{this.tone({frequency:190,endFrequency:58,duration:.32,type:'sawtooth',gain:.16});this.noise({duration:.24,gain:.12,highpass:180});},
      flame:()=>{this.noise({duration:.16,gain:.075,highpass:420});this.tone({frequency:145,endFrequency:82,duration:.16,type:'sawtooth',gain:.045});},
      frost:()=>{this.tone({frequency:980,endFrequency:540,duration:.2,type:'sine',gain:.08});this.noise({duration:.12,gain:.035,highpass:2600});},
      chain:()=>{this.tone({frequency:140,endFrequency:920,duration:.12,type:'sawtooth',gain:.09});this.noise({duration:.08,gain:.05,highpass:1900});},
      beam:()=>this.tone({frequency:440,endFrequency:660,duration:.10,type:'sine',gain:.04}),
      pulse:()=>this.tone({frequency:210,endFrequency:340,duration:.22,type:'sine',gain:.10}),
      kill:()=>this.tone({frequency:250,endFrequency:90,duration:.13,type:'triangle',gain:.07}),
      leak:()=>{this.tone({frequency:210,endFrequency:90,duration:.45,type:'sawtooth',gain:.16});this.tone({frequency:160,endFrequency:80,duration:.45,when:.08,gain:.11});},
      wave:()=>[0,.1,.2,.34].forEach((when,index)=>this.tone({frequency:[330,440,550,820][index],duration:.22,when,type:'triangle',gain:.13})),
      waveClear:()=>[0,.08,.16].forEach((when,index)=>this.tone({frequency:[520,660,880][index],duration:.28,when,gain:.12})),
      correct:()=>[0,.08,.16,.24].forEach((when,index)=>this.tone({frequency:[520,660,780,1040][index],duration:.2,when,type:'triangle',gain:.12})),
      wrong:()=>{this.tone({frequency:260,endFrequency:170,duration:.28,type:'square',gain:.09});this.tone({frequency:210,endFrequency:145,duration:.3,when:.08,type:'square',gain:.07});},
      meteor:()=>{this.tone({frequency:740,endFrequency:48,duration:.7,type:'sawtooth',gain:.20});this.noise({duration:.5,gain:.2,highpass:90,when:.3});},
      stasis:()=>{this.tone({frequency:880,endFrequency:220,duration:.65,type:'sine',gain:.13});this.tone({frequency:1320,endFrequency:330,duration:.7,when:.04,gain:.07});},
      overdrive:()=>[0,.06,.12,.18].forEach((when,index)=>this.tone({frequency:260+index*180,endFrequency:620+index*190,duration:.3,when,type:'sawtooth',gain:.08})),
      boss:()=>{this.tone({frequency:72,endFrequency:46,duration:.8,type:'sawtooth',gain:.2});this.noise({duration:.5,gain:.1,highpass:60});},
      win:()=>[0,.12,.24,.36,.58].forEach((when,index)=>this.tone({frequency:[392,523,659,784,1047][index],duration:.5,when,type:'triangle',gain:.15})),
      lose:()=>[0,.18,.36].forEach((when,index)=>this.tone({frequency:[330,247,165][index],endFrequency:[285,210,110][index],duration:.55,when,type:'sawtooth',gain:.12})),
    };
    sounds[name]?.();
  }

  startMusic(theme='stars') {
    this.stopMusic();
    if (!this.context) return;
    const scales={ stars:[196,247,294,370,440,294,247,330],fireflies:[174,220,261,330,392,330,261,220],embers:[146,174,220,261,293,261,220,174] };
    const scale=scales[theme]||scales.stars;
    this.musicStep=0;
    const tick=()=>{
      if (!this.context||this.muted) return;
      const note=scale[this.musicStep++%scale.length];
      const start=this.context.currentTime;
      const oscillator=this.context.createOscillator();
      const envelope=this.context.createGain();
      oscillator.type='triangle';oscillator.frequency.value=note;
      envelope.gain.setValueAtTime(.0001,start);
      envelope.gain.exponentialRampToValueAtTime(.07,start+.08);
      envelope.gain.exponentialRampToValueAtTime(.0001,start+.85);
      oscillator.connect(envelope);envelope.connect(this.musicGain);
      oscillator.start(start);oscillator.stop(start+.9);
      if (this.musicStep%4===1) {
        const bass=this.context.createOscillator(),bassGain=this.context.createGain();
        bass.type='sine';bass.frequency.value=note/2;
        bassGain.gain.setValueAtTime(.0001,start);bassGain.gain.exponentialRampToValueAtTime(.055,start+.05);bassGain.gain.exponentialRampToValueAtTime(.0001,start+.7);
        bass.connect(bassGain);bassGain.connect(this.musicGain);bass.start(start);bass.stop(start+.75);
      }
    };
    tick();this.musicTimer=setInterval(tick,430);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer=null;
  }
}
