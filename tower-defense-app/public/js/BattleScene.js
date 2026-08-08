import { ENEMIES, TOWERS, WORLD, towerStats } from './content.js?v=20260809-path-grid-1';
import { BOSS_ART, ENEMY_ART, MAP_ART, TOWER_ART } from './assets.js?v=20260802-1';
const MAP_SURFACES={
  starport:{outer:0x020a12,rail:0x3ad8d0,surface:0x1c2e3b,inner:0x263d4a},
  moonwood:{outer:0x06100f,rail:0x7ddf7a,surface:0x213833,inner:0x2c4740},
  embercore:{outer:0x100605,rail:0xff8b42,surface:0x382b2c,inner:0x493335},
};

const colorHex=color=>`#${color.toString(16).padStart(6,'0')}`;

export class BattleScene extends Phaser.Scene {
  constructor(simulation,hooks={}) {
    super({ key:'CrystalDefenseBattle' });
    this.sim=simulation;
    this.hooks=hooks;
    this.towerViews=new Map();
    this.enemyViews=new Map();
    this.projectileViews=new Map();
    this.selectedTowerId=null;
    this.placementType=null;
    this.abilityTarget=null;
    this.previewPoint={x:0,y:0,visible:false};
  }

  preload() {
    this.load.image(`td-map-${this.sim.map.id}`,MAP_ART[this.sim.map.id]);
    this.load.spritesheet(TOWER_ART.key,TOWER_ART.src,{frameWidth:TOWER_ART.frameWidth,frameHeight:TOWER_ART.frameHeight});
    this.load.spritesheet(ENEMY_ART.key,ENEMY_ART.src,{frameWidth:ENEMY_ART.frameWidth,frameHeight:ENEMY_ART.frameHeight});
    this.load.spritesheet(BOSS_ART.key,BOSS_ART.src,{frameWidth:BOSS_ART.frameWidth,frameHeight:BOSS_ART.frameHeight});
  }

  create() {
    this.cameras.main.setBackgroundColor(this.sim.map.palette.sky);
    this.createFxTextures();
    this.drawMap();
    this.weatherGraphics=this.add.graphics().setDepth(12);
    this.weather=this.createWeather();
    this.gridGraphics=this.add.graphics().setDepth(79);
    this.selectionGraphics=this.add.graphics().setDepth(80);
    this.previewGraphics=this.add.graphics().setDepth(82);
    this.placementSprite=this.add.sprite(0,0,TOWER_ART.key,0).setDepth(81).setAlpha(.62).setVisible(false).setDisplaySize(76,76);
    this.input.on('pointermove',pointer=>{
      this.previewPoint={x:pointer.worldX,y:pointer.worldY,visible:true};
      this.drawPlacementPreview();
    });
    this.input.on('pointerout',()=>{this.previewPoint.visible=false;this.drawPlacementPreview();});
    this.input.on('pointerdown',pointer=>this.handleWorldClick(pointer.worldX,pointer.worldY));
    this.events.on('shutdown',()=>this.cleanup());
    this.hooks.onReady?.(this);
  }

  createFxTextures() {
    if(this.textures.exists('td-soft-particle'))return;
    const g=this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0xffffff,.08).fillCircle(12,12,12);g.fillStyle(0xffffff,.18).fillCircle(12,12,8);g.fillStyle(0xffffff,.95).fillCircle(12,12,3);
    g.generateTexture('td-soft-particle',24,24);g.clear();
    g.fillStyle(0xffffff,1).fillPoints([{x:8,y:0},{x:15,y:12},{x:8,y:22},{x:1,y:12}],true);g.generateTexture('td-shard-particle',16,24);g.clear();
    g.fillStyle(0xffffff,.18).fillRoundedRect(0,2,32,8,4);g.fillStyle(0xffffff,1).fillRoundedRect(8,4,24,4,2);g.generateTexture('td-streak-particle',32,12);g.destroy();
    const snow=this.make.graphics({x:0,y:0,add:false});snow.lineStyle(2,0xffffff,1);snow.lineBetween(12,1,12,23);snow.lineBetween(2,6,22,18);snow.lineBetween(2,18,22,6);snow.lineStyle(1,0xffffff,.8);for(const angle of [0,Math.PI/3,Math.PI*2/3]){const dx=Math.cos(angle)*8,dy=Math.sin(angle)*8,nx=-Math.sin(angle)*3,ny=Math.cos(angle)*3;snow.lineBetween(12+dx,12+dy,12+dx*.65+nx,12+dy*.65+ny);snow.lineBetween(12-dx,12-dy,12-dx*.65-nx,12-dy*.65-ny);}snow.generateTexture('td-snowflake-particle',24,24);snow.destroy();
  }

  cleanup() {
    this.towerViews.clear();this.enemyViews.clear();this.projectileViews.clear();
  }

  setPlacement(type) {
    this.placementType=type&&TOWERS[type]?type:null;
    this.abilityTarget=null;this.selectedTowerId=null;
    this.drawSelection();this.drawPlacementGrid();this.drawPlacementPreview();
  }

  setAbilityTarget(id) {
    this.abilityTarget=id==='meteor'?id:null;
    this.placementType=null;this.selectedTowerId=null;
    this.drawSelection();this.drawPlacementGrid();this.drawPlacementPreview();
  }

  selectTower(id) {
    this.selectedTowerId=id;this.placementType=null;this.abilityTarget=null;
    this.drawSelection();this.drawPlacementGrid();this.drawPlacementPreview();
    const tower=this.sim.state.towers.find(item=>item.id===id)||null;
    this.hooks.onTowerSelected?.(tower);
  }

  handleWorldClick(x,y) {
    if(this.abilityTarget){
      const result=this.sim.useAbility(this.abilityTarget,x,y);this.hooks.onActionResult?.(result);
      if(result.ok)this.abilityTarget=null;this.drawPlacementPreview();return;
    }
    if(this.placementType){
      const point=this.snapToGrid(x,y);
      const result=this.sim.buildTower(this.placementType,point.x,point.y);this.hooks.onActionResult?.(result);
      if(result.ok)this.selectTower(result.tower.id);return;
    }
    const tower=[...this.sim.state.towers]
      .sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))
      .find(item=>Math.hypot(item.x-x,item.y-y)<38);
    this.selectTower(tower?.id||null);
  }

  update(_time,deltaMs) {
    this.sim.update(deltaMs/1000);
    this.syncTowers();this.syncEnemies();this.syncProjectiles();this.updateWeather(deltaMs/1000);
    const events=this.sim.drainEvents();
    for(const event of events){this.renderEvent(event);this.hooks.onEvent?.(event);}
    this.hooks.onState?.(this.sim.state);
    if(this.selectedTowerId&&!this.sim.state.towers.some(tower=>tower.id===this.selectedTowerId))this.selectTower(null);
    this.drawSelection();
  }

  drawMap() {
    const map=this.sim.map,p=map.palette;
    this.add.image(WORLD.width*.5,WORLD.height*.5,`td-map-${map.id}`).setDisplaySize(WORLD.width,WORLD.height).setDepth(0);
    const vignette=this.add.graphics().setDepth(1);
    vignette.fillStyle(0x02070d,.12).fillRect(0,0,WORLD.width,WORLD.height);
    const route=this.add.graphics().setDepth(4);this.drawPaths(route,map.paths,map.id);
    const pads=this.add.graphics().setDepth(5);for(const zone of map.noBuild)this.drawNoBuild(pads,zone,p);
    this.drawPortals(this.add.graphics().setDepth(8),map.paths,p);
  }

  drawPaths(g,paths,mapId) {
    const style=MAP_SURFACES[mapId];
    const segments=new Map(),nodes=new Map();
    const pointKey=point=>point.join(',');
    const segmentKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');
    for(const points of paths){
      for(let index=0;index<points.length-1;index++)segments.set(segmentKey(points[index],points[index+1]),[points[index],points[index+1]]);
      for(const point of points.slice(1,-1))nodes.set(pointKey(point),point);
    }
    const drawSegments=(width,color,alpha)=>{
      g.lineStyle(width,color,alpha);
      for(const [a,b] of segments.values())g.lineBetween(...a,...b);
      for(const [x,y] of nodes.values())g.fillStyle(color,alpha).fillCircle(x,y,width*.5);
    };
    drawSegments(WORLD.pathWidth+18,style.outer,.92);
    drawSegments(WORLD.pathWidth+11,style.rail,.58);
    drawSegments(WORLD.pathWidth+5,style.surface,.99);
    drawSegments(WORLD.pathWidth-5,style.inner,.98);
    const railOffset=WORLD.pathWidth*.34;
    for(const [a,b] of segments.values()){
      const [ax,ay]=a,[bx,by]=b,length=Math.hypot(bx-ax,by-ay)||1,dx=(bx-ax)/length,dy=(by-ay)/length,nx=-dy,ny=dx;
      g.lineStyle(2,style.rail,.34).lineBetween(ax+nx*railOffset,ay+ny*railOffset,bx+nx*railOffset,by+ny*railOffset).lineBetween(ax-nx*railOffset,ay-ny*railOffset,bx-nx*railOffset,by-ny*railOffset);
      for(let distance=32;distance<length;distance+=58){
        const x=ax+dx*distance,y=ay+dy*distance;
        g.lineStyle(2,style.rail,.20).lineBetween(x-nx*7,y-ny*7,x+nx*7,y+ny*7);
      }
    }
  }

  drawNoBuild(g,zone,p) {
    const {x,y,w,h}=zone;
    g.fillStyle(0x030b11,.28).fillRoundedRect(x,y,w,h,20);
    g.lineStyle(2,p.accent,.32).strokeRoundedRect(x+2,y+2,w-4,h-4,18);
    g.lineStyle(1,p.accent,.14).strokeRoundedRect(x+10,y+10,w-20,h-20,13);
    const cx=x+w*.5,cy=y+h*.5;
    g.lineStyle(2,p.accent,.18).strokeCircle(cx,cy,Math.min(w,h)*.22);
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI*.5){
      const dx=Math.cos(angle),dy=Math.sin(angle),radius=Math.min(w,h)*.32;
      g.lineBetween(cx+dx*(radius-8),cy+dy*(radius-8),cx+dx*radius,cy+dy*radius);
    }
  }

  drawPortals(g,paths,p) {
    for(const [pathIndex,points] of paths.entries()){
      const [rawSx,rawSy]=points[0],sx=Phaser.Math.Clamp(rawSx,-10,WORLD.width+10),sy=Phaser.Math.Clamp(rawSy,-10,WORLD.height+10);
      for(let index=0;index<4;index++)g.lineStyle(8-index*1.4,p.accent,.16+index*.14).strokeCircle(sx,sy,43-index*8);
      g.fillStyle(p.accent,.16).fillCircle(sx,sy,25);g.fillStyle(0xffffff,.72).fillCircle(sx,sy,5);
      g.lineStyle(2,0xffffff,.34).strokeCircle(sx,sy,48+pathIndex*2);
    }
    const [rawEx,rawEy]=paths[0].at(-1),ex=Math.min(WORLD.width-34,rawEx-34),ey=Phaser.Math.Clamp(rawEy,34,WORLD.height-34);
    g.fillStyle(0x03080e,.94).fillCircle(ex,ey,43);g.lineStyle(7,p.accent,.78).strokeCircle(ex,ey,37);g.lineStyle(2,0xffffff,.48).strokeCircle(ex,ey,29);
    g.fillStyle(p.accent,.9).fillPoints([{x:ex,y:ey-25},{x:ex+18,y:ey+12},{x:ex,y:ey+27},{x:ex-18,y:ey+12}],true);
    g.fillStyle(0xffffff,.55).fillTriangle(ex,ey-18,ex-4,ey+5,ex+5,ey-1);
  }

  createWeather() {
    return Array.from({length:64},(_,index)=>({x:(index*97)%WORLD.width,y:(index*53)%WORLD.height,speed:7+(index%9)*3,size:1+(index%3),phase:index*.7}));
  }

  updateWeather(dt) {
    const g=this.weatherGraphics,map=this.sim.map;g.clear();
    for(const mote of this.weather){
      mote.y-=mote.speed*dt;if(mote.y<-10){mote.y=WORLD.height+10;mote.x=(mote.x+173)%WORLD.width;}mote.phase+=dt;
      const alpha=.12+(Math.sin(mote.phase)*.5+.5)*.32,color=map.id==='embercore'?0xff7b35:map.id==='moonwood'?0x9cff78:0x79efff;
      if(map.id==='embercore'){g.lineStyle(mote.size,color,alpha).lineBetween(mote.x,mote.y,mote.x-3,mote.y+8);}
      else g.fillStyle(color,alpha).fillCircle(mote.x,mote.y,mote.size);
    }
  }

  syncTowers() {
    const ids=new Set(this.sim.state.towers.map(tower=>tower.id));
    for(const [id,view] of this.towerViews)if(!ids.has(id)){view.container.destroy();this.towerViews.delete(id);}
    for(const tower of this.sim.state.towers){
      let view=this.towerViews.get(tower.id);if(!view){view=this.createTowerView(tower);this.towerViews.set(tower.id,view);}
      view.container.setPosition(tower.x,tower.y);
      if(view.level!==tower.level){view.level=tower.level;this.styleTowerView(view,tower);}
      view.glow.setAlpha(.12+Math.sin(this.time.now*.004+Number(tower.id.slice(1)))*.035);
    }
  }

  createTowerView(tower) {
    const container=this.add.container(tower.x,tower.y).setDepth(30);
    const shadow=this.add.ellipse(3,20,66,24,0x000000,.42);
    const glow=this.add.image(0,1,'td-soft-particle').setTint(TOWERS[tower.type].color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(78,78).setAlpha(.14);
    const sprite=this.add.sprite(0,0,TOWER_ART.key,TOWER_ART.frames[tower.type]).setOrigin(.5,.53);
    const pips=this.add.graphics();container.add([shadow,glow,sprite,pips]);
    const view={container,shadow,glow,sprite,pips,level:0,baseScaleX:1,baseScaleY:1};this.styleTowerView(view,tower);return view;
  }

  styleTowerView(view,tower) {
    const color=TOWERS[tower.type].color,size=72+(tower.level-1)*4;
    view.sprite.setFrame(TOWER_ART.frames[tower.type]).setDisplaySize(size,size).clearTint();
    view.baseScaleX=view.sprite.scaleX;view.baseScaleY=view.sprite.scaleY;
    view.glow.setTint(color).setDisplaySize(size+18,size+18);
    view.pips.clear();for(let index=0;index<tower.level;index++)view.pips.fillStyle(index===tower.level-1?0xffffff:color,.95).fillCircle(-9+index*6,34,2.4);
  }

  animateTowerAttack(towerId,power=1) {
    const view=this.towerViews.get(towerId);if(!view)return;
    this.tweens.killTweensOf(view.sprite);
    const kick=Math.min(.12,.035+power*.018),rotation=(Math.random()-.5)*.055;
    this.tweens.add({targets:view.sprite,scaleX:view.baseScaleX*(1-kick),scaleY:view.baseScaleY*(1+kick*.55),rotation,duration:55,yoyo:true,ease:'Quad.Out',onComplete:()=>{if(view.sprite.active){view.sprite.setScale(view.baseScaleX,view.baseScaleY);view.sprite.rotation=0;}}});
    const tower=this.sim.state.towers.find(item=>item.id===towerId);if(tower)this.particleBurst(tower.x,tower.y-10,TOWERS[tower.type].color,3,{distance:18,duration:220,size:.35});
  }

  syncEnemies() {
    const ids=new Set(this.sim.state.enemies.map(enemy=>enemy.id));
    for(const [id,view] of this.enemyViews)if(!ids.has(id)){view.container.destroy();this.enemyViews.delete(id);}
    for(const enemy of this.sim.state.enemies){
      let view=this.enemyViews.get(enemy.id);if(!view){view=this.createEnemyView(enemy);this.enemyViews.set(enemy.id,view);}
      const definition=ENEMIES[enemy.type],idNumber=Number(enemy.id.slice(1))||0,phase=this.time.now*.006+idNumber;
      const bob=definition.air?Math.sin(phase*1.4)*6:Math.sin(phase)*1.7;
      view.container.setPosition(enemy.x,enemy.y+bob);
      const rolling=['splitter','shard'].includes(enemy.type)?phase*.8:0,lean=enemy.type==='runner'?Math.sin(phase*2)*.035:0;
      view.sprite.setRotation(enemy.angle+rolling+lean);
      const pulse=definition.boss?Math.sin(phase*.65)*.018:Math.sin(phase*1.3)*.026;
      view.sprite.setScale(view.baseScaleX*(1+pulse),view.baseScaleY*(1-pulse*.25));
      view.sprite.setAlpha(definition.stealth&&!this.sim.isRevealed(enemy)?.58:1);
      view.glow.setAlpha((definition.boss?.25:.12)+(Math.sin(phase)*.5+.5)*.05);
      view.snowflake.setVisible(enemy.slowTime>0||enemy.freezeTime>0).setRotation(-phase*.55).setAlpha(enemy.freezeTime>0?1:.62+Math.sin(phase*2)*.2);
      if(enemy.hp<view.lastHp-.5)this.flashEnemy(view,definition.color);view.lastHp=enemy.hp;
      const signature=`${Math.ceil(enemy.hp)}:${Math.ceil(enemy.shield)}:${enemy.slowTime>0}:${enemy.freezeTime>0}`;
      if(view.signature!==signature){view.signature=signature;this.drawEnemyStatus(view,enemy);}
    }
  }

  enemyTexture(type) {return BOSS_ART.frames[type]!==undefined?BOSS_ART.key:ENEMY_ART.key;}
  enemyFrame(type) {return BOSS_ART.frames[type]??ENEMY_ART.frames[type]??0;}

  createEnemyView(enemy) {
    const definition=ENEMIES[enemy.type],container=this.add.container(enemy.x,enemy.y).setDepth(definition.air?39:35);
    const displaySize=definition.boss?definition.size*3.25:definition.size*(definition.air?4.2:3.35);
    const shadow=this.add.ellipse(0,definition.size*.92,displaySize*.72,Math.max(10,displaySize*.20),0x000000,definition.air?.18:.42);
    const glow=this.add.image(0,0,'td-soft-particle').setTint(definition.color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(displaySize*.9,displaySize*.9).setAlpha(definition.boss?.26:.14);
    const sprite=this.add.sprite(0,0,this.enemyTexture(enemy.type),this.enemyFrame(enemy.type)).setDisplaySize(displaySize,displaySize);
    const snowflake=this.add.image(0,-displaySize*.42,'td-snowflake-particle').setTint(0xb8efff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(definition.boss?34:21,definition.boss?34:21).setVisible(false);
    const status=this.add.graphics();container.add([shadow,glow,sprite,snowflake,status]);
    const view={container,shadow,glow,sprite,snowflake,status,baseScaleX:sprite.scaleX,baseScaleY:sprite.scaleY,signature:'',lastHp:enemy.hp,displaySize};
    this.drawEnemyStatus(view,enemy);return view;
  }

  flashEnemy(view,color) {
    view.sprite.setTint(0xffeeee).setBlendMode(Phaser.BlendModes.ADD);view.container.x+=Math.random()*4-2;view.container.y+=Math.random()*4-2;
    this.time.delayedCall(65,()=>{if(view.sprite.active)view.sprite.clearTint().setBlendMode(Phaser.BlendModes.NORMAL);});
  }

  drawEnemyStatus(view,enemy) {
    const g=view.status,d=ENEMIES[enemy.type],half=view.displaySize*.43,width=d.boss?104:Math.max(34,view.displaySize*.76),y=-half-11;g.clear();
    g.fillStyle(0x02070c,.88).fillRoundedRect(-width*.5,y,width,7,3);g.fillStyle(enemy.hp/enemy.maxHp<.3?0xff536d:0x63e2a4,1).fillRoundedRect(-width*.5,y,width*Math.max(0,enemy.hp/enemy.maxHp),7,3);
    if(enemy.maxShield)g.lineStyle(2,0x91e6ff,enemy.shield>0?.9:.16).strokeCircle(0,0,half+4);
    if(enemy.slowTime>0)g.lineStyle(2,0x78d9ff,.9).strokeCircle(0,0,half+7);
    if(enemy.freezeTime>0)g.fillStyle(0xb9eeff,.22).fillCircle(0,0,half+5);
  }

  syncProjectiles() {
    const ids=new Set(this.sim.state.projectiles.map(projectile=>projectile.id));
    for(const [id,view] of this.projectileViews)if(!ids.has(id)){view.container.destroy();this.projectileViews.delete(id);}
    for(const projectile of this.sim.state.projectiles){
      let view=this.projectileViews.get(projectile.id);
      if(!view){view=this.createProjectileView(projectile);this.projectileViews.set(projectile.id,view);}
      const dx=projectile.x-view.lastX,dy=projectile.y-view.lastY;view.container.setPosition(projectile.x,projectile.y);
      if(Math.hypot(dx,dy)>.5)view.container.setRotation(Math.atan2(dy,dx));
      if(this.time.now-view.lastTrail>36){view.lastTrail=this.time.now;if(projectile.type==='rocket'){this.trailParticle(projectile.x,projectile.y,0xff7a35,16);this.smokeParticle(projectile.x,projectile.y);}else this.trailParticle(projectile.x,projectile.y,projectile.color,8);}
      view.lastX=projectile.x;view.lastY=projectile.y;
    }
  }

  createProjectileView(projectile) {
    const container=this.add.container(projectile.x,projectile.y).setDepth(60),large=projectile.type==='rocket'||projectile.type==='splash';
    const halo=this.add.image(0,0,'td-soft-particle').setTint(projectile.color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(large?30:20,large?30:20).setAlpha(.72);
    const core=this.add.image(large?1:4,0,large?'td-shard-particle':'td-streak-particle').setTint(projectile.color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(large?14:25,large?19:8);
    container.add([halo,core]);return{container,halo,core,lastX:projectile.x,lastY:projectile.y,lastTrail:0};
  }

  trailParticle(x,y,color,size=8) {
    const particle=this.add.image(x,y,'td-soft-particle').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(58).setDisplaySize(size,size).setAlpha(.62);
    this.tweens.add({targets:particle,alpha:0,scale:.15,duration:180,ease:'Quad.Out',onComplete:()=>particle.destroy()});
  }

  smokeParticle(x,y) {
    const particle=this.add.image(x,y,'td-soft-particle').setTint(0x73808c).setDepth(57).setDisplaySize(13,13).setAlpha(.42);
    this.tweens.add({targets:particle,y:y-5,alpha:0,scaleX:1.75,scaleY:1.75,duration:360,ease:'Quad.Out',onComplete:()=>particle.destroy()});
  }

  drawSelection() {
    const g=this.selectionGraphics;g.clear();const tower=this.sim.state.towers.find(item=>item.id===this.selectedTowerId);if(!tower)return;
    const stats=towerStats(tower),color=TOWERS[tower.type].color;
    g.fillStyle(color,.045).fillCircle(tower.x,tower.y,stats.range);g.lineStyle(2,color,.46).strokeCircle(tower.x,tower.y,stats.range);g.lineStyle(3,0xffffff,.9).strokeCircle(tower.x,tower.y,39);
  }

  snapToGrid(x,y) {
    const size=WORLD.gridSize;
    return {x:Math.floor(x/size)*size+size*.5,y:Math.floor(y/size)*size+size*.5};
  }

  setPlacementPointer(x,y,visible=true) {
    this.previewPoint={x,y,visible};
    this.drawPlacementPreview();
  }

  drawPlacementGrid() {
    const g=this.gridGraphics;g.clear();
    if(!this.placementType)return;
    const size=WORLD.gridSize,accent=this.sim.map.palette.accent;
    for(let top=0;top<WORLD.height;top+=size){
      for(let left=0;left<WORLD.width;left+=size){
        const x=left+size*.5,y=top+size*.5,valid=this.sim.canOccupy(x,y).ok;
        g.fillStyle(valid?accent:0xff5268,valid?.055:.012).fillRoundedRect(left+3,top+3,size-6,size-6,8);
        g.lineStyle(1,valid?accent:0xff5268,valid?.20:.055).strokeRoundedRect(left+3.5,top+3.5,size-7,size-7,8);
      }
    }
  }

  drawPlacementPreview() {
    const g=this.previewGraphics;g.clear();this.placementSprite?.setVisible(false);if(!this.previewPoint.visible)return;
    let {x,y}=this.previewPoint;
    if(this.abilityTarget){g.fillStyle(0xff744d,.10).fillCircle(x,y,150);g.lineStyle(3,0xffae62,.9).strokeCircle(x,y,150);g.lineStyle(2,0xffffff,.48).strokeCircle(x,y,25);g.lineBetween(x-17,y,x+17,y);g.lineBetween(x,y-17,x,y+17);return;}
    if(!this.placementType)return;
    ({x,y}=this.snapToGrid(x,y));
    const preview=this.sim.getBuildPreview(this.placementType,x,y),color=preview.ok?TOWERS[this.placementType].color:0xff5364;
    const size=WORLD.gridSize;
    g.fillStyle(color,preview.ok?.16:.24).fillRoundedRect(x-size*.5+4,y-size*.5+4,size-8,size-8,9);g.lineStyle(3,color,.9).strokeRoundedRect(x-size*.5+4,y-size*.5+4,size-8,size-8,9);
    g.fillStyle(color,.055).fillCircle(x,y,preview.range);g.lineStyle(2,color,.52).strokeCircle(x,y,preview.range);g.lineStyle(3,color,.95).strokeCircle(x,y,39);
    this.placementSprite.setFrame(TOWER_ART.frames[this.placementType]).setPosition(x,y).setTint(preview.ok?0xffffff:0xff5268).setVisible(true);
  }

  renderEvent(event) {
    if(event.type==='shot'){this.animateTowerAttack(event.towerId,event.towerType==='cannon'?2:1);}
    else if(event.type==='impact')this.impact(event);
    else if(event.type==='flame'){this.animateTowerAttack(event.towerId,.65);this.flameJet(event);}
    else if(event.type==='frostField'){this.animateTowerAttack(event.towerId,1.2);this.frostFieldEffect(event);}
    else if(event.type==='chain'){this.animateTowerAttack(event.towerId,1.4);this.energyLine(event.points,0xc9a0ff,5,.2);}
    else if(event.type==='beam'){this.animateTowerAttack(event.towerId,event.power);this.energyLine([event.from,event.to],0xff65c2,3+event.power,.13);}
    else if(event.type==='pulse'){this.animateTowerAttack(event.towerId,1.1);this.ring(event.x,event.y,event.range,0xffdf72,.36);this.particleBurst(event.x,event.y,0xffdf72,12,{distance:event.range*.55,duration:420,size:.42});}
    else if(event.type==='critical')this.floatText(event.x,event.y-20,'暴擊!',0xffe36a);
    else if(event.type==='heal'){this.floatText(event.x,event.y-24,'+',0x75f2a5);this.ring(event.x,event.y,48,0x69e9a4,.32);this.particleBurst(event.x,event.y,0x69e9a4,8,{distance:38,duration:420,size:.5});}
    else if(event.type==='shieldBreak'){this.ring(event.x,event.y,54,0x83ddff,.32);this.particleBurst(event.x,event.y,0x9feaff,14,{distance:54,duration:360,size:.55,shards:true});}
    else if(event.type==='enemyKilled')this.deathEffect(event);
    else if(event.type==='towerBuilt'){this.ring(event.x,event.y,50,TOWERS[event.towerType].color,.38);this.particleBurst(event.x,event.y,TOWERS[event.towerType].color,12,{distance:45,duration:430,size:.5});}
    else if(event.type==='towerUpgraded'){const view=this.towerViews.get(event.towerId);if(view)this.tweens.add({targets:view.sprite,scaleX:view.baseScaleX*1.16,scaleY:view.baseScaleY*1.16,duration:120,yoyo:true});this.ring(event.x,event.y,62,0xffe678,.45);this.particleBurst(event.x,event.y,0xffe678,20,{distance:68,duration:560,size:.58,shards:true});}
    else if(event.type==='ability')this.abilityEffect(event);
    else if(event.type==='bossPulse'){this.ring(event.x,event.y,125,0xff536d,.52);this.particleBurst(event.x,event.y,0xff536d,24,{distance:110,duration:620,size:.7});this.cameras.main.shake(180,.0035);}
  }

  impact(event) {
    const type=event.impactType||'bolt',splash=type==='splash'||type==='rocket',frost=type==='frost'||type==='frostField',color=event.color||0xffffff,radius=Math.max(20,event.radius||22);
    const flash=this.add.image(event.x,event.y,'td-soft-particle').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(74).setDisplaySize(splash?76:44,splash?76:44).setAlpha(.95);
    this.tweens.add({targets:flash,scale:splash?1.8:1.35,alpha:0,duration:splash?360:220,ease:'Quad.Out',onComplete:()=>flash.destroy()});
    this.ring(event.x,event.y,splash?radius*1.2:radius*.9,color,splash?.42:.24);
    this.particleBurst(event.x,event.y,color,splash?28:frost?18:12,{distance:splash?radius*1.3:44,duration:splash?520:340,size:splash?.72:.48,shards:splash||frost});
    if(splash)this.cameras.main.shake(120,.0028);
  }

  flameJet(event) {
    const spread=event.width||.5;
    const left=event.angle-spread*.5,right=event.angle+spread*.5,cone=this.add.graphics().setDepth(72).setBlendMode(Phaser.BlendModes.ADD);
    cone.fillStyle(0xff6b2f,.13).fillTriangle(event.from.x,event.from.y,event.from.x+Math.cos(left)*event.range,event.from.y+Math.sin(left)*event.range,event.from.x+Math.cos(right)*event.range,event.from.y+Math.sin(right)*event.range);
    cone.lineStyle(2,0xffc25f,.34).lineBetween(event.from.x,event.from.y,event.from.x+Math.cos(left)*event.range,event.from.y+Math.sin(left)*event.range).lineBetween(event.from.x,event.from.y,event.from.x+Math.cos(right)*event.range,event.from.y+Math.sin(right)*event.range);
    this.tweens.add({targets:cone,alpha:0,duration:190,ease:'Quad.Out',onComplete:()=>cone.destroy()});
    for(let index=0;index<6;index++){
      const angle=event.angle+(Math.random()-.5)*spread,distance=event.range*(.62+Math.random()*.38),color=index%3===0?0xfff0a3:index%2===0?0xff9b3d:0xff4f2f;
      const particle=this.add.image(event.from.x+Math.cos(angle)*20,event.from.y+Math.sin(angle)*20,index%2?'td-streak-particle':'td-soft-particle').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(75).setDisplaySize(20+Math.random()*14,10+Math.random()*13).setRotation(angle).setAlpha(.9);
      this.tweens.add({targets:particle,x:event.from.x+Math.cos(angle)*distance,y:event.from.y+Math.sin(angle)*distance,alpha:0,scaleX:particle.scaleX*1.65,scaleY:particle.scaleY*.45,duration:170+Math.random()*120,ease:'Cubic.Out',onComplete:()=>particle.destroy()});
    }
  }

  frostFieldEffect(event) {
    this.ring(event.x,event.y,event.radius,0x87ddff,.48);
    const haze=this.add.image(event.x,event.y,'td-soft-particle').setTint(0x8bdfff).setBlendMode(Phaser.BlendModes.ADD).setDepth(70).setDisplaySize(event.radius*1.4,event.radius*1.4).setAlpha(.34);
    this.tweens.add({targets:haze,scaleX:1.55,scaleY:1.55,alpha:0,duration:520,ease:'Quad.Out',onComplete:()=>haze.destroy()});
    for(let index=0;index<16;index++){
      const angle=index/16*Math.PI*2+Math.random()*.25,distance=event.radius*(.28+Math.random()*.78),flake=this.add.image(event.x,event.y,'td-snowflake-particle').setTint(index%3?0xbaf3ff:0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(77).setScale(.38+Math.random()*.38).setRotation(angle).setAlpha(.92);
      this.tweens.add({targets:flake,x:event.x+Math.cos(angle)*distance,y:event.y+Math.sin(angle)*distance,rotation:angle+(index%2?2:-2),alpha:0,scaleX:flake.scaleX*.35,scaleY:flake.scaleY*.35,duration:430+Math.random()*260,ease:'Quad.Out',onComplete:()=>flake.destroy()});
    }
  }

  ring(x,y,radius,color,duration=.3) {
    const ring=this.add.graphics().setDepth(73);ring.lineStyle(7,color,.18).strokeCircle(0,0,12);ring.lineStyle(2,0xffffff,.72).strokeCircle(0,0,10);ring.setPosition(x,y).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({targets:ring,scale:radius/12,alpha:0,duration:duration*1000,ease:'Cubic.Out',onComplete:()=>ring.destroy()});
  }

  energyLine(points,color,width,duration) {
    if(points.length<2)return;const g=this.add.graphics().setDepth(74).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(width+10,color,.12);for(let index=0;index<points.length-1;index++)g.lineBetween(points[index].x,points[index].y,points[index+1].x,points[index+1].y);
    g.lineStyle(width+3,0xffffff,.34);for(let index=0;index<points.length-1;index++)g.lineBetween(points[index].x,points[index].y,points[index+1].x,points[index+1].y);
    g.lineStyle(width,color,1);for(let index=0;index<points.length-1;index++){
      const a=points[index],b=points[index+1];g.lineBetween(a.x,a.y,b.x,b.y);
      for(let spark=1;spark<=3;spark++){const ratio=spark/4,x=a.x+(b.x-a.x)*ratio,y=a.y+(b.y-a.y)*ratio;this.trailParticle(x,y,color,8+spark*2);}
    }
    this.tweens.add({targets:g,alpha:0,duration:duration*1000,onComplete:()=>g.destroy()});
  }

  particleBurst(x,y,color,count=12,{distance=44,duration=380,size=.55,shards=false}={}) {
    for(let index=0;index<count;index++){
      const angle=index/count*Math.PI*2+(Math.random()-.5)*.35,length=distance*(.42+Math.random()*.75),texture=shards&&index%2===0?'td-shard-particle':'td-soft-particle';
      const particle=this.add.image(x,y,texture).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(76).setAlpha(.72+Math.random()*.28).setScale(size*(.45+Math.random()*.8)).setRotation(angle);
      this.tweens.add({targets:particle,x:x+Math.cos(angle)*length,y:y+Math.sin(angle)*length,alpha:0,scaleX:particle.scaleX*.15,scaleY:particle.scaleY*.15,rotation:angle+(Math.random()-.5)*2,duration:duration*(.7+Math.random()*.65),ease:'Quad.Out',onComplete:()=>particle.destroy()});
    }
  }

  deathEffect(event) {
    const definition=ENEMIES[event.enemyType],boss=!!event.boss,texture=this.enemyTexture(event.enemyType),frame=this.enemyFrame(event.enemyType),size=definition?(boss?definition.size*3.25:definition.size*(definition.air?4.2:3.35)):(boss?145:54);
    const ghost=this.add.sprite(event.x,event.y,texture,frame).setDisplaySize(size,size).setDepth(72).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({targets:ghost,alpha:0,scaleX:ghost.scaleX*(boss?1.38:.68),scaleY:ghost.scaleY*(boss?1.38:.68),rotation:(Math.random()-.5)*(boss?.7:1.5),duration:boss?720:360,ease:'Quad.Out',onComplete:()=>ghost.destroy()});
    this.particleBurst(event.x,event.y,definition?.color||0xff92b6,boss?42:14,{distance:boss?110:48,duration:boss?760:420,size:boss?.85:.55,shards:true});
    if(boss){this.ring(event.x,event.y,145,0xffffff,.7);this.cameras.main.shake(380,.008);}
  }

  floatText(x,y,text,color) {
    const label=this.add.text(x,y,text,{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:colorHex(color),stroke:'#07101b',strokeThickness:4}).setOrigin(.5).setDepth(90);
    this.tweens.add({targets:label,y:y-38,alpha:0,scale:1.16,duration:700,ease:'Quad.Out',onComplete:()=>label.destroy()});
  }

  abilityEffect(event) {
    if(event.id==='meteor'){
      const startX=event.x-260,startY=event.y-260,meteor=this.add.container(startX,startY).setDepth(95),halo=this.add.image(0,0,'td-soft-particle').setTint(0xff623f).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(76,76),core=this.add.image(0,0,'td-shard-particle').setTint(0xffd36b).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(28,44).setRotation(-.75);meteor.add([halo,core]);
      this.tweens.add({targets:meteor,x:event.x,y:event.y,duration:420,ease:'Quad.In',onUpdate:()=>this.trailParticle(meteor.x-12,meteor.y-12,0xff6d45,18),onComplete:()=>{meteor.destroy();this.ring(event.x,event.y,170,0xff8a55,.62);this.particleBurst(event.x,event.y,0xff8a55,54,{distance:170,duration:780,size:.9,shards:true});const flash=this.add.circle(event.x,event.y,90,0xffe7b0,.55).setDepth(94);this.tweens.add({targets:flash,scale:2.1,alpha:0,duration:420,onComplete:()=>flash.destroy()});this.cameras.main.shake(340,.012);}});
    }else if(event.id==='stasis'){
      const overlay=this.add.rectangle(WORLD.width*.5,WORLD.height*.5,WORLD.width,WORLD.height,0x75cfff,.18).setDepth(91).setBlendMode(Phaser.BlendModes.ADD);this.tweens.add({targets:overlay,alpha:0,duration:1100,onComplete:()=>overlay.destroy()});
      for(const enemy of this.sim.state.enemies){this.ring(enemy.x,enemy.y,42,0xa7edff,.42);this.particleBurst(enemy.x,enemy.y,0xa7edff,5,{distance:30,duration:520,size:.38,shards:true});}
    }else if(event.id==='overdrive'){
      for(const tower of this.sim.state.towers){this.ring(tower.x,tower.y,58,0xffe36a,.38);this.particleBurst(tower.x,tower.y,0xffe36a,10,{distance:50,duration:500,size:.45});}
    }
  }
}
