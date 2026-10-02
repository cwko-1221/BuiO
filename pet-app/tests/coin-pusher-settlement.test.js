'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createServer } = require('vite');

test('settlement budgets cannot rewind; outbox retries back off and respect terminal errors', async t => {
  const vite = await createServer({root:path.resolve(__dirname,'..'),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  t.after(()=>vite.close());
  const {CoinPusherSettlementRetries,settledCoinPusherRemaining} = await vite.ssrLoadModule('/src/game/CoinPusherSettlement.ts');
  assert.equal(settledCoinPusherRemaining(3,99),3,'lost old reply cannot replenish a nearly exhausted play');
  assert.equal(settledCoinPusherRemaining(0,99),0,'a completed play stays exhausted');
  assert.equal(settledCoinPusherRemaining(100,97),97);
  assert.equal(settledCoinPusherRemaining(97,NaN),97);
  const retries = new CoinPusherSettlementRetries();
  assert.equal(retries.fail('a',new Error('offline'),0),true);
  assert.equal(retries.canAttempt('a',4999),false);
  assert.equal(retries.canAttempt('fresh-catch',4999),false,'new coins cannot bypass outage backoff');
  assert.equal(retries.canAttempt('a',5000),true);
  retries.fail('a',{status:503},5000);
  assert.equal(retries.nextAttempt(['a','new'],5000),15000);
  retries.fail('a',{status:429,retryAfterMs:45000},15000);
  assert.equal(retries.nextAttempt(['a'],15000),60000,'honor Retry-After');
  retries.succeed('a');
  for(const status of [400,401,403,404,409]) {
    const id=String(status);
    assert.equal(retries.fail(id,{status},60000),false);
    assert.equal(retries.canAttempt(id,1000000),false,'keep rejected events, but do not auto-retry');
    assert.equal(retries.nextAttempt([id],1000000),Infinity);
  }
  for(let i=0;i<12;i++)retries.fail('long-outage',{status:503},1000000);
  assert.equal(retries.nextAttempt(['long-outage'],1000000),1060000,'backoff caps at one minute');
});

test('API failures preserve status, Retry-After and correlation id; malformed replies remain retryable', async t => {
  const vite=await createServer({root:path.resolve(__dirname,'..'),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  t.after(()=>vite.close());
  const previousWindow=global.window,previousFetch=global.fetch;
  global.window={setTimeout,clearTimeout,BuiI18n:{t:key=>key}};
  t.after(()=>{global.window=previousWindow;global.fetch=previousFetch;});
  const {api,ApiError}=await vite.ssrLoadModule('/src/api.ts');
  global.fetch=async()=>new Response(JSON.stringify({success:false,message:'limit'}),{status:429,headers:{'Content-Type':'application/json','Retry-After':'7','X-Request-ID':'qa-request'}});
  await assert.rejects(api.payoutCoinPusher({playId:'play',eventId:'event',amount:1},'key'),error=>error instanceof ApiError&&error.status===429&&error.retryAfterMs===7000&&error.requestId==='qa-request');
  global.fetch=async()=>new Response('not JSON',{status:200});
  await assert.rejects(api.payoutCoinPusher({playId:'play',eventId:'event',amount:1},'key'),error=>error.status===502);
  global.fetch=async()=>new Response(JSON.stringify({success:false,message:'signed out'}),{status:401});
  await assert.rejects(api.payoutCoinPusher({playId:'play',eventId:'event',amount:1},'key'),error=>error.status===401);
});

test('terminal payout decisions persist; exhausted plays block their whole outbox without losing evidence', async t => {
  const vite=await createServer({root:path.resolve(__dirname,'..'),server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
  t.after(()=>vite.close());
  const {rejectCoinPusherPayout,coinPusherPayoutEventId}=await vite.ssrLoadModule('/src/game/CoinPusherSettlement.ts');
  const event=(playId,eventId)=>({playId,eventId,amount:1,requestKey:`key-${eventId}`});
  const capEvents=[event('spent','a'),event('spent','b'),event('fresh','c')];
  const error=Object.assign(new Error('Coin-pusher payout limit reached'),{status:409,requestId:'trace-cap'});
  const rejected=rejectCoinPusherPayout(capEvents,capEvents[0],error);
  assert.equal(rejected.exhaustedPlay,true);
  assert.equal(capEvents[0].rejection.requestId,'trace-cap');
  assert.deepEqual(capEvents[1].rejection,capEvents[0].rejection,'all queued catches on a spent play stop');
  assert.equal(capEvents[2].rejection,undefined,'other paid plays can still settle');
  const restored=JSON.parse(JSON.stringify(capEvents));
  assert.deepEqual(restored,capEvents,'review evidence survives the exact session JSON representation');
  assert.deepEqual(restored.map(e=>[e.eventId,e.requestKey,e.amount]),[['a','key-a',1],['b','key-b',1],['c','key-c',1]],'never rewrite or reassign an uncertain reward');

  const mismatch=[event('play','old'),event('play','new')];
  rejectCoinPusherPayout(mismatch,mismatch[0],Object.assign(new Error('Payout event already used'),{status:409}));
  assert.equal(mismatch[0].rejection.status,409);
  assert.equal(mismatch[1].rejection,undefined,'a conflicting event does not reject unrelated catches');
  for(const status of [0,401,403,408,429,500,503]){
    const pending=[event('play',String(status))];
    assert.equal(rejectCoinPusherPayout(pending,pending[0],Object.assign(new Error('recoverable'),{status})),undefined);
    assert.equal(pending[0].rejection,undefined,'sign-in and network failures remain recoverable');
  }
  const ids=Array.from({length:100},()=>coinPusherPayoutEventId('same-play'));
  assert.equal(new Set(ids).size,100,'new tabs or restored counters cannot repeat catch IDs');
  assert.ok(ids.every(id=>id.startsWith('same-play:')&&id.length<=120));
});
