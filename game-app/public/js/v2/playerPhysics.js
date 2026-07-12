export function createPlayerCompound(Matter) {
  const { Bodies, Body } = Matter;
  const main = Bodies.circle(0,-4,22,{label:'player-main',friction:0,frictionStatic:0,frictionAir:.018,restitution:0,slop:.08});
  const foot = Bodies.rectangle(0,21,25,7,{label:'player-foot',isSensor:true});
  const left = Bodies.rectangle(-24,-3,6,29,{label:'player-left',isSensor:true});
  const right = Bodies.rectangle(24,-3,6,29,{label:'player-right',isSensor:true});
  const body = Body.create({parts:[main,foot,left,right],friction:0,frictionStatic:0,frictionAir:.018,restitution:0,label:'player',slop:.08});
  return { body, parts:{ main, foot, left, right } };
}
