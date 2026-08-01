import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ABILITIES, DIFFICULTIES, ENEMIES, MAPS, TOWERS, buildWave, distanceToPath, pathLength } from '../tower-defense-app/public/js/content.js';
import { TowerDefenseSimulation } from '../tower-defense-app/public/js/simulation.js';

const require=createRequire(import.meta.url);
const defaultQuestions=require('../tower-defense-app/lib/defaultQuestions.js');
const towerOrder=['bolt','cannon','frost','storm','prism','beacon'];

assert.equal(Object.keys(MAPS).length,3,'campaign must ship three maps');
assert.equal(Object.keys(TOWERS).length,6,'game must ship six tower types');
assert.ok(Object.keys(ENEMIES).length>=12,'game must ship at least twelve enemy definitions including bosses');
assert.equal(Object.keys(ABILITIES).length,3,'game must ship three battlefield abilities');
assert.equal(Object.keys(DIFFICULTIES).length,3,'game must ship three difficulty modes');
assert.ok(defaultQuestions.questions.length>=40,'built-in bank must provide at least forty questions');
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

const battle=new TowerDefenseSimulation({mapId:'starport',difficulty:'guardian',seed:11});
battle.state.gold=100000;
const placements=validBuildPoints(battle);
for(let index=0;index<24;index++){
  const type=['bolt','cannon','frost','storm','prism','beacon'][index%6];
  const result=battle.buildTower(type,placements[index].x,placements[index].y);
  assert.equal(result.ok,true,`autoplay placement ${index} must be valid`);
  while(result.tower.level<TOWERS[type].levels.length)assert.equal(battle.upgradeTower(result.tower.id).ok,true);
}
battle.state.focus=100;
assert.equal(battle.startWave().ok,true);
assert.equal(battle.useAbility('overdrive').ok,true,'battlefield ability should activate during a wave');
for(let wave=1;wave<=15;wave++){
  let frames=0;
  while(battle.state.phase==='wave'&&frames++<60*240)battle.update(1/60);
  assert.ok(frames<60*240,`wave ${wave} did not terminate`);
  if(wave<15){assert.equal(battle.state.phase,'build',`wave ${wave} should return to build phase`);assert.equal(battle.startWave().ok,true);}
}
assert.equal(battle.state.phase,'won','max-upgrade autoplay should clear the full campaign');
assert.equal(battle.state.wave,15);
assert.ok(battle.state.stats.kills>200,'full campaign should contain a substantial enemy count');
assert.ok(battle.state.score>0);

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
  questions:defaultQuestions.questions.length,wavesPerMap:15,autoplay:{phase:battle.state.phase,lives:battle.state.lives,kills:battle.state.stats.kills,score:battle.state.score},
  balancedRun:{phase:strategy.state.phase,lives:strategy.state.lives,towers:strategy.state.towers.length,quizCorrect:strategy.state.stats.quizCorrect,score:strategy.state.score}
},null,2));
