import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildCourse } from '../game-app/public/js/v2/course.js';
import { alphaBounds, fittedSize } from '../game-app/public/js/v2/colliders.js';

const require=createRequire(import.meta.url);
const Engine=require('../node_modules/phaser/src/physics/matter-js/lib/core/Engine');
const Bodies=require('../node_modules/phaser/src/physics/matter-js/lib/factory/Bodies');
const Body=require('../node_modules/phaser/src/physics/matter-js/lib/body/Body');
const Composite=require('../node_modules/phaser/src/physics/matter-js/lib/body/Composite');

const course=buildCourse('launcher-test');
const nodes=new Map(course.nodes.map(node=>[node.id,node]));
const objects=new Map(course.objects.map(object=>[object.id,object]));
const edges=course.routes.main.filter(edge=>edge.type==='launcher');
assert.equal(edges.length,4,'the fixed route must contain four launcher crossings');

function flight({vx,vy,targetY,secondJumpAt=-1}) {
  const engine=Engine.create();
  engine.gravity.y=1.45;
  const player=Bodies.circle(0,0,25,{frictionAir:.01});
  Composite.add(engine.world,player);
  Body.setVelocity(player,{x:vx,y:vy});
  let previousY=0;
  for (let frame=0;frame<260;frame++) {
    if (frame===secondJumpAt) Body.setVelocity(player,{x:vx,y:Math.min(player.velocity.y,-10.8)});
    Engine.update(engine,1000/60);
    if (player.velocity.y>0&&previousY<targetY&&player.position.y>=targetY) return player.position.x;
    previousY=player.position.y;
  }
  return null;
}

for (const edge of edges) {
  const from=nodes.get(edge.from),to=nodes.get(edge.to);
  const launcher=objects.get(from.objectId),landing=objects.get(to.objectId);
  const direction=Math.sign(to.x-from.x);
  const targetY=to.y-from.y;
  const landingBounds=alphaBounds(landing.assetId,fittedSize(landing));
  const nearEdge=direction>0 ? to.x+landingBounds.minX : to.x+landingBounds.maxX;
  const required=Math.abs(nearEdge-from.x)-25;

  const launched=flight({vx:launcher.behavior.velocityX,vy:-launcher.behavior.power,targetY});
  assert.notEqual(launched,null,`${from.altitude}m launcher never descends to its landing height`);
  assert.ok(Math.abs(launched)>=required,`${from.altitude}m launcher falls short: ${Math.abs(launched).toFixed(1)}px < ${required.toFixed(1)}px`);

  let bestDoubleJump=0;
  for (let secondJumpAt=1;secondJumpAt<=75;secondJumpAt++) {
    const reached=flight({vx:direction*5.6,vy:-12.2,targetY,secondJumpAt});
    if (reached!==null) bestDoubleJump=Math.max(bestDoubleJump,Math.abs(reached));
  }
  assert.ok(bestDoubleJump<required,`${from.altitude}m crossing is reachable without the launcher: ${bestDoubleJump.toFixed(1)}px >= ${required.toFixed(1)}px`);
}

console.log(`Launcher physics passed: ${edges.length} crossings are unreachable by normal double jump and reachable with the 30-power slingshot.`);
