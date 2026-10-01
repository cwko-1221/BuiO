// Original procedural Foley, synthesized once per cue and cached by the mixer.
export function brawlSound(cue,sampleRate=48000){
  const specs={hit:[.18,135,47,.7],heavy:[.36,105,32,.95],guard:[.25,1350,460,.45],whoosh:[.18,330,170,.22],dash:[.42,280,65,.38],bolt:[.48,600,210,.3],vortex:[.68,170,90,.35],stomp:[.62,80,27,.95],jump:[.14,300,540,.15],land:[.13,100,45,.25],ko:[.38,220,50,.36],pickup:[.4,880,1760,.12],warning:[.4,350,210,.2],clear:[.8,440,880,.13],blink:[.22,1200,2300,.12],flurry:[.34,480,1100,.16],claw:[.16,1800,640,.08]};
  const [duration,from,to,body]=specs[cue]||specs.hit;
  const result=new Float32Array(Math.ceil(duration*sampleRate));let random=713,phase=0,low=0,mid=0;
  for(let i=0;i<result.length;i++){
    const t=i/sampleRate,q=t/duration;random=(Math.imul(random,1664525)+1013904223)>>>0;
    const noise=random/2147483648-1;low+=.055*(noise-low);mid+=.3*(noise-mid);
    const frequency=from*Math.pow(to/from,q);phase+=frequency*2*Math.PI/sampleRate;
    const impact=['hit','heavy','stomp','land','ko'].includes(cue),wind=['whoosh','dash','vortex'].includes(cue);
    let envelope=impact?Math.exp(-q*7)*Math.min(1,t/.0015):Math.sin(Math.PI*Math.min(1,q*1.8))*Math.exp(-q*3);
    if(cue==='vortex')envelope=Math.sin(Math.PI*q)*(.7+.3*Math.sin(q*40));
    let value=Math.sin(phase)*body*envelope;
    if(impact)value+=(mid-low)*.8*Math.exp(-t*45)+low*.9*Math.exp(-q*5);
    else if(wind)value+=(mid-low)*2.2*envelope;
    else if(cue==='guard')value+=(Math.sin(phase*2.71)+Math.sin(phase*4.13))*.16*envelope+(noise-mid)*.25*Math.exp(-t*90);
    else if(cue==='bolt')value+=(Math.sin(phase*1.5)*.1+(mid-low)*.7)*envelope;
    else if(cue==='pickup'||cue==='clear')value+=Math.sin(phase*1.5)*.12*envelope;
    else if(cue==='blink')value+=(Math.sin(phase*1.5)*.12+Math.sin(phase*2)*.08+(noise-mid)*.15)*envelope;
    else if(cue==='flurry'||cue==='claw')value+=((mid-low)*1.6+Math.sin(phase*2.3)*.07)*envelope;
    else value+=(mid-low)*.25*envelope;
    result[i]=Math.tanh(value*1.3)*.78*Math.min(1,(duration-t)/.015);
  }
  return result;
}
