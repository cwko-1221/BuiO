// The sprite is drawn 17px above the body position (PLAYER_SPRITE_DY), so
// the circle bottom (-9 + 27 = +18) lines up exactly with the character's
// feet pixels (sprite bottom = -17 + 35 = +18 at the 68x70 display size).
export const PLAYER_SPRITE_DY = -17;

export function createPlayerCompound(Matter) {
  const { Bodies, Body } = Matter;
  const main = Bodies.circle(0,-9,27,{label:'player-main',friction:0,frictionStatic:0,frictionAir:.018,restitution:0,slop:.08});
  const foot = Bodies.rectangle(0,20,30,8,{label:'player-foot',isSensor:true});
  const left = Bodies.rectangle(-30,-9,6,30,{label:'player-left',isSensor:true});
  const right = Bodies.rectangle(30,-9,6,30,{label:'player-right',isSensor:true});
  const body = Body.create({parts:[main,foot,left,right],friction:0,frictionStatic:0,frictionAir:.018,restitution:0,label:'player',slop:.08});
  Body.setInertia(body, Infinity);   // fixed rotation
  body.sleepThreshold = Infinity;
  return { body, parts:{ main, foot, left, right } };
}

export function wakePlayer(Matter, body) {
  if (!body) return;
  Matter.Sleeping.set(body, false);
  body.sleepCounter = 0;
}
