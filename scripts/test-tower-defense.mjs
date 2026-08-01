import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ABILITIES, DIFFICULTIES, ENEMIES, MAPS, TOWERS, buildWave, distanceToPath, pathLength } from '../tower-defense-app/public/js/content.js';
import { TowerDefenseSimulation } from '../tower-defense-app/public/js/simulation.js';
import { BOSS_ART, ENEMY_ART, MAP_ART, TOWER_ART } from '../tower-defense-app/public/js/assets.js';

const require=createRequire(import.meta.url);
const defaultQuestions=require('../tower-defense-app/lib/defaultQuestions.js');
const sharp=require('sharp');
const towerOrder=['bolt','cannon','frost','storm','prism','beacon'];
const publicRoot=fileURLToPath(new URL('../tower-defense-app/public/',import.meta.url));
const assetFile=src=>join(publicRoot,src.replace('/tower-defense/',''));

assert.equal(Object.keys(MAPS).length,3,'campaign must ship three maps');
assert.equal(Object.keys(TOWERS).length,6,'game must ship six tower types');
assert.ok(Object.keys(ENEMIES).length>=12,'game must ship at least twelve enemy definitions including bosses');
assert.equal(Object.keys(ABILITIES).length,3,'game must ship three battlefield abilities');
assert.equal(Object.keys(DIFFICULTIES).length,3,'game must ship three difficulty modes');
assert.ok(defaultQuestions.questions.length>=40,'built-in bank must provide at least forty questions');

for(const [mapId,src] of Object.entries(MAP_ART)){
  const file=assetFile(src);assert.ok(existsSync(file),`${mapId} production background is missing`);
  const metadata=await sharp(file).metadata();assert.deepEqual([metadata.width,metadata.height],[1600,900],`${mapId} background must be 1600x900`);
  assert.ok(statSync(file).size>250000,`${mapId} background is unexpectedly small or placeholder-like`);
}
for(const [art,expectedSize,expectedFrames,label] of [
  [TOWER_ART,[768,512],Object.keys(TOWERS).length,'tower'],
  [ENEMY_ART,[768,768],9,'enemy'],
  [BOSS_ART,[1152,384],3,'boss'],
]){
  const file=assetFile(art.src);assert.ok(existsSync(file),`${label} sprite atlas is missing`);
  const metadata=await sharp(file).metadata();assert.deepEqual([metadata.width,metadata.height],expectedSize,`${label} sprite atlas has wrong dimensions`);
  assert.equal(metadata.hasAlpha,true,`${label} sprite atlas must preserve transparency`);
  assert.equal(Object.keys(art.frames).length,expectedFrames,`${label} frame manifest is incomplete`);
}
assert.deepEqual(Object.keys(TOWER_ART.frames).sort(),Object.keys(TOWERS).sort(),'every tower needs a production sprite frame');
assert.deepEqual([...Object.keys(ENEMY_ART.frames),...Object.keys(BOSS_ART.frames)].sort(),Object.keys(ENEMIES).sort(),'every enemy and boss needs a production sprite frame');
for(const question of defaultQuestions.questions){
  assert.equal(question.choices.length,4,`question must have four choices: ${question.question}`);
  assert.ok(Number.isInteger(question.correctIndex)&&question.correctIndex>=0&&question.correctIndex<4,'correct answer index must be valid');
}

for(const map of Object.values(MAPS)){
  assert.ok(map.path.length>=10,`${map.id} needs a full authored route`);
  assert.ok(pathLength(map.path)>1800,`${map.id} route is too short`);
  assert.ok(map.noBuild.length>=2,`${map.id} needs authored no-build landmarks`);
  assert.equal(buildWave(map.id,15)[0].type,map.boss,`${map.id} final wave must use its unique boss`);
  for(let wave=1;wave<=15;wave++){
    const groups=buildWave(map.id,wave);
    assert.ok(groups.length&&groups.every(group=>group.count>0&&ENEMIES[group.type]),`${map.id} wave ${wave} is invalid`);
  }
}

function validBuildPoints(simulation){
  const points=[];
  for(let y=90;y<=650;y+=70)for(let x=65;x<=1215;x+=75){
    if(distanceToPath(x,y,simulation.map.path)<65)continue;
    if(simulation.map.noBuild.some(zone=>x>zone.x-35&&x<zone.x+zone.w+35&&y>zone.y-35&&y<zone.y+zone.h+35))continue;
    if(points.some(point=>Math.hypot(point.x-x,point.y-y)<70))continue;
    points.push({x,y});
  }
  return points;
}

const economy=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:7});
assert.equal(economy.canBuild('bolt',190,170).ok,false,'path must reject tower placement');
const point=validBuildPoints(economy)[0];
const initialGold=economy.state.gold;
const built=economy.buildTower('bolt',point.x,point.y);
assert.equal(built.ok,true);
assert.equal(economy.state.gold,initialGold-TOWERS.bolt.cost);
assert.equal(economy.setTargetMode(built.tower.id,'strongest'),true);
assert.equal(built.tower.targetMode,'strongest');
const beforeQuiz=economy.state.gold;
economy.grantQuizReward({correct:true,reward:65,streak:2});
assert.equal(economy.state.gold,beforeQuiz+65);
assert.ok(economy.state.focus>0,'correct answers must grant focus');
economy.state.gold=1000;
assert.equal(economy.upgradeTower(built.tower.id).ok,true);
const refundExpected=Math.floor(built.tower.totalSpent*.7);
assert.deepEqual(economy.sellTower(built.tower.id),{ok:true,refund:refundExpected});

const loss=new TowerDefenseSimulation({mapId:'starport',difficulty:'legend',seed:9});
loss.state.lives=1;
loss.state.phase='wave';
const escapee=loss.spawnEnemy('guard',{progress:loss.pathLength+1});
loss.update(1/30);
assert.equal(loss.state.phase,'lost','core must fall when life reaches zero');
assert.equal(escapee.escaped,true);

function runMaxCampaign(mapId,seed){
  const simulation=new TowerDefenseSimulation({mapId,difficulty:'guardian',seed});
  simulation.state.gold=100000;
  const placements=validBuildPoints(simulation)
    .sort((a,b)=>distanceToPath(a.x,a.y,simulation.map.path)-distanceToPath(b.x,b.y,simulation.map.path));
  assert.ok(placements.length>=24,`${mapId} must have enough strategic build locations`);
  for(let index=0;index<24;index++){
    const type=towerOrder[index%towerOrder.length];
    const result=simulation.buildTower(type,placements[index].x,placements[index].y);
    assert.equal(result.ok,true,`${mapId} autoplay placement ${index} must be valid`);
    while(result.tower.level<TOWERS[type].levels.length)assert.equal(simulation.upgradeTower(result.tower.id).ok,true);
  }
  const eventTypes=new Set();
  let bossKilled=false;
  for(let wave=1;wave<=15;wave++){
    assert.equal(simulation.startWave().ok,true,`${mapId} wave ${wave} should start`);
    let frames=0;
    while(simulation.state.phase==='wave'&&frames++<60*240){
      simulation.update(1/60);
      for(const event of simulation.drainEvents()){
        eventTypes.add(event.type);
        if(event.type==='enemyKilled'&&event.boss)bossKilled=true;
      }
    }
    assert.ok(frames<60*240,`${mapId} wave ${wave} did not terminate`);
    if(wave<15)assert.equal(simulation.state.phase,'build',`${mapId} wave ${wave} should return to build phase`);
  }
  for(const type of ['waveStarted','enemyKilled','gameOver'])assert.ok(eventTypes.has(type),`${mapId} must exercise ${type} campaign event`);
  assert.equal(simulation.state.phase,'won',`${mapId} max-upgrade autoplay should clear the full campaign`);
  assert.equal(simulation.state.wave,15);
  assert.ok(simulation.state.stats.kills>200,`${mapId} must contain a substantial enemy count`);
  assert.ok(simulation.state.score>0);
  assert.equal(bossKilled,true,`${mapId} unique boss must be defeated`);
  return simulation;
}

const campaignRuns=Object.keys(MAPS).map((mapId,index)=>runMaxCampaign(mapId,11+index));

const powers=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:15});
powers.state.phase='wave';
const powerTarget=powers.spawnEnemy('guard',{progress:260});
powers.state.focus=100;
assert.equal(powers.useAbility('meteor',powerTarget.x,powerTarget.y).ok,true,'meteor must activate and hit a selected area');
assert.ok(powers.state.abilities.meteor>0&&powers.state.focus===60,'meteor must consume focus and start cooldown');
powers.state.focus=100;
assert.equal(powers.useAbility('stasis').ok,true,'stasis must activate during a wave');
assert.ok(powers.state.stasisTime>0&&powers.state.abilities.stasis>0,'stasis must apply a timed global slow');
powers.state.focus=100;
assert.equal(powers.useAbility('overdrive').ok,true,'overdrive must activate during a wave');
assert.ok(powers.state.overdriveTime>0&&powers.state.abilities.overdrive>0,'overdrive must apply a timed attack-speed buff');

const support=new TowerDefenseSimulation({mapId:'moonwood',difficulty:'guardian',seed:17});
support.state.phase='wave';
const medic=support.spawnEnemy('medic',{progress:100});
const wounded=support.spawnEnemy('guard',{progress:105});
wounded.hp-=80;const woundedBefore=wounded.hp;medic.abilityTime=0;support.step(.01);
assert.ok(wounded.hp>woundedBefore,'medic enemies must heal nearby allies');
const shielded=support.spawnEnemy('shielder',{progress:130});
shielded.shield=10;const shieldBefore=shielded.shield;shielded.abilityTime=0;support.step(.01);
assert.ok(shielded.shield>shieldBefore,'shielder enemies must recharge their shields');
const splitter=support.spawnEnemy('splitter',{progress:160});
support.damageEnemy(splitter,99999);
assert.equal(support.state.enemies.filter(enemy=>enemy.type==='shard').length,2,'splitter enemies must create two shards');

const targeting=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:19});
targeting.state.gold=5000;
const targetPoints=validBuildPoints(targeting)
  .sort((a,b)=>distanceToPath(a.x,a.y,targeting.map.path)-distanceToPath(b.x,b.y,targeting.map.path));
const boltTower=targeting.buildTower('bolt',targetPoints[0].x,targetPoints[0].y).tower;
const beaconPoint=targetPoints.find(point=>Math.hypot(point.x-boltTower.x,point.y-boltTower.y)<=TOWERS.beacon.levels[0].range&&targeting.canBuild('beacon',point.x,point.y).ok);
assert.ok(beaconPoint,'a valid beacon support position must exist');
const phantom=targeting.spawnEnemy('phantom',{progress:0});phantom.x=boltTower.x;phantom.y=boltTower.y;
assert.equal(targeting.targetsFor(boltTower,TOWERS.bolt.levels[0]).includes(phantom),false,'stealth enemies must stay hidden without detection');
targeting.buildTower('beacon',beaconPoint.x,beaconPoint.y);
assert.equal(targeting.targetsFor(boltTower,TOWERS.bolt.levels[0]).includes(phantom),true,'beacons must reveal stealth enemies');
const cannonPoint=targetPoints.find(point=>targeting.canBuild('cannon',point.x,point.y).ok);
const cannonTower=targeting.buildTower('cannon',cannonPoint.x,cannonPoint.y).tower;
const flying=targeting.spawnEnemy('wisp',{progress:0});flying.x=cannonTower.x;flying.y=cannonTower.y;
assert.equal(targeting.targetsFor(cannonTower,TOWERS.cannon.levels[0]).includes(flying),false,'ground-only cannon must not target flying enemies');

const projectileTest=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:23});
projectileTest.state.gold=1000;
const projectilePoint=validBuildPoints(projectileTest)
  .sort((a,b)=>distanceToPath(a.x,a.y,projectileTest.map.path)-distanceToPath(b.x,b.y,projectileTest.map.path))[0];
const projectileTower=projectileTest.buildTower('bolt',projectilePoint.x,projectilePoint.y).tower;
const projectileEnemy=projectileTest.spawnEnemy('guard',{progress:0});
projectileEnemy.x=projectileTower.x+70;projectileEnemy.y=projectileTower.y;
projectileTest.attack(projectileTower,projectileEnemy,TOWERS.bolt,TOWERS.bolt.levels[0],1);
for(let frame=0;frame<90&&projectileTest.state.projectiles.length;frame++)projectileTest.updateProjectiles(1/60);
assert.ok(projectileTest.drainEvents().some(event=>event.type==='impact'),'projectiles must resolve into a visible impact event');

for(const [index,type,eventType] of [['bolt','shot'],['cannon','shot'],['frost','shot'],['storm','chain'],['prism','beam'],['beacon','pulse']].map((entry,index)=>[index,...entry])){
  const attackTest=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:30+index});
  attackTest.state.gold=5000;
  const attackPoint=validBuildPoints(attackTest)
    .sort((a,b)=>distanceToPath(a.x,a.y,attackTest.map.path)-distanceToPath(b.x,b.y,attackTest.map.path))[0];
  const tower=attackTest.buildTower(type,attackPoint.x,attackPoint.y).tower;
  const primary=attackTest.spawnEnemy('drone',{progress:0});primary.x=tower.x+60;primary.y=tower.y;
  const secondary=attackTest.spawnEnemy('guard',{progress:0});secondary.x=tower.x+85;secondary.y=tower.y+10;
  attackTest.drainEvents();
  attackTest.attack(tower,primary,TOWERS[type],TOWERS[type].levels[0],1);
  assert.ok(attackTest.drainEvents().some(event=>event.type===eventType),`${type} must emit its ${eventType} attack animation event`);
}

// Balance smoke test: a realistic guardian run answers two questions between
// waves, builds a mixed ten-tower defence, then buys the cheapest upgrades.
const strategy=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:21});
const strategyPoints=validBuildPoints(strategy).sort((a,b)=>distanceToPath(a.x,a.y,strategy.map.path)-distanceToPath(b.x,b.y,strategy.map.path));
let nextTower=0;
function invest(){
  let changed=true;
  while(changed){
    changed=false;
    if(strategy.state.towers.length<10){
      const type=towerOrder[nextTower%towerOrder.length];
      const point=strategyPoints[strategy.state.towers.length];
      if(strategy.state.gold>=TOWERS[type].cost&&strategy.buildTower(type,point.x,point.y).ok){nextTower++;changed=true;continue;}
    }
    const option=strategy.state.towers
      .filter(tower=>tower.level<TOWERS[tower.type].levels.length)
      .map(tower=>({tower,cost:TOWERS[tower.type].upgradeCosts[tower.level-1]}))
      .filter(option=>option.cost<=strategy.state.gold)
      .sort((a,b)=>a.cost-b.cost)[0];
    if(option){strategy.upgradeTower(option.tower.id);changed=true;}
  }
}
for(let wave=1;wave<=15;wave++){
  strategy.grantQuizReward({correct:true,reward:45,streak:1});
  strategy.grantQuizReward({correct:true,reward:50,streak:2});
  if(wave%5===0)strategy.grantQuizReward({correct:true,reward:55,streak:3});
  invest();
  assert.equal(strategy.startWave().ok,true);
  if(strategy.state.focus>=ABILITIES.overdrive.cost)strategy.useAbility('overdrive');
  let frames=0;while(strategy.state.phase==='wave'&&frames++<60*240)strategy.update(1/60);
  assert.notEqual(strategy.state.phase,'lost',`balanced mixed defence should survive wave ${wave}`);
}
assert.equal(strategy.state.phase,'won','a consistent mixed strategy should be able to finish guardian difficulty');

console.log(JSON.stringify({
  maps:Object.keys(MAPS).length,towers:Object.keys(TOWERS).length,enemies:Object.keys(ENEMIES).length,
  questions:defaultQuestions.questions.length,wavesPerMap:15,
  campaigns:campaignRuns.map(run=>({map:run.state.mapId,phase:run.state.phase,lives:run.state.lives,kills:run.state.stats.kills,score:run.state.score})),
  balancedRun:{phase:strategy.state.phase,lives:strategy.state.lives,towers:strategy.state.towers.length,quizCorrect:strategy.state.stats.quizCorrect,score:strategy.state.score}
},null,2));
