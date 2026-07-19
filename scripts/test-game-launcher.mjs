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
assert.equal(edges.length,6,'the fixed route must contain six launcher crossings');

function flight({direction,vy,targetY,secondJumpAt=-1}) {
  const engine=Engine.create();
  engine.gravity.y=1.45;
  const player=Bodies.circle(0,0,25,{frictionAir:.01});
  Composite.add(engine.world,player);
  // Enter at normal running speed. Slingshots use ordinary air steering.
  Body.setVelocity(player,{x:direction*5.6,y:vy});
  let previousY=0, apex=0;
  for (let frame=0;frame<260;frame++) {
    const controlledX=player.velocity.x+(direction*5.6-player.velocity.x)*.085;
    Body.setVelocity(player,{x:controlledX,y:player.velocity.y});
    if (frame===secondJumpAt) Body.setVelocity(player,{x:controlledX,y:Math.min(player.velocity.y,-10.8)});
    Engine.update(engine,1000/60);
    apex=Math.min(apex,player.position.y);
    if (player.velocity.y>0&&previousY<targetY&&player.position.y>=targetY) return {x:player.position.x,apex:-apex};
    previousY=player.position.y;
  }
  return null;
}

for (const [edgeIndex,edge] of edges.entries()) {
  const from=nodes.get(edge.from),to=nodes.get(edge.to);
  const launcher=objects.get(from.objectId),landing=objects.get(to.objectId);
  const direction=Math.sign(to.x-from.x);
  const targetY=to.y-from.y;
  const landingBounds=alphaBounds(landing.assetId,fittedSize(landing));
  const nearEdge=direction>0 ? to.x+landingBounds.minX : to.x+landingBounds.maxX;
  const required=Math.abs(nearEdge-from.x)-25;

  assert.equal(launcher.angle,0,`${from.altitude}m launcher is not upright`);
  assert.equal(launcher.behavior.power,20,`${from.altitude}m launcher does not use power 20`);
  assert.equal('airSpeed' in launcher.behavior,false,`${from.altitude}m launcher changes ordinary air-control speed`);
  assert.equal('velocityX' in launcher.behavior,false,`${from.altitude}m launcher adds horizontal force`);
  assert.equal('targetX' in launcher.behavior,false,`${from.altitude}m launcher targets the landing`);
  const launched=flight({direction,vy:-launcher.behavior.power,targetY});
  assert.notEqual(launched,null,`${from.altitude}m launcher never descends to its landing height`);
  assert.ok(Math.abs(launched.x)>=required,`${from.altitude}m launcher falls short: ${Math.abs(launched.x).toFixed(1)}px < ${required.toFixed(1)}px`);
  const overhead=course.nodes.filter(node=>node.route==='main'&&node.id!==from.id&&node.y<from.y-20&&node.y>from.y-launched.apex-60).find(node=>{
    const object=objects.get(node.objectId);
    return object&&Math.abs(node.x-from.x)<fittedSize(object).w/2+34;
  });
  assert.equal(overhead,undefined,`${from.altitude}m launcher has ${overhead?.objectId} directly above it`);

  assert.ok(to.altitude-from.altitude<=30,`${from.altitude}m launcher creates a sparse ${(to.altitude-from.altitude)}m route hole`);
}

console.log(`Launcher physics passed: ${edges.length} upright power-20 launchers reach their next landing with ordinary air steering.`);
