// Original short arcade cues, synthesized once per AudioContext sample rate.
export const SKY_CUES = ['swift','petal','nova','enemy','rocket','hit','explode','boss','shield','warning','pickup','catch','gold','hurt','special','victory','defeat','launch'];
export function skySound(cue,sampleRate=44100){
  const duration=({swift:.095,petal:.16,nova:.22,enemy:.145,rocket:.32,hit:.1,explode:.42,boss:.85,shield:.48,warning:.55,pickup:.43,catch:.16,gold:.4,hurt:.28,special:.9,victory:1.45,defeat:.8,launch:.75})[cue];
  if(!duration)throw Error('Unknown sky cue');
  const output=new Float32Array(Math.ceil(duration*sampleRate));let seed=77,filtered=0,phase=0;
  for(let i=0;i<output.length;i++){
    const t=i/sampleRate,u=t/duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;filtered+=.12*(noise-filtered);
    let value=0;
    if(['swift','petal','nova','enemy'].includes(cue)){
      const start=cue==='swift'?1500:cue==='petal'?1100:cue==='enemy'?700:420,end=cue==='nova'?85:cue==='enemy'?170:290;
      phase+=2*Math.PI*(end+(start-end)*Math.exp(-t*28))/sampleRate;
      value=(Math.sin(phase)+.24*Math.sin(phase*2.01)+noise*.07)*Math.exp(-u*6)*.65;
    }else if(['explode','boss','rocket','hurt'].includes(cue)){
      const heavy=cue==='boss'||cue==='explode',frequency=heavy?62:cue==='rocket'?115:180;
      phase+=2*Math.PI*(frequency+80*Math.exp(-t*25))/sampleRate;
      value=(filtered*(heavy?3:1.8)+Math.sin(phase)*.55+noise*.13)*Math.exp(-u*5)*(heavy?1:.65);
    }else if(cue==='hit')value=(noise*.38+Math.sin(t*2*Math.PI*1900)*.25)*Math.exp(-u*7);
    else if(cue==='warning')value=Math.sin(2*Math.PI*(t% .18<.09?620:420)*t)*Math.max(0,Math.sin(t*Math.PI/.18))*.22;
    else if(cue==='special'||cue==='launch'||cue==='shield'){
      const frequency=cue==='shield'?400+900*u:cue==='launch'?100+480*u:160+1400*u*u;
      phase+=2*Math.PI*frequency/sampleRate;value=(Math.sin(phase)*.38+Math.sin(phase*1.5)*.17+filtered*.45)*Math.sin(Math.PI*u)*Math.exp(-u*.8);
    }else{
      const notes=cue==='victory'?[523.25,659.25,783.99,1046.5,1318.5]:cue==='defeat'?[392,349,261.63]:cue==='gold'?[880,1108.73,1318.51]:cue==='pickup'?[659.25,783.99,1046.5]:[1046.5,1318.51];
      const length=duration/(notes.length+1);
      for(let n=0;n<notes.length;n++){const local=t-n*length;if(local>=0)value+=(Math.sin(2*Math.PI*notes[n]*local)+.3*Math.sin(2*Math.PI*notes[n]*2.003*local))*Math.exp(-local*12)*.28;}
    }
    const edge=Math.min(1,t/.004,(duration-t)/.012);output[i]=Math.tanh(value)*.7*Math.max(0,edge);
  }return output;
}
