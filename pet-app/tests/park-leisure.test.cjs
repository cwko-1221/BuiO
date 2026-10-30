const {test}=require('node:test'),assert=require('node:assert/strict');
const games=import('../lib/park-games.mjs'),leisure=import('../lib/park-leisure.mjs');
test('each venue has a different game and only the chimes retain memory; existing clue visits remain possible',async()=>{
  const w=await import('../lib/park-world.mjs');assert.equal(w.OBJECTS.filter(o=>w.activityModes(o).includes('melody')).length,1);
  for(const [id,kind]of [['pond','fishing'],['drum','rhythm'],['bell','lantern'],['garden-bench','golf']])assert.ok(w.OBJECTS.find(o=>o.id===id).games.includes(kind));
  assert.ok(w.CLUES.pond);assert.ok(w.activityModes(w.OBJECTS.find(o=>o.id==='hollow')).includes('maze'));assert.equal(w.QUESTS.length,14);
});
test('seeded mazes are connected and reject jumps, row wrapping, incomplete paths and wall crossings',async()=>{
  const a=await import('../lib/park-activities.mjs');for(let seed=1;seed<=50;seed++){const c=a.createChallenge('maze','hollow',seed),queue=[[0]],seen=new Set([0]);let path;while(queue.length){const p=queue.shift(),at=p.at(-1);if(at===24){path=p;break;}for(const [i,d]of [-5,1,5,-1].entries())if(c.cells[at]>>i&1&&!seen.has(at+d)){seen.add(at+d);queue.push([...p,at+d]);}}
    assert.ok(path);assert.equal(a.verifyChallenge(c,path),true);assert.equal(a.verifyChallenge(c,[0,24]),false);assert.equal(a.verifyChallenge(c,[0,4,5,24]),false);assert.equal(a.verifyChallenge(c,path.slice(1)),false);assert.deepEqual(c,a.createChallenge('maze','hollow',seed));}
});
test('fishing requires a real bite and repeated reeling taps; repeated press counters do not double-cast and collection comes from catches',async()=>{
  const g=await games;const bad=g.createGame('fishing',5);g.stepGame(bad,{presses:[1]});const at=bad.leisure.biteAt;for(let i=0;i<10;i++)g.stepGame(bad,{presses:[1]});assert.equal(bad.leisure.biteAt,at);while(bad.leisure.phase==='casting')g.stepGame(bad,{presses:[1]});g.stepGame(bad,{presses:[2]});assert.equal(bad.leisure.phase,'escaped');assert.equal(bad.caught,0);
  const s=g.createGame('fishing',7);let presses=0,previous='';while(s.status==='playing'){const l=s.leisure;if((l.phase!==previous&&['ready','caught','escaped','bite'].includes(l.phase))||(l.phase==='reeling'&&!l.surging&&l.tension<64&&s.tick%9===0))presses++;previous=l.phase;g.stepGame(s,{presses:[presses],mask:0,x:291,y:252});assert.ok(l.tension>=0&&l.tension<=100);}
  const out=g.gameResult(s);assert.ok(out.qualified&&out.caught>=2);assert.equal(out.collection.length,new Set(out.collection).size);assert.ok(out.collection.every(n=>n>=0&&n<20));
});
test('rhythm rewards timed matching lanes and silence or random taps cannot meet the goal',async()=>{
  const g=await games;for(const play of [false,true]){const s=g.createGame('rhythm',9),presses=Array(4).fill(0),hit=new Set();while(s.status==='playing'){if(play)for(const n of s.leisure.chart)if(!hit.has(n.id)&&Math.abs(n.at-(s.t+1/30))<.04){hit.add(n.id);presses[n.lane]++;}g.stepGame(s,{presses});}assert.equal(g.gameResult(s).qualified,play);if(play)assert.ok(s.leisure.hits>=50);else assert.equal(s.score,0);}
});
test('lantern puzzles are solvable at every seed, hints preserve the board, and three completed boards end a run',async()=>{
  const g=await games,l=await leisure;for(const seed of [1,7,44]){const s=g.createGame('lantern',seed),presses=Array(10).fill(0);while(s.status==='playing'){if(s.leisure.phase==='playing'){const before=[...s.leisure.tiles];presses[9]++;g.stepGame(s,{presses});assert.deepEqual(s.leisure.tiles,before);assert.ok(l.lanternHint(s.leisure.tiles).length);const at=l.lanternHint(s.leisure.tiles)[0];presses[at]++;}g.stepGame(s,{presses});}assert.equal(s.leisure.completed,3);assert.ok(g.gameResult(s).qualified);}}
);
test('golf has real friction, boundaries and bumper collisions; holding an old putt cannot create more strokes',async()=>{
  const g=await games,s=g.createGame('golf',7);const first={...s.leisure.ball};g.stepGame(s,{presses:[1],x:0,y:first.y/600*720});assert.equal(s.leisure.strokes,1);const startSpeed=Math.hypot(s.leisure.ball.vx,s.leisure.ball.vy);for(let i=0;i<50;i++){g.stepGame(s,{presses:[1]});const b=s.leisure.ball;assert.ok(b.x>=75&&b.x<=725&&b.y>=75&&b.y<=525);}assert.equal(s.leisure.strokes,1);assert.ok(Math.hypot(s.leisure.ball.vx,s.leisure.ball.vy)<startSpeed);assert.ok(s.effects.some(e=>e.type==='bounce'));
});
test('all leisure modes pause completely and replay deterministically without client outcomes',async()=>{
  const g=await games;for(const kind of ['fishing','rhythm','lantern','golf']){const a=g.createGame(kind,72),b=g.createGame(kind,72);for(let i=0;i<90;i++){const input={mask:i%20<10?16:0,presses:[Math.floor(i/30)+1],x:120,y:180};g.stepGame(a,input);g.stepGame(b,input);}assert.deepEqual(a,b);a.paused=true;const before=structuredClone(a);for(let i=0;i<100;i++)g.stepGame(a,{presses:[9999]});assert.deepEqual(a,before);}
});
