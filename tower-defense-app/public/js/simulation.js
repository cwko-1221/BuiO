import {
  ABILITIES, DIFFICULTIES, ENEMIES, MAPS, QUIZ_RULES, TOWERS, WORLD,
  buildWave, distanceToPaths, mapPaths, pathLength, pointAlongPath, towerStats,
} from './content.js?v=20260809-path-grid-1';

const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

function seededRandom(seed = 0x6d2b79f5) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

export class TowerDefenseSimulation {
  constructor({ mapId='starport', seed=Date.now() } = {}) {
    this.map = MAPS[mapId] || MAPS.starport;
    this.difficulty = DIFFICULTIES.guardian;
    this.quizRules = QUIZ_RULES.guardian;
    this.paths = mapPaths(this.map);
    this.pathLengths = this.paths.map(pathLength);
    this.laneBalance = 1-Math.min(.18,(this.paths.length-1)*.09);
    this.random = seededRandom(seed);
    this.pathLength = Math.max(...this.pathLengths);
    this.nextId = 1;
    this.accumulator = 0;
    this.events = [];
    this.state = {
      mapId:this.map.id,
      difficulty:this.difficulty.id,
      phase:'build',
      wave:0,
      maxWaves:15,
      lives:this.difficulty.lives,
      gold:this.difficulty.startingGold,
      focus:0,
      score:0,
      speed:1,
      paused:false,
      elapsed:0,
      waveTime:0,
      buildCountdown:30,
      quizKeys:0,
      answersRequired:this.quizRules.answersPerWave,
      autoStartWaiting:false,
      towers:[],
      enemies:[],
      projectiles:[],
      abilities:{ meteor:0,stasis:0,overdrive:0 },
      stasisTime:0,
      overdriveTime:0,
      stats:{ built:0,sold:0,upgrades:0,kills:0,escaped:0,damage:0,quizCorrect:0,quizAnswered:0,goldFromQuiz:0 },
    };
    this.waveQueue=[];
  }

  emit(type,payload={}) {
    this.events.push({ type,...payload });
  }

  drainEvents() {
    return this.events.splice(0);
  }

  canBuild(type,x,y) {
    const definition=TOWERS[type];
    if (!definition) return { ok:false,reason:'未知的防禦塔。' };
    if (this.state.phase==='won'||this.state.phase==='lost') return { ok:false,reason:'戰役已經結束。' };
    if (this.state.gold<definition.cost) return { ok:false,reason:'晶幣不足。' };
    return this.canOccupy(x,y);
  }

  canOccupy(x,y) {
    if (x<42||x>WORLD.width-42||y<72||y>WORLD.height-42) return { ok:false,reason:'不能建在地圖邊緣。' };
    if (distanceToPaths(x,y,this.paths)<WORLD.pathWidth*.5+27) return { ok:false,reason:'不能阻塞怪物路線。' };
    if (this.map.noBuild.some(zone => x>zone.x-30&&x<zone.x+zone.w+30&&y>zone.y-30&&y<zone.y+zone.h+30)) {
      return { ok:false,reason:'這裡是場景保留區。' };
    }
    if (this.state.towers.some(tower=>Math.hypot(tower.x-x,tower.y-y)<66)) return { ok:false,reason:'防禦塔距離太近。' };
    return { ok:true };
  }

  buildTower(type,x,y) {
    const result=this.canBuild(type,x,y);
    if (!result.ok) return result;
    const definition=TOWERS[type];
    const tower={
      id:`t${this.nextId++}`,type,x,y,level:1,targetMode:'first',cooldown:0,
      totalSpent:definition.cost,kills:0,damage:0,targetId:null,ramp:1,rotation:0,
    };
    this.state.gold-=definition.cost;
    this.state.towers.push(tower);
    this.state.stats.built++;
    this.emit('towerBuilt',{ towerId:tower.id,x,y,towerType:type });
    return { ok:true,tower };
  }

  upgradeTower(towerId) {
    const tower=this.state.towers.find(item=>item.id===towerId);
    if (!tower) return { ok:false,reason:'找不到防禦塔。' };
    const definition=TOWERS[tower.type];
    if (tower.level>=definition.levels.length) return { ok:false,reason:'已達最高等級。' };
    const cost=definition.upgradeCosts[tower.level-1];
    if (this.state.gold<cost) return { ok:false,reason:'晶幣不足。' };
    this.state.gold-=cost;
    tower.totalSpent+=cost;
    tower.level++;
    tower.ramp=1;
    this.state.stats.upgrades++;
    this.emit('towerUpgraded',{ towerId:tower.id,x:tower.x,y:tower.y,level:tower.level });
    return { ok:true,tower,cost };
  }

  sellTower(towerId) {
    const index=this.state.towers.findIndex(item=>item.id===towerId);
    if (index<0) return { ok:false,reason:'找不到防禦塔。' };
    const [tower]=this.state.towers.splice(index,1);
    const refund=Math.floor(tower.totalSpent*.7);
    this.state.gold+=refund;
    this.state.stats.sold++;
    this.emit('towerSold',{ towerId,x:tower.x,y:tower.y,refund });
    return { ok:true,refund };
  }

  setTargetMode(towerId,mode) {
    if (!['first','last','strongest','weakest'].includes(mode)) return false;
    const tower=this.state.towers.find(item=>item.id===towerId);
    if (!tower) return false;
    tower.targetMode=mode;
    return true;
  }

  setSpeed(speed) {
    this.state.speed=[1,2,3].includes(Number(speed))?Number(speed):1;
  }

  togglePause(force) {
    this.state.paused=typeof force==='boolean'?force:!this.state.paused;
    return this.state.paused;
  }

  startWave({ auto=false }={}) {
    if (this.state.phase!=='build'||this.state.wave>=this.state.maxWaves) return { ok:false,reason:'現在不能開始下一波。' };
    if (this.state.quizKeys<this.state.answersRequired) {
      return { ok:false,reason:`開始下一波前，必須答對 ${this.state.answersRequired} 題（目前 ${this.state.quizKeys}/${this.state.answersRequired}）。` };
    }
    this.state.wave++;
    this.state.phase='wave';
    this.state.waveTime=0;
    this.state.quizKeys=0;
    this.state.autoStartWaiting=false;
    this.waveQueue=[];
    let cursor=.7;
    let spawnNumber=this.state.wave-1;
    for (const group of buildWave(this.map.id,this.state.wave)) {
      cursor+=group.delay||0;
      for (let index=0;index<group.count;index++) {
        const pathIndex=spawnNumber++%this.paths.length;
        this.waveQueue.push({ at:cursor,type:group.type,pathIndex });
        cursor+=group.interval;
      }
    }
    this.emit('waveStarted',{ wave:this.state.wave,total:this.waveQueue.length,auto,entrances:this.paths.length });
    return { ok:true,wave:this.state.wave,auto };
  }

  grantQuizReward({ correct,reward=0,streak=0 }={}) {
    this.state.stats.quizAnswered++;
    if (!correct) {
      this.emit('quizResult',{ correct:false,reward:0,streak:0 });
      return 0;
    }
    const amount=Math.max(0,Math.floor((Number(reward)||0)*this.quizRules.quizGoldMultiplier));
    this.state.gold+=amount;
    this.state.quizKeys=Math.min(this.state.answersRequired,this.state.quizKeys+1);
    if (this.state.quizKeys>=this.state.answersRequired) this.state.autoStartWaiting=false;
    this.state.focus=clamp(this.state.focus+12+Math.min(12,streak*2),0,100);
    this.state.stats.quizCorrect++;
    this.state.stats.goldFromQuiz+=amount;
    this.state.score+=amount*4;
    this.emit('quizResult',{ correct:true,reward:amount,streak,quizKeys:this.state.quizKeys,answersRequired:this.state.answersRequired });
    return amount;
  }

  useAbility(id,x=WORLD.width*.5,y=WORLD.height*.5) {
    const ability=ABILITIES[id];
    if (!ability) return { ok:false,reason:'未知技能。' };
    if (this.state.phase!=='wave') return { ok:false,reason:'技能只能在戰鬥中使用。' };
    if (this.state.abilities[id]>0) return { ok:false,reason:'技能仍在冷卻。' };
    if (this.state.focus<ability.cost) return { ok:false,reason:'專注能量不足。' };
    this.state.focus-=ability.cost;
    this.state.abilities[id]=ability.cooldown;
    if (id==='meteor') {
      const target={x:clamp(x,0,WORLD.width),y:clamp(y,0,WORLD.height)};
      for (const enemy of [...this.state.enemies]) if (distance(enemy,target)<=150) this.damageEnemy(enemy,480+this.state.wave*18,{ armorPierce:20 });
      this.emit('ability',{ id,x:target.x,y:target.y });
    } else if (id==='stasis') {
      this.state.stasisTime=6;
      this.emit('ability',{ id });
    } else if (id==='overdrive') {
      this.state.overdriveTime=9;
      this.emit('ability',{ id });
    }
    return { ok:true };
  }

  update(realDelta) {
    if (this.state.paused||['won','lost'].includes(this.state.phase)) return;
    const scaled=clamp(Number(realDelta)||0,0,.08)*this.state.speed;
    this.accumulator+=scaled;
    const step=1/60;
    let guard=0;
    while (this.accumulator>=step&&guard++<18) {
      this.step(step);
      this.accumulator-=step;
    }
  }

  step(dt) {
    this.state.elapsed+=dt;
    for (const id of Object.keys(this.state.abilities)) this.state.abilities[id]=Math.max(0,this.state.abilities[id]-dt);
    this.state.stasisTime=Math.max(0,this.state.stasisTime-dt);
    this.state.overdriveTime=Math.max(0,this.state.overdriveTime-dt);
    if (this.state.phase==='build') {
      this.state.buildCountdown=Math.max(0,this.state.buildCountdown-dt);
      if (this.state.buildCountdown<=0) {
        if (this.state.quizKeys>=this.state.answersRequired) this.startWave({auto:true});
        else if (!this.state.autoStartWaiting) {
          this.state.autoStartWaiting=true;
          this.emit('quizRequired',{ wave:this.state.wave+1,quizKeys:this.state.quizKeys,answersRequired:this.state.answersRequired });
        }
      }
      return;
    }
    if (this.state.phase!=='wave') return;
    this.state.waveTime+=dt;
    while (this.waveQueue.length&&this.waveQueue[0].at<=this.state.waveTime) {
      const queued=this.waveQueue.shift();this.spawnEnemy(queued.type,{pathIndex:queued.pathIndex});
    }
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    if (!this.waveQueue.length&&!this.state.enemies.length&&this.state.phase==='wave') this.finishWave();
  }

  spawnEnemy(type,{ progress=0,pathIndex=0 }={}) {
    const definition=ENEMIES[type];
    if (!definition) return null;
    const hpScale=this.difficulty.enemyHp*this.laneBalance*(1+(this.state.wave-1)*.075)*(1+(this.map.chapter-1)*.09);
    const maxHp=Math.round(definition.hp*hpScale);
    const shield=Math.round((definition.shield||0)*hpScale);
    const safePathIndex=clamp(Math.floor(Number(pathIndex)||0),0,this.paths.length-1),path=this.paths[safePathIndex],enemyPathLength=this.pathLengths[safePathIndex];
    const pose=pointAlongPath(path,progress);
    const enemy={
      id:`e${this.nextId++}`,type,x:pose.x,y:pose.y,distance:progress,maxHp,hp:maxHp,
      pathIndex:safePathIndex,pathLength:enemyPathLength,progressRatio:enemyPathLength?progress/enemyPathLength:0,
      maxShield:shield,shield,slowFactor:0,slowTime:0,freezeTime:0,abilityTime:2+this.random()*2,
      escaped:false,dead:false,angle:pose.angle,
    };
    this.state.enemies.push(enemy);
    this.emit('enemySpawned',{ enemyId:enemy.id,enemyType:type,x:enemy.x,y:enemy.y,pathIndex:safePathIndex });
    return enemy;
  }

  updateEnemies(dt) {
    for (const enemy of [...this.state.enemies]) {
      const definition=ENEMIES[enemy.type];
      enemy.slowTime=Math.max(0,enemy.slowTime-dt);
      enemy.freezeTime=Math.max(0,enemy.freezeTime-dt);
      enemy.abilityTime-=dt;
      if (enemy.abilityTime<=0) {
        enemy.abilityTime=definition.boss?4.5:3.2;
        if (definition.ability==='heal') {
          let healed=0;
          for (const ally of this.state.enemies) if (!ally.dead&&distance(enemy,ally)<125) {
            const amount=Math.min(ally.maxHp-ally.hp,Math.max(8,ally.maxHp*.055));
            ally.hp+=amount; healed+=amount;
          }
          if (healed>0) this.emit('heal',{ enemyId:enemy.id,x:enemy.x,y:enemy.y,amount:healed });
        } else if (definition.ability==='shield'&&enemy.shield<enemy.maxShield) {
          enemy.shield=Math.min(enemy.maxShield,enemy.shield+enemy.maxShield*.24);
          this.emit('shield',{ enemyId:enemy.id,x:enemy.x,y:enemy.y });
        } else if (definition.ability==='bossPulse') {
          this.emit('bossPulse',{ enemyId:enemy.id,x:enemy.x,y:enemy.y });
        }
      }
      if (enemy.freezeTime>0) continue;
      const localSlow=enemy.slowTime>0?enemy.slowFactor:0;
      const globalSlow=this.state.stasisTime>0?.70:0;
      const bossResist=definition.boss?.55:1;
      const slow=clamp(Math.max(localSlow,globalSlow)*bossResist,0,.8);
      enemy.distance+=definition.speed*this.difficulty.enemySpeed*(1-slow)*dt;
      const pose=pointAlongPath(this.paths[enemy.pathIndex],enemy.distance);
      enemy.x=pose.x; enemy.y=pose.y; enemy.angle=pose.angle;enemy.progressRatio=enemy.pathLength?enemy.distance/enemy.pathLength:0;
      if (pose.done) this.escapeEnemy(enemy);
    }
  }

  escapeEnemy(enemy) {
    if (enemy.dead||enemy.escaped) return;
    enemy.escaped=true;
    const definition=ENEMIES[enemy.type];
    this.state.lives=Math.max(0,this.state.lives-definition.lifeDamage);
    this.state.stats.escaped++;
    this.removeEnemy(enemy);
    this.emit('enemyEscaped',{ enemyType:enemy.type,damage:definition.lifeDamage,lives:this.state.lives });
    if (this.state.lives<=0) {
      this.state.phase='lost';
      this.waveQueue=[];
      this.state.score=Math.floor(this.state.score*this.difficulty.score);
      this.emit('gameOver',{ won:false,wave:this.state.wave,score:this.state.score });
    }
  }

  updateTowers(dt) {
    const overdrive=this.state.overdriveTime>0?.55:1;
    for (const tower of this.state.towers) {
      tower.cooldown-=dt;
      if (tower.cooldown>0) continue;
      const definition=TOWERS[tower.type], stats=towerStats(tower);
      const targets=this.targetsFor(tower,stats);
      if (!targets.length) { tower.targetId=null;tower.ramp=1;continue; }
      const target=this.sortTargets(targets,tower.targetMode)[0];
      const aura=this.beaconAuraFor(tower);
      const damageBuff=1+aura;
      tower.rotation=Math.atan2(target.y-tower.y,target.x-tower.x);
      this.attack(tower,target,definition,stats,damageBuff);
      tower.cooldown=stats.cooldown*overdrive/(1+aura*.45);
    }
  }

  targetsFor(tower,stats) {
    const definition=TOWERS[tower.type];
    return this.state.enemies.filter(enemy=>{
      if (enemy.dead||enemy.escaped||distance(tower,enemy)>stats.range) return false;
      const enemyDefinition=ENEMIES[enemy.type];
      if (definition.target==='ground'&&enemyDefinition.air) return false;
      if (definition.target==='air'&&!enemyDefinition.air) return false;
      if (enemyDefinition.stealth&&!this.isRevealed(enemy)) return false;
      return true;
    });
  }

  isRevealed(enemy) {
    return this.state.towers.some(tower=>tower.type==='beacon'&&distance(tower,enemy)<=towerStats(tower).range)||enemy.distance>enemy.pathLength-180;
  }

  beaconAuraFor(tower) {
    if (tower.type==='beacon') return 0;
    let aura=0;
    for (const beacon of this.state.towers) if (beacon.type==='beacon') {
      const stats=towerStats(beacon);
      if (distance(tower,beacon)<=stats.range) aura=Math.max(aura,stats.aura||0);
    }
    return aura;
  }

  sortTargets(targets,mode) {
    return [...targets].sort((a,b)=>{
      if (mode==='last') return a.progressRatio-b.progressRatio;
      if (mode==='strongest') return b.hp-a.hp;
      if (mode==='weakest') return a.hp-b.hp;
      return b.progressRatio-a.progressRatio;
    });
  }

  attack(tower,target,definition,stats,damageBuff) {
    const baseDamage=stats.damage*damageBuff;
    const sameTarget=tower.targetId===target.id;
    tower.targetId=target.id;
    if (definition.attack==='flame') {
      const direction=Math.atan2(target.y-tower.y,target.x-tower.x),halfAngle=(stats.flameWidth||.5)*.5;
      const hit=this.targetsFor(tower,stats).filter(enemy=>{
        const angle=Math.atan2(enemy.y-tower.y,enemy.x-tower.x),difference=Math.abs(Math.atan2(Math.sin(angle-direction),Math.cos(angle-direction)));
        return difference<=halfAngle;
      });
      for (const enemy of hit) this.damageEnemy(enemy,baseDamage,{ tower,armorPierce:stats.armorPierce||0 });
      this.emit('flame',{ towerId:tower.id,from:{x:tower.x,y:tower.y},angle:direction,range:stats.range,width:stats.flameWidth||.5,targets:hit.length });
    } else if (definition.attack==='frostField') {
      const radius=stats.fieldRadius||64,victims=this.state.enemies.filter(enemy=>!enemy.dead&&distance(target,enemy)<=radius);
      for (const enemy of victims) {
        this.damageEnemy(enemy,baseDamage,{ tower,armorPierce:1 });
        this.applySlow(enemy,stats.slow,stats.slowDuration);
        if (stats.freezeChance&&this.random()<stats.freezeChance) enemy.freezeTime=definitionBoss(enemy)?.45:1.1;
      }
      this.emit('frostField',{ towerId:tower.id,x:target.x,y:target.y,radius,targets:victims.map(enemy=>enemy.id) });
    } else if (definition.attack==='chain') {
      const hit=[];
      let current=target;
      for (let index=0;current&&index<stats.chains;index++) {
        hit.push(current);
        this.damageEnemy(current,baseDamage*Math.pow(.78,index),{ tower,armorPierce:stats.armorPierce });
        const candidates=this.state.enemies.filter(enemy=>!enemy.dead&&!hit.includes(enemy)&&distance(current,enemy)<=stats.chainRange);
        current=this.sortTargets(candidates,'first')[0];
      }
      this.emit('chain',{ towerId:tower.id,points:[{x:tower.x,y:tower.y},...hit.map(enemy=>({x:enemy.x,y:enemy.y}))] });
    } else if (definition.attack==='beam') {
      tower.ramp=sameTarget?Math.min(stats.maxRamp,tower.ramp+stats.ramp):1;
      this.damageEnemy(target,baseDamage*tower.ramp,{ tower,armorPierce:4 });
      this.emit('beam',{ towerId:tower.id,from:{x:tower.x,y:tower.y},to:{x:target.x,y:target.y},power:tower.ramp });
    } else if (definition.attack==='pulse') {
      const hit=this.targetsFor(tower,stats);
      for (const enemy of hit) {
        this.damageEnemy(enemy,baseDamage,{ tower,armorPierce:2 });
        if (stats.slow) this.applySlow(enemy,stats.slow,stats.slowDuration);
      }
      this.emit('pulse',{ towerId:tower.id,x:tower.x,y:tower.y,range:stats.range });
    } else {
      this.state.projectiles.push({
        id:`p${this.nextId++}`,towerId:tower.id,targetId:target.id,type:definition.attack,
        x:tower.x,y:tower.y,speed:definition.projectileSpeed,damage:baseDamage,
        splash:stats.splash||0,armorPierce:stats.armorPierce||0,slow:stats.slow||0,
        slowDuration:stats.slowDuration||0,freezeChance:stats.freezeChance||0,color:definition.color,
      });
      this.emit('shot',{ towerId:tower.id,towerType:tower.type,x:tower.x,y:tower.y,targetId:target.id });
    }
  }

  updateProjectiles(dt) {
    for (const projectile of [...this.state.projectiles]) {
      const target=this.state.enemies.find(enemy=>enemy.id===projectile.targetId&&!enemy.dead);
      if (!target) { this.removeProjectile(projectile);continue; }
      const dx=target.x-projectile.x,dy=target.y-projectile.y;
      const length=Math.hypot(dx,dy)||1;
      const step=projectile.speed*dt;
      if (length<=step+ENEMIES[target.type].size) {
        projectile.x=target.x;projectile.y=target.y;
        this.hitProjectile(projectile,target);
        this.removeProjectile(projectile);
      } else {
        projectile.x+=dx/length*step;projectile.y+=dy/length*step;
      }
    }
  }

  hitProjectile(projectile,target) {
    const tower=this.state.towers.find(item=>item.id===projectile.towerId);
    const victims=projectile.splash?this.state.enemies.filter(enemy=>!enemy.dead&&distance(target,enemy)<=projectile.splash):[target];
    for (const enemy of victims) {
      const falloff=enemy===target?1:.72;
      this.damageEnemy(enemy,projectile.damage*falloff,{ tower,armorPierce:projectile.armorPierce });
      if (projectile.slow) this.applySlow(enemy,projectile.slow,projectile.slowDuration);
      if (projectile.freezeChance&&this.random()<projectile.freezeChance) enemy.freezeTime=definitionBoss(enemy) ? .45 : 1.1;
    }
    this.emit('impact',{ impactType:projectile.type,x:target.x,y:target.y,radius:projectile.splash||22,color:projectile.color });
  }

  applySlow(enemy,factor,duration) {
    const resist=ENEMIES[enemy.type].boss?.55:1;
    enemy.slowFactor=Math.max(enemy.slowFactor,factor*resist);
    enemy.slowTime=Math.max(enemy.slowTime,duration*resist);
  }

  damageEnemy(enemy,amount,{ tower=null,armorPierce=0 }={}) {
    if (!enemy||enemy.dead||enemy.escaped) return 0;
    const definition=ENEMIES[enemy.type];
    let raw=Math.max(0,Number(amount)||0);
    if (tower) {
      const stats=towerStats(tower);
      if (stats.crit&&this.random()<stats.crit) { raw*=1.8;this.emit('critical',{x:enemy.x,y:enemy.y}); }
    }
    let dealt=0;
    if (enemy.shield>0) {
      const shieldDamage=Math.min(enemy.shield,raw);
      enemy.shield-=shieldDamage;raw-=shieldDamage;dealt+=shieldDamage;
      if (enemy.shield<=0) this.emit('shieldBreak',{x:enemy.x,y:enemy.y});
    }
    if (raw>0) {
      const healthDamage=Math.max(1,raw-Math.max(0,definition.armor-(armorPierce||0)));
      enemy.hp-=healthDamage;dealt+=healthDamage;
    }
    this.state.stats.damage+=dealt;
    if (tower) tower.damage+=dealt;
    if (enemy.hp<=0) this.killEnemy(enemy,tower);
    return dealt;
  }

  killEnemy(enemy,tower) {
    if (enemy.dead) return;
    enemy.dead=true;
    const definition=ENEMIES[enemy.type];
    const reward=Math.max(0,Math.floor(definition.reward*this.difficulty.reward*this.quizRules.killGoldRate));
    this.state.gold+=reward;
    this.state.score+=Math.round((definition.reward*12+enemy.maxHp*.08)*this.difficulty.score);
    this.state.stats.kills++;
    if (tower) tower.kills++;
    this.removeEnemy(enemy);
    if (definition.ability==='split') {
      this.spawnEnemy('shard',{progress:Math.max(0,enemy.distance-10),pathIndex:enemy.pathIndex});
      this.spawnEnemy('shard',{progress:Math.max(0,enemy.distance+8),pathIndex:enemy.pathIndex});
    }
    this.emit('enemyKilled',{ enemyType:enemy.type,x:enemy.x,y:enemy.y,reward,boss:!!definition.boss });
  }

  removeEnemy(enemy) {
    const index=this.state.enemies.indexOf(enemy);
    if (index>=0) this.state.enemies.splice(index,1);
  }

  removeProjectile(projectile) {
    const index=this.state.projectiles.indexOf(projectile);
    if (index>=0) this.state.projectiles.splice(index,1);
  }

  finishWave() {
    if (this.state.wave>=this.state.maxWaves) {
      this.state.phase='won';
      const lifeBonus=this.state.lives*220;
      this.state.score=Math.floor((this.state.score+lifeBonus)*this.difficulty.score);
      this.emit('gameOver',{ won:true,wave:this.state.wave,score:this.state.score });
      return;
    }
    this.state.phase='build';
    this.state.buildCountdown=30;
    this.state.autoStartWaiting=false;
    const bonus=0;
    this.state.focus=clamp(this.state.focus+8,0,100);
    this.emit('waveComplete',{ wave:this.state.wave,bonus });
  }

  getBuildPreview(type,x,y) {
    return { ...this.canBuild(type,x,y),range:TOWERS[type]?.levels[0]?.range||0,x,y };
  }
}

function definitionBoss(enemy) {
  return !!ENEMIES[enemy.type]?.boss;
}
