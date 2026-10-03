'use strict';
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');
const config=require('../../config');const store=require('../../db/jsonStore');
const {getPool,withTransaction}=require('../../math-app/db/database');
const petRepo=require('./pet.repo');const {verify}=require('../lib/brawl/verifier.cjs');
const definitions=import('../lib/brawl/catalog.mjs');
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let schema;
async function ensure(){await petRepo.ensureSchema();if(config.db.mode==='postgres'){schema??=getPool().query(`
  CREATE TABLE IF NOT EXISTS PetBrawlRuns (RunID UUID PRIMARY KEY, StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE, PetID UUID NOT NULL REFERENCES PetInstances(PetID) ON DELETE CASCADE, IdempotencyKey VARCHAR(120) NOT NULL, State JSONB NOT NULL, UNIQUE(StudentID,IdempotencyKey));
  CREATE INDEX IF NOT EXISTS idx_pet_brawl_owner ON PetBrawlRuns(StudentID);
  CREATE TABLE IF NOT EXISTS PetBrawlProgress (StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE, State JSONB NOT NULL DEFAULT '{}'::jsonb);
  CREATE TABLE IF NOT EXISTS PetBrawlDailyRewards (StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE, RewardDay VARCHAR(10) NOT NULL, Wins INTEGER NOT NULL DEFAULT 0 CHECK (Wins BETWEEN 0 AND 3), PRIMARY KEY(StudentID,RewardDay));
`).catch(e=>{schema=null;throw e;});await schema;}else{const data=store.load();for(const key of ['petBrawlRuns','petBrawlProgress','petBrawlDailyRewards'])data[key]??=[];}}
function validKey(key){if(typeof key!=='string'||!key.trim()||key.length>120)fail('缺少有效的防重複提交識別碼。',400);return key.trim();}
function available(progress,stage,difficulty,c){const i=c.STAGES.findIndex(s=>s.id===stage);return i>=0&&(i===0||Object.keys(progress).some(k=>k.startsWith(c.STAGES[i-1].id+':')))&&(difficulty!=='hard'||!!progress[stage+':normal']);}
async function mutate(studentId,runId,key,action){
  await petRepo.ensureStudent(studentId);await ensure();const day=petRepo.hkDay();
  if(config.db.mode==='postgres')return withTransaction(async client=>{
    const wallet=(await client.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE',[studentId])).rows[0];
    const progress=(await client.query('SELECT State AS state FROM PetBrawlProgress WHERE StudentID=$1',[studentId])).rows[0]?.state||{};
    const daily=(await client.query('SELECT Wins AS wins FROM PetBrawlDailyRewards WHERE StudentID=$1 AND RewardDay=$2',[studentId,day])).rows[0]?.wins||0;
    const runs=(await client.query(`SELECT State AS state FROM PetBrawlRuns WHERE StudentID=$1 AND (RunID::text=$2 OR IdempotencyKey=$3 OR State->>'status'='active')`,[studentId,runId||'',key||''])).rows.map(r=>r.state);
    const pets=(await client.query('SELECT PetID AS "petId",SpeciesID AS "speciesId",XP AS xp,Stage AS stage,DailyXP AS "dailyXp",DailyXPDate AS "dailyXpDate" FROM PetInstances WHERE StudentID=$1 FOR UPDATE',[studentId])).rows;
    const context={studentId,day,balance:Number(wallet.balance),progress,runs,pets,wins:Number(daily),dirtyRuns:[],dirtyPets:[],ledger:[]};const result=action(context);
    if(result?.then)throw new Error('Brawl mutations must be synchronous');
    for(const run of context.dirtyRuns)await client.query(`INSERT INTO PetBrawlRuns (RunID,StudentID,PetID,IdempotencyKey,State) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (RunID) DO UPDATE SET State=EXCLUDED.State`,[run.id,studentId,run.petId,run.key,JSON.stringify(run)]);
    await client.query('INSERT INTO PetBrawlProgress (StudentID,State) VALUES ($1,$2::jsonb) ON CONFLICT (StudentID) DO UPDATE SET State=EXCLUDED.State',[studentId,JSON.stringify(context.progress)]);
    await client.query('INSERT INTO PetBrawlDailyRewards (StudentID,RewardDay,Wins) VALUES ($1,$2,$3) ON CONFLICT (StudentID,RewardDay) DO UPDATE SET Wins=EXCLUDED.Wins',[studentId,day,context.wins]);
    if(context.ledger.length){await client.query('UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1',[studentId,context.balance]);for(const row of context.ledger)await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata) VALUES ($1,$2,$2,5,'brawl_win',$3,$4::jsonb)`,[row.id,studentId,'brawl:'+row.runId,JSON.stringify({runId:row.runId})]);}
    for(const pet of context.dirtyPets)await client.query('UPDATE PetInstances SET XP=$3,Stage=$4,DailyXP=$5,DailyXPDate=$6,UpdatedAt=NOW() WHERE StudentID=$1 AND PetID=$2',[studentId,pet.petId,pet.xp,pet.stage,pet.dailyXp,pet.dailyXpDate]);return result;
  });
  const data=store.load(),context={studentId,day,balance:data.petWallets.find(w=>w.studentId===studentId).balance,progress:copy(data.petBrawlProgress.find(p=>p.studentId===studentId)?.state||{}),runs:copy(data.petBrawlRuns.filter(r=>r.studentId===studentId)),pets:copy(data.petInstances.filter(p=>p.studentId===studentId)),wins:data.petBrawlDailyRewards.find(r=>r.studentId===studentId&&r.day===day)?.wins||0,dirtyRuns:[],dirtyPets:[],ledger:[]};
  const result=action(context);if(result?.then)throw new Error('Brawl mutations must be synchronous');
  for(const run of context.dirtyRuns){const i=data.petBrawlRuns.findIndex(r=>r.id===run.id);if(i<0)data.petBrawlRuns.push(run);else data.petBrawlRuns[i]=run;}
  const p=data.petBrawlProgress.find(p=>p.studentId===studentId);if(p)p.state=context.progress;else data.petBrawlProgress.push({studentId,state:context.progress});
  const d=data.petBrawlDailyRewards.find(r=>r.studentId===studentId&&r.day===day);if(d)d.wins=context.wins;else data.petBrawlDailyRewards.push({studentId,day,wins:context.wins});
  if(context.ledger.length){const wallet=data.petWallets.find(w=>w.studentId===studentId);wallet.balance=context.balance;wallet.updatedAt=new Date().toISOString();for(const row of context.ledger)data.petCurrencyLedger.push({transactionId:row.id,studentId,actorId:studentId,delta:5,kind:'brawl_win',idempotencyKey:'brawl:'+row.runId,metadata:{runId:row.runId},createdAt:wallet.updatedAt});}
  for(const pet of context.dirtyPets){const target=data.petInstances.find(p=>p.studentId===studentId&&p.petId===pet.petId);Object.assign(target,pet,{updatedAt:new Date().toISOString()});}store.save();return copy(result);
}
async function getCatalog(){const c=await definitions;let assets=null;try{assets=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/assets/art/brawl/manifest.json'),'utf8'));}catch{}if(assets)assets=require('../lib/brawl/assets.cjs').completeAssets(assets,c.FIGHTERS);return {enabled:process.env.PET_BRAWL_ENABLED!=='0'&&!!assets,version:c.VERSION,fighters:c.FIGHTERS,stages:c.STAGES,difficulties:Object.keys(c.DIFFICULTIES),assets};}
async function getProgress(studentId){await petRepo.ensureStudent(studentId);await ensure();const day=petRepo.hkDay();let best={},wins=0,active=null;
  if(config.db.mode==='postgres'){const [p,d,r]=await Promise.all([getPool().query('SELECT State AS state FROM PetBrawlProgress WHERE StudentID=$1',[studentId]),getPool().query('SELECT Wins AS wins FROM PetBrawlDailyRewards WHERE StudentID=$1 AND RewardDay=$2',[studentId,day]),getPool().query(`SELECT State AS state FROM PetBrawlRuns WHERE StudentID=$1 AND State->>'status'='active'`,[studentId])]);best=p.rows[0]?.state||{};wins=Number(d.rows[0]?.wins||0);active=r.rows.map(r=>r.state).find(r=>Date.parse(r.expiresAt)>Date.now())||null;}
  else{const d=store.load();best=copy(d.petBrawlProgress.find(p=>p.studentId===studentId)?.state||{});wins=d.petBrawlDailyRewards.find(r=>r.studentId===studentId&&r.day===day)?.wins||0;active=d.petBrawlRuns.find(r=>r.studentId===studentId&&r.status==='active'&&Date.parse(r.expiresAt)>Date.now())||null;}
  return {best,day,rewardsRemaining:Math.max(0,3-wins),activeRun:active?publicRun(active):null};
}
function publicRun(run){return {id:run.id,petId:run.petId,options:{...run.options,version:run.version},createdAt:run.createdAt,expiresAt:run.expiresAt,status:run.status};}
async function start(studentId,body,key){key=validKey(key);if(!body||typeof body!=='object'||Array.isArray(body))fail('無效的出戰設定。',400);const c=await definitions;if(!(await getCatalog()).enabled)fail('大亂鬥暫時未開放。',403);const request={petId:body.petId,stageId:body.stageId,difficulty:body.difficulty};
  if(!c.stageById(request.stageId)||!c.DIFFICULTIES[request.difficulty]||typeof request.petId!=='string')fail('無效的出戰設定。',400);
  return mutate(studentId,null,key,ctx=>{const old=ctx.runs.find(r=>r.key===key);if(old){if(old.requestDigest!==digest(request))fail('這個識別碼已用於其他設定。');return {run:publicRun(old)};}
    const pet=ctx.pets.find(p=>p.petId===request.petId);if(!pet||!c.fighterById(pet.speciesId))fail('請選擇自己擁有的出戰寵物。',403);
    if(!available(ctx.progress,request.stageId,request.difficulty,c))fail('請先完成前一關或標準難度。',403);
    for(const r of ctx.runs.filter(r=>r.status==='active')){if(Date.parse(r.expiresAt)>Date.now())fail('你有未完成的冒險，請繼續或先放棄。');r.status='expired';ctx.dirtyRuns.push(r);}
    const run={id:randomUUID(),studentId,petId:pet.petId,key,requestDigest:digest(request),options:{fighterId:pet.speciesId,stageId:request.stageId,difficulty:request.difficulty,mode:'campaign',seed:randomBytes(4).readUInt32LE(0)},version:c.VERSION,status:'active',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()};ctx.dirtyRuns.push(run);return {run:publicRun(run)};});
}
async function readRun(studentId,id){await ensure();let run;if(config.db.mode==='postgres'){run=(await getPool().query('SELECT State AS state FROM PetBrawlRuns WHERE StudentID=$1 AND RunID::text=$2',[studentId,id])).rows[0]?.state;}else run=store.load().petBrawlRuns.find(r=>r.studentId===studentId&&r.id===id);if(!run)fail('找不到這次冒險。',404);return copy(run);}
async function finish(studentId,id,body,key){validKey(key);if(!body||typeof body!=='object'||Array.isArray(body))fail('無效的冒險紀錄。',400);const run=await readRun(studentId,id),c=await definitions;
  if(body.version!==run.version||!c.SUPPORTED_VERSIONS.includes(body.version))fail('這次冒險的規則版本不能驗證。',409);
  if(Buffer.byteLength(JSON.stringify(body))>1048576)fail('冒險紀錄過大。',413);const logDigest=digest({version:body.version,endTick:body.endTick,inputs:body.inputs});
  if(run.result){if(run.finishDigest!==logDigest)fail('這次冒險已結算其他紀錄。');return {receipt:run.result};}
  if(run.status!=='active'||Date.parse(run.expiresAt)<=Date.now())fail('這次冒險已結束或到期。');
  const result=await verify({...run.options,version:run.version},body.inputs,body.endTick);
  return mutate(studentId,id,null,ctx=>{const current=ctx.runs.find(r=>r.id===id);if(!current)fail('找不到這次冒險。',404);if(current.result){if(current.finishDigest!==logDigest)fail('這次冒險已結算其他紀錄。');return {receipt:current.result};}
    if(current.status!=='active'||Date.parse(current.expiresAt)<=Date.now())fail('這次冒險已結束或到期。');const pet=ctx.pets.find(p=>p.petId===current.petId);if(!pet)fail('出戰寵物已不存在。',404);
    const rewards={coins:0,xp:0};if(result.outcome==='won'){
      const k=current.options.stageId+':'+current.options.difficulty,previous=ctx.progress[k];ctx.progress[k]={stars:Math.max(previous?.stars||0,result.stars),seconds:Math.min(previous?.seconds??Infinity,result.seconds),clears:(previous?.clears||0)+1};
      if(ctx.wins<3){rewards.coins=5;const used=pet.dailyXpDate===ctx.day?Number(pet.dailyXp):0;rewards.xp=Math.min(10,Math.max(0,100-used));pet.xp=Number(pet.xp)+rewards.xp;pet.dailyXp=used+rewards.xp;pet.dailyXpDate=ctx.day;pet.stage=petRepo.stageForXp(pet.xp);ctx.dirtyPets.push(pet);ctx.wins++;ctx.balance+=5;ctx.ledger.push({id:randomUUID(),runId:id});}}
    current.status='finished';current.finishDigest=logDigest;current.result={runId:id,...result,rewards,rewardsRemaining:3-ctx.wins,day:ctx.day};current.finishedAt=new Date().toISOString();ctx.dirtyRuns.push(current);return {receipt:current.result};});
}
async function abandon(studentId,id){return mutate(studentId,id,null,ctx=>{const run=ctx.runs.find(r=>r.id===id);if(!run)fail('找不到這次冒險。',404);if(run.status==='active'){run.status='abandoned';ctx.dirtyRuns.push(run);}return {run:publicRun(run)};});}
async function access(studentId,body){const c=await definitions;if(c.HIDDEN_FIGHTER_IDS.includes(body?.fighterId))fail('隱藏角色暫未開放大亂鬥。',403);if(!body||!['practice','tutorial','duel','campaign'].includes(body.mode)||typeof body.petId!=='string'||!c.fighterById(body.fighterId))fail('無效的出戰設定。',400);if(!(await getCatalog()).enabled)fail('大亂鬥暫時未開放。',403);const p=await require('./brawl-duel.repo').player(studentId);if(!p.pets.some(p=>p.petId===body.petId&&p.fighterId===body.fighterId))fail('請先在寵物樂園擁有這隻角色，才可出戰。',403);return {allowed:true,fighterId:body.fighterId};}
module.exports={access,getCatalog,getProgress,start,finish,abandon,readRun};
