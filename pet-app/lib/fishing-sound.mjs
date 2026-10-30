// Original short water/line cues. Pre-rendered once and played from audio buffers.
export const FISHING_CUES=['cast','plop','notice','nibble','bite','hook','reel','surge','recover','shy','snap','catch','miss'];
export function fishingSound(cue,rate=44100){
  const duration=cue==='catch'?.8:cue==='cast'?.32:cue==='bite'?.38:cue==='reel'?.11:.2,out=new Float32Array(Math.ceil(rate*duration));let seed=91273,low=0;
  for(let i=0;i<out.length;i++){const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low+=.09*(noise-low);const env=Math.sin(Math.PI*t/duration)**2*Math.exp(-t*5);let v=0;
    if(['cast','nibble','bite'].includes(cue)){const f=cue==='bite'?230:cue==='nibble'?420:700;v=(low*(cue==='cast'?.75:.55)+Math.sin(2*Math.PI*(f*t-120*t*t))*.14)*env;}
    else if(cue==='plop'){v=(Math.sin(2*Math.PI*(310*t-500*t*t))*.2+low*.7)*env;}
    else if(cue==='notice'){v=Math.sin(2*Math.PI*880*t)*env*.065+Math.sin(2*Math.PI*1174*t)*env*.035;}
    else if(cue==='reel'){v=(Math.sin(2*Math.PI*1400*t)*Math.exp(-t*65)*.16+noise*.04)*env;}
    else if(cue==='shy'){v=(low*.7+Math.sin(2*Math.PI*(170*t-160*t*t))*.09)*env;}
    else if(cue==='snap'){v=(noise*.24*Math.exp(-t*28)+Math.sin(2*Math.PI*(880*t-1800*t*t))*.12)*env;}
    else if(cue==='recover'){v=(Math.sin(2*Math.PI*440*t)+Math.sin(2*Math.PI*554.37*t))*.04*env;}
    else if(cue==='hook'||cue==='surge'){v=Math.sin(2*Math.PI*(cue==='hook'?660:320)*t)*env*.12+noise*.025*Math.exp(-t*24);}
    else if(cue==='catch'){for(const[k,f]of [523.25,659.25,783.99,1046.5].entries()){const age=t-k*.09;if(age>=0)v+=Math.sin(2*Math.PI*f*age)*Math.exp(-age*7)*Math.min(1,age*150)*.11;}}
    else v=Math.sin(2*Math.PI*(280*t-90*t*t))*env*.1;
    out[i]=Math.max(-.65,Math.min(.65,v));
  }return out;
}
