'use strict';
const {randomUUID}=require('node:crypto');
const config=require('../../config');
const store=require('../../db/jsonStore');
const {getPool,withTransaction}=require('../../math-app/db/database');
const pets=require('./pet.repo');
const users=require('../../math-app/repositories/users.repo');
const ranking=require('./brawl-ranking.repo');
const events=new (require('node:events').EventEmitter)();
const catalog=import('../lib/brawl/catalog.mjs');
const FEE=500;
const active=s=>['preparing','playing'].includes(s.status);
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
let schema;
async function ensure(){await pets.ensureSchema();await ranking.ensure();if(config.db.mode==='json'){store.load().petBrawlDuels??=[];return;}
  schema??=getPool().query(`CREATE TABLE IF NOT EXISTS PetBrawlDuels (MatchID UUID PRIMARY KEY,State JSONB NOT NULL,CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS PetBrawlDuelSeats (StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,MatchID UUID NOT NULL REFERENCES PetBrawlDuels(MatchID) ON DELETE CASCADE);`).catch(e=>{schema=null;throw e;});await schema;
}
async function player(studentId){const user=await users.findById(studentId);if(!user||(user.role||'student')!=='student')fail('學生帳戶已無法參與對戰。',403);await pets.ensureStudent(studentId);await ensure();const c=await catalog;
  await ranking.distribute(Date.now(),studentId);const [rank]=await ranking.profiles([studentId]);
  let balance,owned;if(config.db.mode==='postgres'){const [w,p]=await Promise.all([getPool().query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1',[studentId]),getPool().query('SELECT PetID AS "petId",SpeciesID AS "speciesId" FROM PetInstances WHERE StudentID=$1',[studentId])]);balance=Number(w.rows[0]?.balance||0);owned=p.rows;}
  else{const d=store.load();balance=d.petWallets.find(w=>w.studentId===studentId)?.balance||0;owned=d.petInstances.filter(p=>p.studentId===studentId);}
  return {id:studentId,name:user.name||studentId,className:user.classname||'',balance,rank:ranking.publicRank(rank),pets:owned.filter(p=>c.fighterById(p.speciesId)).map(p=>({petId:p.petId,fighterId:p.speciesId}))};
}
// Two wallets always lock in the same order as teacher grants. Both fees, the
// match and both occupied seats commit together, or none of them do.
async function charge(match,canCommit=()=>true){await ensure();const c=await catalog;
  if(match.players.length!==2||match.players[0].id===match.players[1].id||!c.stageById(match.stageId)||match.version!==c.VERSION||!['friendly','ranked'].includes(match.mode||'friendly'))fail('無效的對戰設定。',400);
  for(const p of match.players)await player(p.id);
  const ids=match.players.map(p=>p.id).sort();
  const check=(wallets,owned)=>{if(!canCommit())fail('邀請已失效，或其中一位同學已離線。');for(const p of match.players){if(!c.fighterById(p.fighterId))fail('這隻角色暫未開放大亂鬥，雙方均未扣款。',403);if(!owned.some(t=>t.studentId===p.id&&t.petId===p.petId&&t.speciesId===p.fighterId))fail('請使用自己擁有的出戰寵物。',403);const balance=Number(wallets.find(w=>w.studentId===p.id)?.balance);if(!Number.isFinite(balance)||balance<FEE)fail('其中一位同學不足 500 金幣，雙方均未扣款。');}};
  const state={...copy(match),mode:match.mode||'friendly',status:'preparing',fee:FEE,createdAt:new Date().toISOString()};
  if(config.db.mode==='postgres')return withTransaction(async client=>{
    const w=(await client.query('SELECT StudentID AS "studentId",Balance AS balance FROM PetWallets WHERE StudentID=ANY($1::text[]) ORDER BY StudentID FOR UPDATE',[ids])).rows;
    const old=(await client.query('SELECT State AS state FROM PetBrawlDuels WHERE MatchID=$1',[state.id])).rows[0]?.state;if(old)return old;
    if((await client.query('SELECT StudentID FROM PetBrawlDuelSeats WHERE StudentID=ANY($1::text[])',[ids])).rows.length)fail('其中一位同學已在另一場對戰。');
    const owned=(await client.query('SELECT StudentID AS "studentId",PetID AS "petId",SpeciesID AS "speciesId" FROM PetInstances WHERE StudentID=ANY($1::text[]) FOR SHARE',[ids])).rows;check(w,owned);
    if(state.mode==='ranked'){const ranks=await ranking.lockProfiles(client,ids);ranking.assertSameTier(ranks,state.rankTier);state.rankTier=ranks[0].tier;}
    await client.query('INSERT INTO PetBrawlDuels (MatchID,State) VALUES ($1,$2::jsonb)',[state.id,JSON.stringify(state)]);
    for(const id of ids){await client.query('INSERT INTO PetBrawlDuelSeats (StudentID,MatchID) VALUES ($1,$2)',[id,state.id]);await client.query('UPDATE PetWallets SET Balance=Balance-$2,UpdatedAt=NOW() WHERE StudentID=$1',[id,FEE]);await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata) VALUES ($1,$2,$2,$3,'brawl_duel_entry',$4,$5::jsonb)`,[randomUUID(),id,-FEE,'brawl-duel:'+state.id,JSON.stringify({matchId:state.id,fee:FEE})]);}return state;
  });
  const d=store.load(),old=d.petBrawlDuels.find(m=>m.id===state.id);if(old)return copy(old);
  if(d.petBrawlDuels.some(m=>active(m)&&m.players.some(p=>ids.includes(p.id))))fail('其中一位同學已在另一場對戰。');
  check(d.petWallets,d.petInstances);
  const walletBefore=ids.map(id=>copy(d.petWallets.find(w=>w.studentId===id))),ledgerLength=d.petCurrencyLedger.length,rankBefore=copy(d.petBrawlRanks);
  try{if(state.mode==='ranked'){const ranks=ranking.jsonProfiles(ids);ranking.assertSameTier(ranks,state.rankTier);state.rankTier=ranks[0].tier;}for(const id of ids){const w=d.petWallets.find(w=>w.studentId===id);w.balance-=FEE;w.updatedAt=state.createdAt;d.petCurrencyLedger.push({transactionId:randomUUID(),studentId:id,actorId:id,delta:-FEE,kind:'brawl_duel_entry',idempotencyKey:'brawl-duel:'+state.id,metadata:{matchId:state.id,fee:FEE,mode:state.mode},createdAt:state.createdAt});}d.petBrawlDuels.push(state);store.save();}
  catch(e){for(const w of walletBefore)Object.assign(d.petWallets.find(t=>t.studentId===w.studentId),w);d.petCurrencyLedger.length=ledgerLength;d.petBrawlRanks=rankBefore;d.petBrawlDuels=d.petBrawlDuels.filter(m=>m.id!==state.id);throw e;}return copy(state);
}
async function read(id){await ensure();if(config.db.mode==='postgres')return (await getPool().query('SELECT State AS state FROM PetBrawlDuels WHERE MatchID::text=$1',[id])).rows[0]?.state;return copy(store.load().petBrawlDuels.find(m=>m.id===id)||null);}
async function finalize(id,change,refund=false){await ensure();const current=await read(id);if(!current)fail('找不到這場對戰。',404);const ids=current.players.map(p=>p.id).sort();
  if(config.db.mode==='postgres')return withTransaction(async client=>{
    const wallets=(await client.query('SELECT StudentID AS "studentId" FROM PetWallets WHERE StudentID=ANY($1::text[]) ORDER BY StudentID FOR UPDATE',[ids])).rows;
    const state=(await client.query('SELECT State AS state FROM PetBrawlDuels WHERE MatchID=$1 FOR UPDATE',[id])).rows[0]?.state;if(!state)fail('找不到這場對戰。',404);if(!active(state))return state;
    const wasPlaying=state.status==='playing';
    Object.assign(state,change,{updatedAt:new Date().toISOString()});
    if(state.mode==='ranked'&&wasPlaying&&state.status==='finished'&&!refund){if(![null,0,1].includes(state.winnerIndex??null))fail('無效的排名結果。',400);await ranking.finishPg(client,state);}
    if(refund){state.refunded=true;for(const w of wallets){const key='brawl-duel-refund:'+id;const ledger=await client.query(`INSERT INTO PetCurrencyLedger (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata) VALUES ($1,$2,$2,$3,'brawl_duel_refund',$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING TransactionID`,[randomUUID(),w.studentId,FEE,key,JSON.stringify({matchId:id,reason:change.reason})]);if(ledger.rows.length)await client.query('UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=NOW() WHERE StudentID=$1',[w.studentId,FEE]);}}
    await client.query('UPDATE PetBrawlDuels SET State=$2::jsonb WHERE MatchID=$1',[id,JSON.stringify(state)]);if(!active(state))await client.query('DELETE FROM PetBrawlDuelSeats WHERE MatchID=$1',[id]);return state;
  });
  const d=store.load(),state=d.petBrawlDuels.find(m=>m.id===id);if(!active(state))return copy(state);const before=copy(state),walletBefore=d.petWallets.filter(w=>ids.includes(w.studentId)).map(copy),length=d.petCurrencyLedger.length,rankBefore=copy(d.petBrawlRanks),wasPlaying=state.status==='playing';
  try{Object.assign(state,change,{updatedAt:new Date().toISOString()});if(state.mode==='ranked'&&wasPlaying&&state.status==='finished'&&!refund){if(![null,0,1].includes(state.winnerIndex??null))fail('無效的排名結果。',400);ranking.finishJson(state);}if(refund){state.refunded=true;for(const w of d.petWallets.filter(w=>ids.includes(w.studentId))){const key='brawl-duel-refund:'+id;if(d.petCurrencyLedger.some(l=>l.studentId===w.studentId&&l.idempotencyKey===key))continue;w.balance+=FEE;w.updatedAt=state.updatedAt;d.petCurrencyLedger.push({transactionId:randomUUID(),studentId:w.studentId,actorId:w.studentId,delta:FEE,kind:'brawl_duel_refund',idempotencyKey:key,metadata:{matchId:id,reason:change.reason},createdAt:state.updatedAt});}}store.save();}
  catch(e){for(const k of Object.keys(state))delete state[k];Object.assign(state,before);for(const w of walletBefore)Object.assign(d.petWallets.find(t=>t.studentId===w.studentId),w);d.petCurrencyLedger.length=length;d.petBrawlRanks=rankBefore;throw e;}return copy(state);
}
async function recover(){await ensure();const rows=config.db.mode==='postgres'?(await getPool().query(`SELECT State AS state FROM PetBrawlDuels WHERE State->>'status' IN ('preparing','playing')`)).rows.map(r=>r.state):store.load().petBrawlDuels.filter(active).map(copy);for(const row of rows)await finalize(row.id,{status:'cancelled',reason:'server_restart',finishedAt:new Date().toISOString()},true);return rows.length;}
async function cancelForStudent(id){await ensure();const rows=config.db.mode==='postgres'?(await getPool().query(`SELECT State AS state FROM PetBrawlDuels WHERE State->>'status' IN ('preparing','playing') AND State->'players' @> $1::jsonb`,[JSON.stringify([{id}])])).rows.map(r=>r.state):store.load().petBrawlDuels.filter(m=>active(m)&&m.players.some(p=>p.id===id));for(const m of rows){const result=await finalize(m.id,{status:'cancelled',reason:'account_removed'},true);events.emit('accountRemoved',{id,match:result});}if(!rows.length)events.emit('accountRemoved',{id});
  if(config.db.mode==='postgres')await getPool().query(`DELETE FROM PetBrawlDuels WHERE State->'players' @> $1::jsonb`,[JSON.stringify([{id}])]);else{store.load().petBrawlDuels=store.load().petBrawlDuels.filter(m=>!m.players.some(p=>p.id===id));store.save();}
}
module.exports={FEE,player,charge,read,finalize,recover,cancelForStudent,events};
