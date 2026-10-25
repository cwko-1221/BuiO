const {test}=require('node:test');
const assert=require('node:assert/strict');
const game=import('../lib/park-games.mjs');
test('all three aircraft have deterministic bounded battles and reject arbitrary or inherited aircraft IDs',async()=>{
  const g=await game;
  for(const id of ['__proto__','constructor','unknown'])assert.throws(()=>g.createGame('flight',1,{craft:id}),/aircraft/);
  for(const craft of Object.keys(g.FLIGHT_CRAFT))for(const seed of [7,91,177]){
    const a=g.createGame('flight',seed,{craft}),b=g.createGame('flight',seed,{craft});
    for(let tick=0;tick<1800;tick++){const input={x:240+Math.sin(tick/75)*150,y:570,mask:tick%210<4?16:tick%200===0?32:0};g.stepGame(a,input);g.stepGame(b,input);assert.ok(a.effects.length<=90&&a.sparks.length<=180);assert.ok(a.energy>=0&&a.energy<=100);assert.ok(a.player.x>=35&&a.player.x<=445&&a.player.y>=310&&a.player.y<=655);}
    assert.deepEqual(a,b);assert.equal(a.status,'ended');assert.ok(a.shots.length<200);
  }
});
test('different aircraft retain their weapons; direct pointers share bounded positions and keyboard diagonals retain craft speed',async()=>{
  const g=await game;
  for(const craft of Object.keys(g.FLIGHT_CRAFT)){
    const s=g.createGame('flight',3,{craft});for(let i=0;i<45;i++)g.stepGame(s,{x:445,y:310});
    const sample=g.createGame('flight',3,{craft});g.stepGame(sample,{x:445,y:310});assert.deepEqual(sample.player,{x:445,y:310});
    const start={...sample.player},predicted=g.moveGamePlayer('flight',craft,start,{mask:9},1/30);g.stepGame(sample,{mask:9});assert.deepEqual(sample.player,predicted);assert.ok(Math.abs(Math.hypot(sample.player.x-start.x,sample.player.y-start.y)-g.FLIGHT_CRAFT[craft].speed/30)<1e-8);
    assert.deepEqual(g.moveGamePlayer('flight',craft,start,{x:-100,y:900}),{x:35,y:655});
    assert.equal(s.craft,craft);
    if(craft==='swift'){assert.ok(s.shots.every(p=>p.kind==='pulse'));assert.ok(s.shots.some(p=>p.x<s.player.x));}
    if(craft==='petal'){assert.ok(s.shots.some(p=>p.vx<0)&&s.shots.some(p=>p.vx>0));}
    if(craft==='nova'){assert.ok(s.shots.some(p=>p.kind==='lance'&&p.pierce>1));assert.ok(s.shots.some(p=>p.kind==='missile'));}
  }
});
test('shield and charged attacks require a fresh press, spend authoritative resources, and pause freezes everything',async()=>{
  const g=await game,s=g.createGame('flight');s.energy=100;
  g.stepGame(s,{mask:48});const until=s.specialUntil;assert.equal(s.shields,2);assert.ok(s.energy<1);assert.equal(s.effects.filter(e=>e.type==='special').length,1);
  s.energy=100;for(let i=0;i<15;i++)g.stepGame(s,{mask:48});assert.equal(s.specialUntil,until);assert.equal(s.shields,2);
  g.stepGame(s,{mask:0});g.stepGame(s,{mask:48});assert.ok(s.specialUntil>until);assert.equal(s.shields,1);
  s.paused=true;const before=structuredClone(s);for(let i=0;i<100;i++)g.stepGame(s,{mask:63});assert.deepEqual(s,before);
});
test('repeated samples preserve short action taps without repeating resource consumption',async()=>{
  const g=await game,s=g.createGame('flight');s.energy=100;
  for(let i=0;i<12;i++)g.stepGame(s,{seq:i+1,shieldPress:1,specialPress:1});
  assert.equal(s.shields,2);assert.equal(s.effects.filter(e=>e.type==='shield').length,1);assert.equal(s.effects.filter(e=>e.type==='special').length,1);assert.equal(s.inputSeq,12);
  s.energy=100;g.stepGame(s,{shieldPress:2,specialPress:2});assert.equal(s.shields,1);assert.ok(s.energy<1);
});
test('fast drags and fast projectiles collide along their entire paths; basket catches and pickups follow the same rule',async()=>{
  const g=await game;
  for(const shield of [false,true]){const s=g.createGame('flight');s.player={x:40,y:600};s.nextSpawn=100;s.nextShot=100;s.sparks=[{id:800,x:240,y:600,vx:0,vy:0,kind:'orb'}];if(shield)s.shieldUntil=10;g.stepGame(s,{x:440,y:600});assert.equal(s.sparks.length,0);assert.equal(s.lives,shield?5:4);}
  const s=g.createGame('flight');s.nextSpawn=100;s.nextShot=100;s.sparks=[{id:800,x:240,y:450,vx:0,vy:9000,kind:'orb'}];g.stepGame(s);assert.equal(s.lives,4);
  const safe=g.createGame('flight');safe.player={x:40,y:600};safe.sparks=[{id:800,x:240,y:570,vx:0,vy:0,kind:'orb'}];g.stepGame(safe,{x:440,y:600});assert.equal(safe.lives,5,'near misses stay safe');
  const b=g.createGame('banana');b.player.x=40;b.nextSpawn=100;b.fruit=[{id:800,x:240,y:628,vx:0,vy:0,kind:'banana'}];g.stepGame(b,{x:440});assert.equal(b.caught,1);assert.equal(b.player.y,628);
  const p=g.createGame('flight');p.player={x:40,y:600};p.pickups=[{id:800,x:240,y:600,vy:0,kind:'power'}];g.stepGame(p,{x:440,y:600});assert.equal(p.power,2);
});
test('supplies require collection and never overflow resources; enemy types and boss attack stages exist in the simulation',async()=>{
  const g=await game,s=g.createGame('flight',72);s.pickups=[{id:900,x:40,y:400,vy:0,kind:'power'}];g.stepGame(s);assert.equal(s.power,1);assert.equal(s.pickups.length,1);
  s.pickups[0].x=s.player.x;s.pickups[0].y=s.player.y;g.stepGame(s);assert.equal(s.power,2);assert.equal(s.pickups.length,0);
  for(const kind of ['repair','shield','energy','power']){s.pickups.push({id:++s.serial,x:s.player.x,y:s.player.y,vy:0,kind});g.stepGame(s);}
  assert.equal(s.power,3);assert.equal(s.lives,5);assert.equal(s.shields,3);assert.ok(s.energy<=100);
  const kinds=new Set();for(let i=0;i<1440;i++){s.lives=5;g.stepGame(s,{x:35,y:650});s.enemies.forEach(e=>kinds.add(e.kind));}assert.ok(['scout','interceptor','bomber','boss'].every(k=>kinds.has(k)));
  const boss=s.enemies.find(e=>e.boss);assert.ok(boss);boss.hp=boss.maxHp*.3;boss.fireAt=s.t;boss.nextBeam=s.t;boss.y=125;g.stepGame(s);assert.ok(boss.warningAt>s.t);assert.ok(s.sparks.some(e=>e.kind==='ring'));
});
test('original sound cues are deterministic, distinct, finite and below clipping with quiet boundaries',async()=>{
  const {skySound,SKY_CUES}=await import('../lib/sky-sound.mjs'),hash=require('node:crypto').createHash,fingerprints=new Set();
  for(const cue of SKY_CUES){const sound=skySound(cue,22050);assert.ok(sound.length>1500);assert.deepEqual(sound,skySound(cue,22050));let energy=0;for(const x of sound){assert.ok(Number.isFinite(x)&&Math.abs(x)<1);energy+=x*x;}assert.ok(energy/sound.length>.00001,cue+' is silent');assert.equal(Math.abs(sound[0]),0);assert.ok(Math.abs(sound.at(-1))<.01);fingerprints.add(hash('sha256').update(Buffer.from(sound.buffer)).digest('hex'));}assert.equal(fingerprints.size,SKY_CUES.length);assert.throws(()=>skySound('unknown'));
});
test('the Storm Ark cannot skip an armor stage and transitions preserve a visible guarded counterattack',async()=>{
  const g=await game,s=g.createGame('flight',2);s.tick=1500;s.t=50;s.bossSpawned=true;s.nextSpawn=100;s.nextShot=100;
  const boss={id:900,x:240,baseX:240,y:125,hp:118,maxHp:118,kind:'boss',vy:0,phase:-45,stage:1,guardUntil:0,fireAt:100,boss:true,attack:0,warningAt:0,beamUntil:0,beamX:240,nextBeam:100};s.enemies=[boss];
  const strike=()=>{s.shots=[{id:++s.serial,x:boss.x,y:boss.y+10,vx:0,vy:-1,kind:'lance',damage:500,pierce:1,hitIds:[]}];g.stepGame(s);};
  strike();assert.equal(boss.stage,2);assert.equal(boss.hp,boss.maxHp*.66);assert.ok(boss.guardUntil>s.t);const hp=boss.hp;strike();assert.equal(boss.hp,hp);assert.equal(s.bossDefeated,false);
  for(let i=0;i<30;i++)g.stepGame(s);strike();assert.equal(boss.stage,3);assert.equal(boss.hp,boss.maxHp*.33);assert.ok(s.effects.some(e=>e.type==='boss-phase'&&e.amount===3));
  for(let i=0;i<30;i++)g.stepGame(s);strike();assert.equal(s.bossDefeated,true);assert.equal(s.status,'ended');
});
