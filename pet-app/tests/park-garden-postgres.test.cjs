'use strict';
const { test }=require('node:test');const assert=require('node:assert/strict');const {PGlite}=require('@electric-sql/pglite');
const configPath=require.resolve('../../config'),config=require(configPath);require.cache[configPath].exports={...config,db:{mode:'postgres'}};
const db=new PGlite();let failWrite=false;
async function query(target,sql,params=[]){if(failWrite&&sql.startsWith('UPDATE PetParkGardens'))throw Error('garden transaction interrupted');const result=params.length?await target.query(sql,params):await target.exec(sql);const value=Array.isArray(result)?result.at(-1):result;return{...value,rows:value?.rows||[],rowCount:value?.affectedRows??value?.rows?.length??0};}
const databasePath=require.resolve('../../math-app/db/database');require.cache[databasePath]={id:databasePath,filename:databasePath,loaded:true,exports:{getPool:()=>({query:(sql,params)=>query(db,sql,params)}),withTransaction:fn=>db.transaction(tx=>fn({query:(sql,params)=>query(tx,sql,params)}))}};
const repo=require('../repositories/park-garden.repo'),rules=import('../lib/park-garden.mjs');
const now=Date.parse('2026-10-25T09:00:00+08:00'),a={id:'A',name:'小晴'},b={id:'B',name:'阿樂'};
const cmd=(state,action,id,seed)=>({plotId:'sun',revision:state.plots.sun.revision,day:state.day,action,requestId:id,...(seed?{seed}:{})});
test('PostgreSQL garden row locking persists shared contributions, rejects stale concurrent commands and rolls back interrupted harvests without minting currency',async t=>{
 t.after(()=>db.close());const r=await rules;let state=await repo.read('park:year:5A',now);
 const plant=cmd(state,'plant','pg-plant','sunflowers');
 const plantResults=await Promise.all([repo.act('park:year:5A',a,plant,{now}),repo.act('park:year:5A',a,plant,{now})]);
 assert.equal(plantResults.filter(v=>v.result.repeated).length,1);state=await repo.read('park:year:5A',now);
 const waterA=cmd(state,'water','pg-water-a'),waterB=cmd(state,'water','pg-water-b');
 const concurrent=await Promise.allSettled([repo.act('park:year:5A',a,waterA,{now:now+1000}),repo.act('park:year:5A',b,waterB,{now:now+1000})]);
 assert.equal(concurrent.filter(v=>v.status==='fulfilled').length,1,'optimistic version admits one of two stale actions');
 state=await repo.read('park:year:5A',now+2000);assert.equal(state.plots.sun.waterCount,1);
 state=(await repo.act('park:year:5A',b,cmd(state,'water','pg-second-water'),{now:now+6000})).state;
 const readyAt=state.plots.sun.readyAt;state=await repo.read('park:year:5A',readyAt);assert.equal(state.plots.sun.stage,'ready');
 const harvest=cmd(state,'harvest','pg-harvest');failWrite=true;await assert.rejects(repo.act('park:year:5A',b,harvest,{now:readyAt}),/garden transaction interrupted/);failWrite=false;
 assert.equal((await repo.read('park:year:5A',readyAt)).bouquets,0);assert.equal((await repo.read('park:year:5A',readyAt)).plots.sun.stage,'ready');
 await assert.rejects(repo.act('park:year:5A',b,harvest,{now:readyAt,canCommit:()=>{throw Error('teacher locked');}}),/teacher locked/);
 let commitChecks=0;await assert.rejects(repo.act('park:year:5A',b,harvest,{now:readyAt,canCommit:()=>{if(++commitChecks===2)throw Error('locked after row update');}}),/locked after row update/);assert.equal((await repo.read('park:year:5A',readyAt)).bouquets,0);
 const finished=await repo.act('park:year:5A',b,harvest,{now:readyAt});assert.equal(finished.state.bouquets,1);
 assert.equal((await repo.act('park:year:5A',b,harvest,{now:readyAt+10})).result.repeated,true);
 assert.equal((await repo.read('park:year:5B',readyAt)).bouquets,0);assert.equal((await repo.read('park:year:5A',now+86400000)).plots.sun.stage,'empty');
 assert.equal((await db.query('SELECT COUNT(*) AS n FROM PetParkGardens')).rows[0].n,1);
 const tables=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");assert.ok(!tables.rows.some(row=>/wallet|ledger/i.test(row.tablename)),'garden has no currency writes');
 assert.equal(r.publicGarden(r.blankGarden(r.gardenDay(now)),now).revision,0);
 // The scenery shares the same locked class row and rollback boundary.
 state=await repo.read('park:year:5A',now);const decorate={plotId:'wish-lights',action:'contribute',requestId:'pg-shared-light',day:state.day,revision:0,seed:'cream'};
 const shared=await Promise.all([repo.act('park:year:5A',a,decorate,{now}),repo.act('park:year:5A',a,decorate,{now})]);assert.equal(shared.filter(v=>v.result.repeated).length,1);assert.equal((await repo.read('park:year:5A',now)).projects['wish-lights'].count,1);
 failWrite=true;await assert.rejects(repo.act('park:year:5A',b,{...decorate,requestId:'pg-failed-light',revision:1},{now:now+2000}),/garden transaction interrupted/);failWrite=false;assert.equal((await repo.read('park:year:5A',now)).projects['wish-lights'].count,1);assert.equal((await repo.read('park:year:5B',now)).projects['wish-lights'].count,0);
});
