// Contact frames share the simulation's four-tick melee window. Art timing never
// changes damage, buffering, movement, or replay state.
export function basicAttackPose(actionTick,windup=6,duration=20,count=8){
 const t=Math.max(0,actionTick),start=Math.max(1,windup||6),end=Math.max(start+5,duration||20);
 let pose;
 if(t<start)pose=Math.min(2,Math.floor(t/start*3));
 else if(t<start+4)pose=3+Math.min(1,Math.floor((t-start)/2));
 else pose=5+Math.min(2,Math.floor((t-start-4)/Math.max(1,end-start-4)*3));
 return Math.min(count-1,Math.round(pose*Math.max(0,count-1)/7));
}
