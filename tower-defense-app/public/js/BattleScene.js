import { ENEMIES, MAPS, TOWERS, WORLD, distanceToPath, towerStats } from './content.js';

const brighten=(color,amount=24)=>{
  const r=Math.min(255,(color>>16)+amount),g=Math.min(255,((color>>8)&255)+amount),b=Math.min(255,(color&255)+amount);
  return (r<<16)|(g<<8)|b;
};

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

  create() {
    this.cameras.main.setBackgroundColor(this.sim.map.palette.sky);
    this.drawMap();
    this.weatherGraphics=this.add.graphics().setDepth(2);
    this.weather=this.createWeather();
    this.selectionGraphics=this.add.graphics().setDepth(80);
    this.previewGraphics=this.add.graphics().setDepth(82);
    this.input.on('pointermove',pointer=>{
      this.previewPoint={x:pointer.worldX,y:pointer.worldY,visible:true};
      this.drawPlacementPreview();
    });
    this.input.on('pointerout',()=>{this.previewPoint.visible=false;this.drawPlacementPreview();});
    this.input.on('pointerdown',pointer=>this.handleWorldClick(pointer.worldX,pointer.worldY));
    this.events.on('shutdown',()=>this.cleanup());
    this.hooks.onReady?.(this);
  }

  cleanup() {
    this.towerViews.clear();this.enemyViews.clear();this.projectileViews.clear();
  }

  setPlacement(type) {
    this.placementType=type&&TOWERS[type]?type:null;
    this.abilityTarget=null;
    this.selectedTowerId=null;
    this.drawSelection();this.drawPlacementPreview();
  }

  setAbilityTarget(id) {
    this.abilityTarget=id==='meteor'?id:null;
    this.placementType=null;
    this.selectedTowerId=null;
    this.drawSelection();this.drawPlacementPreview();
  }

  selectTower(id) {
    this.selectedTowerId=id;
    this.placementType=null;
    this.abilityTarget=null;
    this.drawSelection();this.drawPlacementPreview();
    const tower=this.sim.state.towers.find(item=>item.id===id)||null;
    this.hooks.onTowerSelected?.(tower);
  }

  handleWorldClick(x,y) {
    if (this.abilityTarget) {
      const result=this.sim.useAbility(this.abilityTarget,x,y);
      this.hooks.onActionResult?.(result);
      if (result.ok) this.abilityTarget=null;
      this.drawPlacementPreview();
      return;
    }
    if (this.placementType) {
      const result=this.sim.buildTower(this.placementType,x,y);
      this.hooks.onActionResult?.(result);
      if (result.ok) this.selectTower(result.tower.id);
      return;
    }
    const tower=[...this.sim.state.towers]
      .sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))
      .find(item=>Math.hypot(item.x-x,item.y-y)<32);
    this.selectTower(tower?.id||null);
  }

  update(_time,deltaMs) {
    this.sim.update(deltaMs/1000);
    this.syncTowers();this.syncEnemies();this.syncProjectiles();this.updateWeather(deltaMs/1000);
    const events=this.sim.drainEvents();
    for (const event of events) { this.renderEvent(event);this.hooks.onEvent?.(event); }
    this.hooks.onState?.(this.sim.state);
    if (this.selectedTowerId&&!this.sim.state.towers.some(tower=>tower.id===this.selectedTowerId)) this.selectTower(null);
    this.drawSelection();
  }

  drawMap() {
    const map=this.sim.map,p=map.palette;
    const g=this.add.graphics().setDepth(0);
    g.fillStyle(p.sky,1).fillRect(0,0,WORLD.width,WORLD.height);
    g.fillStyle(p.ground,1).fillRoundedRect(18,22,WORLD.width-36,WORLD.height-40,36);
    for (let row=0;row<14;row++) for (let col=0;col<25;col++) {
      const x=38+col*52+(row%2)*18,y=48+row*49;
      const alpha=.025+((col*13+row*7)%5)*.008;
      g.fillStyle(brighten(p.ground2,(col+row)%3*8),alpha).fillCircle(x,y,14+((col*5+row*3)%11));
    }
    if (map.id==='starport') {
      g.fillStyle(p.water,.42).fillRoundedRect(505,232,176,210,38);
      for(let y=248;y<430;y+=20)g.lineStyle(2,brighten(p.water,35),.2).lineBetween(520,y,666,y+7);
    } else if (map.id==='moonwood') {
      g.fillStyle(p.water,.58).fillEllipse(95,315,178,140);
      g.lineStyle(3,brighten(p.water,32),.35).strokeEllipse(95,315,150,112);
    } else {
      g.fillStyle(p.water,.75).fillRoundedRect(505,330,122,140,35);
      for(let y=345;y<458;y+=22)g.lineStyle(5,0xff7843,.3).lineBetween(520,y,612,y-8);
    }
    this.drawPath(g,map.path,p);
    for (const zone of map.noBuild) this.drawNoBuild(g,zone,p,map.id);
    for (const [x,y,kind] of map.decor) this.drawDecor(g,x,y,kind,p);
    this.drawPortals(g,map.path,p);
  }

  drawPath(g,points,p) {
    g.lineStyle(WORLD.pathWidth+14,p.edge,.34);
    for(let i=0;i<points.length-1;i++)g.lineBetween(...points[i],...points[i+1]);
    g.lineStyle(WORLD.pathWidth,p.path,1);
    for(let i=0;i<points.length-1;i++)g.lineBetween(...points[i],...points[i+1]);
    for(const [x,y] of points.slice(1,-1))g.fillStyle(p.path,1).fillCircle(x,y,WORLD.pathWidth*.5);
    g.lineStyle(2,p.edge,.25);
    for(let i=0;i<points.length-1;i++){
      const [ax,ay]=points[i],[bx,by]=points[i+1],len=Math.hypot(bx-ax,by-ay),dx=(bx-ax)/(len||1),dy=(by-ay)/(len||1);
      for(let d=30;d<len;d+=58){const x=ax+dx*d,y=ay+dy*d;g.lineBetween(x-dy*8,y+dx*8,x+dy*8,y-dx*8);}
    }
  }

  drawNoBuild(g,zone,p,mapId) {
    const x=zone.x,y=zone.y,w=zone.w,h=zone.h;
    if (['pond','lava'].includes(zone.kind)) {
      g.fillStyle(mapId==='embercore'?0xef5034:p.water,.72).fillEllipse(x+w/2,y+h/2,w,h);
      g.lineStyle(4,p.accent,.25).strokeEllipse(x+w/2,y+h/2,w-12,h-12);
      return;
    }
    g.fillStyle(0x09121f,.32).fillRoundedRect(x+5,y+8,w,h,18);
    g.fillStyle(brighten(p.ground2,18),.95).fillRoundedRect(x,y,w,h,18);
    g.lineStyle(3,p.accent,.35).strokeRoundedRect(x,y,w,h,18);
    if(zone.kind==='tree')this.drawDecor(g,x+w/2,y+h/2,'tree',p,1.35);
    else if(zone.kind==='gear')this.drawDecor(g,x+w/2,y+h/2,'gear',p,1.2);
    else if(zone.kind==='ruin')this.drawDecor(g,x+w/2,y+h/2,'ruin',p,1.2);
    else {
      g.fillStyle(0x101d2c,.72).fillRect(x+18,y+22,w-36,h-40);
      g.fillStyle(p.accent,.5).fillRect(x+26,y+30,w-52,10);
    }
  }

  drawDecor(g,x,y,kind,p,scale=1) {
    g.fillStyle(0x050c14,.25).fillEllipse(x+4,y+12,56*scale,20*scale);
    if(kind==='crystal'){
      g.fillStyle(p.accent,.88).fillTriangle(x,y-28*scale,x-15*scale,y+18*scale,x+13*scale,y+14*scale);
      g.fillStyle(0xffffff,.28).fillTriangle(x,y-24*scale,x-3*scale,y+4*scale,x+4*scale,y-2*scale);
    } else if(kind==='tree'){
      g.fillStyle(0x503728,1).fillRoundedRect(x-7*scale,y-4*scale,14*scale,35*scale,5);
      g.fillStyle(0x3e875b,1).fillCircle(x,y-18*scale,30*scale);g.fillStyle(0x6abd65,.7).fillCircle(x-16*scale,y-13*scale,18*scale);
    } else if(kind==='mushroom'){
      g.fillStyle(0xe8d7b9,1).fillRoundedRect(x-5*scale,y,10*scale,22*scale,4);g.fillStyle(0xd96cb5,1).fillEllipse(x,y,36*scale,22*scale);
      g.fillStyle(0xffffff,.6).fillCircle(x-7*scale,y-3*scale,3*scale);
    } else if(kind==='gear'){
      g.lineStyle(8,0x7d6a63,.9).strokeCircle(x,y,22*scale);g.fillStyle(0x302a2d,1).fillCircle(x,y,8*scale);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;g.fillStyle(0xa5795f,1).fillRect(x+Math.cos(a)*26*scale-4,y+Math.sin(a)*26*scale-4,8,8);}
    } else if(kind==='antenna'){
      g.lineStyle(4,0x8da8b3,.8).lineBetween(x,y+25*scale,x,y-22*scale);g.lineStyle(3,p.accent,.65).strokeCircle(x,y-25*scale,10*scale);
    } else if(kind==='ship'){
      g.fillStyle(0x344d61,.9).fillTriangle(x-44*scale,y,x+43*scale,y-8*scale,x+22*scale,y+23*scale);g.fillStyle(p.accent,.65).fillRect(x-10*scale,y-12*scale,30*scale,8*scale);
    } else if(kind==='ruin'){
      g.fillStyle(0x71816e,.75).fillRect(x-25*scale,y-20*scale,16*scale,45*scale);g.fillRect(x+8*scale,y-30*scale,18*scale,55*scale);g.fillStyle(p.accent,.35).fillRect(x-30*scale,y-25*scale,60*scale,8*scale);
    } else if(kind==='pipe'){
      g.lineStyle(12,0x6f5b59,.9).lineBetween(x-32*scale,y+15*scale,x+25*scale,y-15*scale);g.lineStyle(3,p.accent,.3).lineBetween(x-30*scale,y+10*scale,x+23*scale,y-18*scale);
    } else if(kind==='forge'||kind==='crate'){
      g.fillStyle(kind==='forge'?0x68443d:0x806047,.9).fillRoundedRect(x-27*scale,y-23*scale,54*scale,46*scale,7);g.lineStyle(3,p.accent,.35).strokeRoundedRect(x-27*scale,y-23*scale,54*scale,46*scale,7);
      g.lineBetween(x-22*scale,y-18*scale,x+22*scale,y+18*scale);g.lineBetween(x+22*scale,y-18*scale,x-22*scale,y+18*scale);
    }
  }

  drawPortals(g,points,p) {
    const [sx,sy]=points[0],[ex,ey]=points.at(-1);
    for(let i=0;i<3;i++){g.lineStyle(5-i,p.accent,.28+i*.18).strokeCircle(sx+28,sy,34-i*8);}
    g.fillStyle(0x07111c,.92).fillCircle(ex-34,ey,37);g.lineStyle(6,p.accent,.75).strokeCircle(ex-34,ey,33);
    g.fillStyle(p.accent,.85).fillPoints([{x:ex-34,y:ey-25},{x:ex-51,y:ey+12},{x:ex-34,y:ey+25},{x:ex-17,y:ey+12}],true);
  }

  createWeather() {
    return Array.from({length:48},(_,index)=>({
      x:(index*97)%WORLD.width,y:(index*53)%WORLD.height,speed:8+(index%7)*3,size:1+(index%3),phase:index*.7,
    }));
  }

  updateWeather(dt) {
    const g=this.weatherGraphics,map=this.sim.map;g.clear();
    for(const mote of this.weather){
      mote.y-=mote.speed*dt;if(mote.y<-8){mote.y=WORLD.height+8;mote.x=(mote.x+173)%WORLD.width;}
      mote.phase+=dt;
      const alpha=.16+(Math.sin(mote.phase)*.5+.5)*.28;
      const color=map.id==='embercore'?0xff874a:map.id==='moonwood'?0xb7ff7c:0xa6ebff;
      g.fillStyle(color,alpha).fillCircle(mote.x,mote.y,mote.size);
    }
  }

  syncTowers() {
    const ids=new Set(this.sim.state.towers.map(tower=>tower.id));
    for(const [id,view] of this.towerViews)if(!ids.has(id)){view.container.destroy();this.towerViews.delete(id);}
    for(const tower of this.sim.state.towers){
      let view=this.towerViews.get(tower.id);
      if(!view){view=this.createTowerView(tower);this.towerViews.set(tower.id,view);}
      view.container.setPosition(tower.x,tower.y);view.turret.setRotation(tower.rotation);
      if(view.level!==tower.level){view.level=tower.level;this.drawTowerBody(view,tower);}
    }
  }

  createTowerView(tower) {
    const container=this.add.container(tower.x,tower.y).setDepth(30);
    const shadow=this.add.ellipse(3,15,48,19,0x03070b,.28);
    const base=this.add.graphics(),turret=this.add.graphics(),pips=this.add.graphics();
    container.add([shadow,base,turret,pips]);
    const view={container,base,turret,pips,level:0};this.drawTowerBody(view,tower);return view;
  }

  drawTowerBody(view,tower) {
    const definition=TOWERS[tower.type],color=definition.color,level=tower.level;
    view.base.clear();view.turret.clear();view.pips.clear();
    view.base.fillStyle(0x132236,1).fillPoints([{x:-23,y:0},{x:-12,y:-18},{x:12,y:-18},{x:23,y:0},{x:13,y:19},{x:-13,y:19}],true);
    view.base.lineStyle(3,color,.8).strokeCircle(0,0,18);view.base.fillStyle(brighten(color,18),.22).fillCircle(0,0,16);
    if(tower.type==='bolt'){
      view.turret.lineStyle(5,color,1).lineBetween(-4,0,23,0);view.turret.fillStyle(0xe9fff9,1).fillTriangle(27,0,16,-7,16,7);view.turret.fillCircle(-4,0,8);
    }else if(tower.type==='cannon'){
      view.turret.fillStyle(color,1).fillRoundedRect(-6,-7,31,14,5);view.turret.fillStyle(0x29313b,1).fillCircle(-5,0,12);view.turret.lineStyle(3,0xffe4b8,.45).strokeCircle(-5,0,8);
    }else if(tower.type==='frost'){
      view.turret.fillStyle(color,.9).fillPoints([{x:0,y:-22},{x:7,y:-7},{x:22,y:0},{x:7,y:7},{x:0,y:22},{x:-7,y:7},{x:-22,y:0},{x:-7,y:-7}],true);view.turret.fillStyle(0xffffff,.8).fillCircle(0,0,6);
    }else if(tower.type==='storm'){
      view.turret.lineStyle(5,color,.9).lineBetween(-14,13,0,-16);view.turret.lineBetween(0,-16,14,13);view.turret.fillStyle(0xffffff,.9).fillCircle(0,-16,5);view.turret.fillStyle(color,.7).fillCircle(-14,13,6);view.turret.fillCircle(14,13,6);
    }else if(tower.type==='prism'){
      view.turret.fillStyle(color,.86).fillPoints([{x:0,y:-24},{x:15,y:0},{x:0,y:24},{x:-15,y:0}],true);view.turret.fillStyle(0xffffff,.55).fillTriangle(0,-18,0,4,9,0);
    }else{
      view.turret.lineStyle(5,color,.8).strokeCircle(0,0,15);view.turret.fillStyle(color,.85).fillCircle(0,0,7);view.turret.lineStyle(2,0xffffff,.65).strokeCircle(0,0,23);
    }
    for(let i=0;i<level;i++)view.pips.fillStyle(i===level-1?0xffffff:color,.9).fillCircle(-9+i*6,27,2.3);
  }

  syncEnemies() {
    const ids=new Set(this.sim.state.enemies.map(enemy=>enemy.id));
    for(const [id,view] of this.enemyViews)if(!ids.has(id)){view.container.destroy();this.enemyViews.delete(id);}
    for(const enemy of this.sim.state.enemies){
      let view=this.enemyViews.get(enemy.id);
      if(!view){view=this.createEnemyView(enemy);this.enemyViews.set(enemy.id,view);}
      const definition=ENEMIES[enemy.type],bob=definition.air?Math.sin(this.time.now*.008+Number(enemy.id.slice(1)))*6:0;
      view.container.setPosition(enemy.x,enemy.y+bob);view.body.setRotation(enemy.angle+(definition.air?0:Math.PI*.5));
      const signature=`${Math.ceil(enemy.hp)}:${Math.ceil(enemy.shield)}:${enemy.slowTime>0}:${enemy.freezeTime>0}`;
      if(view.signature!==signature){view.signature=signature;this.drawEnemyStatus(view,enemy);}
    }
  }

  createEnemyView(enemy) {
    const definition=ENEMIES[enemy.type],container=this.add.container(enemy.x,enemy.y).setDepth(35);
    const shadow=this.add.ellipse(0,definition.size*.75,definition.size*2.2,definition.size*.72,0x03060b,.28);
    const body=this.add.graphics(),status=this.add.graphics();container.add([shadow,body,status]);
    this.drawEnemyBody(body,definition);const view={container,body,status,signature:''};this.drawEnemyStatus(view,enemy);return view;
  }

  drawEnemyBody(g,d) {
    const s=d.size,c=d.color;g.clear();
    if(d.boss){
      g.fillStyle(0x150f19,1).fillCircle(0,0,s+7);g.lineStyle(5,c,.9).strokeCircle(0,0,s);
      for(let i=0;i<8;i++){const a=i*Math.PI/4;g.fillStyle(c,.85).fillTriangle(Math.cos(a)*(s+2),Math.sin(a)*(s+2),Math.cos(a-.16)*(s+15),Math.sin(a-.16)*(s+15),Math.cos(a+.16)*(s+15),Math.sin(a+.16)*(s+15));}
      g.fillStyle(brighten(c,45),1).fillCircle(0,0,s*.56);g.fillStyle(0xffffff,.8).fillCircle(s*.15,-s*.12,s*.13);return;
    }
    if(d.air){
      g.fillStyle(c,.75).fillEllipse(-s*.8,0,s*1.25,s*.65);g.fillEllipse(s*.8,0,s*1.25,s*.65);g.fillStyle(c,1).fillPoints([{x:0,y:-s},{x:s*.72,y:0},{x:0,y:s},{x:-s*.72,y:0}],true);g.fillStyle(0xffffff,.7).fillCircle(0,0,3);return;
    }
    if(d.id==='runner'){
      g.fillStyle(c,1).fillTriangle(0,-s,s*.95,s*.65,-s*.9,s*.7);g.fillStyle(0x2d1b24,1).fillCircle(-s*.15,0,s*.28);
    }else if(d.id==='guard'||d.id==='shielder'){
      g.fillStyle(c,1).fillRoundedRect(-s,-s*.8,s*2,s*1.6,6);g.lineStyle(4,0xdce9f4,.45).strokeRoundedRect(-s,-s*.8,s*2,s*1.6,6);g.fillStyle(0x172332,1).fillRect(-s*.48,-4,s*.96,8);
    }else if(d.id==='medic'){
      g.fillStyle(c,1).fillCircle(0,0,s);g.fillStyle(0xffffff,.8).fillRect(-3,-s*.55,6,s*1.1);g.fillRect(-s*.55,-3,s*1.1,6);
    }else if(d.id==='splitter'||d.id==='shard'){
      g.fillStyle(c,1).fillPoints([{x:0,y:-s},{x:s,y:-s*.2},{x:s*.55,y:s},{x:-s*.55,y:s},{x:-s,y:-s*.2}],true);g.lineStyle(2,0xffffff,.4).lineBetween(-s*.3,-s*.6,s*.25,s*.7);
    }else if(d.id==='phantom'){
      g.fillStyle(c,.62).fillCircle(0,0,s);g.lineStyle(3,0xffffff,.45).strokeCircle(0,0,s-3);g.fillStyle(0x251b38,.8).fillCircle(-5,-2,3);g.fillCircle(5,-2,3);
    }else{
      g.fillStyle(c,1).fillCircle(0,0,s);g.fillStyle(brighten(c,55),.7).fillCircle(-s*.28,-s*.3,s*.35);g.fillStyle(0x321526,1).fillCircle(s*.25,-2,3);
    }
  }

  drawEnemyStatus(view,enemy) {
    const g=view.status,d=ENEMIES[enemy.type],s=d.size;g.clear();
    const width=d.boss?74:Math.max(30,s*2.2),y=-s-14;
    g.fillStyle(0x07101b,.82).fillRoundedRect(-width/2,y,width,6,3);g.fillStyle(enemy.hp/enemy.maxHp<.3?0xff5f6d:0x70e39a,1).fillRoundedRect(-width/2,y,width*Math.max(0,enemy.hp/enemy.maxHp),6,3);
    if(enemy.maxShield){g.lineStyle(2,0x8edcff,enemy.shield>0?.9:.18).strokeCircle(0,0,s+5);}
    if(enemy.slowTime>0)g.lineStyle(2,0x7bd9ff,.8).strokeCircle(0,0,s+8);
    if(enemy.freezeTime>0)g.fillStyle(0xc8f4ff,.28).fillCircle(0,0,s+5);
  }

  syncProjectiles() {
    const ids=new Set(this.sim.state.projectiles.map(projectile=>projectile.id));
    for(const [id,view] of this.projectileViews)if(!ids.has(id)){view.destroy();this.projectileViews.delete(id);}
    for(const projectile of this.sim.state.projectiles){
      let view=this.projectileViews.get(projectile.id);
      if(!view){view=this.add.graphics().setDepth(60);view.fillStyle(projectile.color,1).fillCircle(0,0,projectile.type==='splash'?7:4);view.lineStyle(2,0xffffff,.65).strokeCircle(0,0,projectile.type==='splash'?7:4);this.projectileViews.set(projectile.id,view);}
      view.setPosition(projectile.x,projectile.y);
    }
  }

  drawSelection() {
    const g=this.selectionGraphics;g.clear();
    const tower=this.sim.state.towers.find(item=>item.id===this.selectedTowerId);
    if(!tower)return;
    const stats=towerStats(tower),color=TOWERS[tower.type].color;
    g.fillStyle(color,.055).fillCircle(tower.x,tower.y,stats.range);g.lineStyle(2,color,.38).strokeCircle(tower.x,tower.y,stats.range);g.lineStyle(3,0xffffff,.85).strokeCircle(tower.x,tower.y,27);
  }

  drawPlacementPreview() {
    const g=this.previewGraphics;g.clear();if(!this.previewPoint.visible)return;
    const {x,y}=this.previewPoint;
    if(this.abilityTarget){g.fillStyle(0xff7a67,.09).fillCircle(x,y,150);g.lineStyle(3,0xffaa73,.85).strokeCircle(x,y,150);g.lineBetween(x-12,y,x+12,y);g.lineBetween(x,y-12,x,y+12);return;}
    if(!this.placementType)return;
    const preview=this.sim.getBuildPreview(this.placementType,x,y),color=preview.ok?TOWERS[this.placementType].color:0xff5364;
    g.fillStyle(color,.06).fillCircle(x,y,preview.range);g.lineStyle(2,color,.45).strokeCircle(x,y,preview.range);g.fillStyle(color,.3).fillCircle(x,y,24);g.lineStyle(3,color,.9).strokeCircle(x,y,24);
  }

  renderEvent(event) {
    if(event.type==='impact')this.impact(event);
    else if(event.type==='chain')this.energyLine(event.points,0xc6a6ff,4,.18);
    else if(event.type==='beam')this.energyLine([event.from,event.to],0xff71b2,3+event.power,.12);
    else if(event.type==='pulse')this.ring(event.x,event.y,event.range,0xffe477,.34);
    else if(event.type==='critical')this.floatText(event.x,event.y-20,'暴擊!',0xffe36a);
    else if(event.type==='heal')this.floatText(event.x,event.y-24,'+',0x75f2a5);
    else if(event.type==='shieldBreak')this.ring(event.x,event.y,45,0x83ddff,.26);
    else if(event.type==='enemyKilled')this.burst(event.x,event.y,event.boss?0xffffff:0xff92b6,event.boss?18:7);
    else if(event.type==='towerBuilt')this.ring(event.x,event.y,42,TOWERS[event.towerType].color,.32);
    else if(event.type==='towerUpgraded')this.burst(event.x,event.y,0xffe678,12);
    else if(event.type==='ability')this.abilityEffect(event);
    else if(event.type==='bossPulse')this.ring(event.x,event.y,100,0xff536d,.45);
  }

  impact(event) {
    const circle=this.add.circle(event.x,event.y,Math.max(8,event.radius*.28),event.color||0xffffff,.72).setDepth(72);
    this.tweens.add({targets:circle,scale:Math.max(1.5,event.radius/14),alpha:0,duration:260,ease:'Quad.Out',onComplete:()=>circle.destroy()});
  }

  ring(x,y,radius,color,duration=.3) {
    const ring=this.add.graphics().setDepth(73);ring.lineStyle(5,color,.8).strokeCircle(0,0,12);ring.setPosition(x,y);
    this.tweens.add({targets:ring,scale:radius/12,alpha:0,duration:duration*1000,ease:'Cubic.Out',onComplete:()=>ring.destroy()});
  }

  energyLine(points,color,width,duration) {
    if(points.length<2)return;const g=this.add.graphics().setDepth(74);g.lineStyle(width+5,0xffffff,.18);for(let i=0;i<points.length-1;i++)g.lineBetween(points[i].x,points[i].y,points[i+1].x,points[i+1].y);g.lineStyle(width,color,.95);for(let i=0;i<points.length-1;i++)g.lineBetween(points[i].x,points[i].y,points[i+1].x,points[i+1].y);this.tweens.add({targets:g,alpha:0,duration:duration*1000,onComplete:()=>g.destroy()});
  }

  burst(x,y,color,count=8) {
    for(let i=0;i<count;i++){const dot=this.add.circle(x,y,2+(i%3),color,.9).setDepth(75),angle=i/count*Math.PI*2+Math.random()*.4,length=18+Math.random()*30;this.tweens.add({targets:dot,x:x+Math.cos(angle)*length,y:y+Math.sin(angle)*length,alpha:0,scale:.2,duration:260+Math.random()*240,ease:'Quad.Out',onComplete:()=>dot.destroy()});}
  }

  floatText(x,y,text,color) {
    const label=this.add.text(x,y,text,{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:`#${color.toString(16).padStart(6,'0')}`,stroke:'#07101b',strokeThickness:4}).setOrigin(.5).setDepth(90);
    this.tweens.add({targets:label,y:y-34,alpha:0,duration:650,onComplete:()=>label.destroy()});
  }

  abilityEffect(event) {
    if(event.id==='meteor'){
      const meteor=this.add.circle(event.x-220,event.y-250,20,0xffd57a,1).setDepth(95);meteor.setStrokeStyle(8,0xff6a4a,.5);this.tweens.add({targets:meteor,x:event.x,y:event.y,duration:380,ease:'Quad.In',onComplete:()=>{meteor.destroy();this.ring(event.x,event.y,150,0xff8a55,.55);this.cameras.main.shake(260,.007);}});
    }else if(event.id==='stasis'){
      const overlay=this.add.rectangle(WORLD.width/2,WORLD.height/2,WORLD.width,WORLD.height,0x8edcff,.12).setDepth(91);this.tweens.add({targets:overlay,alpha:0,duration:900,onComplete:()=>overlay.destroy()});
    }else if(event.id==='overdrive'){
      for(const tower of this.sim.state.towers)this.ring(tower.x,tower.y,40,0xffe36a,.3);
    }
  }
}
