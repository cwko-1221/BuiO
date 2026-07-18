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
assert.equal(edges.length,10,'the fixed route must contain ten launcher crossings');

function flight({direction,vy,targetY,secondJumpAt=-1,launcher=false}) {
  const engine=Engine.create();
  engine.gravity.y=1.45;
  const player=Bodies.circle(0,0,25,{frictionAir:.01});
  Composite.add(engine.world,player);
  // Enter at normal running speed. A slingshot flight allows stronger air
  // steering, but the sign still comes exclusively from the player's input.
  Body.setVelocity(player,{x:direction*5.6,y:vy});
  let previousY=0;
  for (let frame=0;frame<260;frame++) {
    const speed=launcher?8.4:5.6, blend=launcher?.11:.085;
    const controlledX=player.velocity.x+(direction*speed-player.velocity.x)*blend;
    Body.setVelocity(player,{x:controlledX,y:player.velocity.y});
    if (frame===secondJumpAt) Body.setVelocity(player,{x:controlledX,y:Math.min(player.velocity.y,-10.8)});
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

  assert.equal(launcher.angle,0,`${from.altitude}m launcher is not upright`);
  assert.equal('velocityX' in launcher.behavior,false,`${from.altitude}m launcher adds horizontal force`);
  assert.equal('targetX' in launcher.behavior,false,`${from.altitude}m launcher targets the landing`);
  const launched=flight({direction,vy:-launcher.behavior.power,targetY,launcher:true});
  assert.notEqual(launched,null,`${from.altitude}m launcher never descends to its landing height`);
  assert.ok(Math.abs(launched)>=required,`${from.altitude}m launcher falls short: ${Math.abs(launched).toFixed(1)}px < ${required.toFixed(1)}px`);

  let bestDoubleJump=0;
  for (let secondJumpAt=1;secondJumpAt<=75;secondJumpAt++) {
    const reached=flight({direction,vy:-12.2,targetY,secondJumpAt});
    if (reached!==null) bestDoubleJump=Math.max(bestDoubleJump,Math.abs(reached));
  }
  assert.ok(bestDoubleJump<required,`${from.altitude}m crossing is reachable without the launcher: ${bestDoubleJump.toFixed(1)}px >= ${required.toFixed(1)}px`);
}

console.log(`Launcher physics passed: ${edges.length} upright launchers add vertical force only; player steering reaches gaps that normal double jump cannot.`);
