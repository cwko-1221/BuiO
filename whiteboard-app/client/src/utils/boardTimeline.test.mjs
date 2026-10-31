import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoardTimeline } from './boardTimeline.mjs';
const event=(order,origin='student',extra={})=>({origin,liveOrder:{epoch:'runtime',order},...extra});
test('an older checkpoint keeps all newer edits, even those received before the checkpoint',()=>{
    const t=createBoardTimeline();for(let i=1;i<=5;i++)t.record(event(i));
    assert.deepEqual(t.confirm({epoch:'runtime',student:2,teacher:0}).map(e=>e.liveOrder.order),[3,4,5]);
    t.record(event(6,'teacher'));assert.deepEqual(t.confirm({epoch:'runtime',student:5,teacher:0}).map(e=>e.liveOrder.order),[6]);
    assert.deepEqual(t.confirm({epoch:'runtime',student:5,teacher:6}),[]);
});
test('teacher echoes acknowledge local ink without painting it twice',()=>{
    const t=createBoardTimeline();assert.equal(t.record({eventId:'local',origin:'teacher',x:.3}),true);
    assert.equal(t.record(event(4,'teacher',{eventId:'local',x:.3})),false);
    assert.equal(t.confirm({epoch:'runtime',student:0,teacher:0}).length,1);
    assert.equal(t.confirm({epoch:'runtime',student:0,teacher:4}).length,0);
    assert.equal(t.record(event(4,'teacher')),false);
});
test('superseded checkpoints cannot replace newer accepted contents; process epochs reset orders',()=>{
    const t=createBoardTimeline();t.record(event(3));t.confirm({epoch:'runtime',student:3,teacher:0});
    assert.equal(t.confirm({epoch:'runtime',student:2,teacher:0}),null);
    assert.deepEqual(t.confirm({epoch:'restart',student:0,teacher:0}),[]);
    assert.equal(t.record({origin:'student',liveOrder:{epoch:'restart',order:1}}),true);
});
test('bounded history skips checkpoints that would lose evicted newer edits',()=>{
    const t=createBoardTimeline();for(let i=1;i<=5000;i++)t.record(event(i));
    assert.equal(t.confirm({epoch:'runtime',student:0,teacher:0}),null);
    assert.equal(t.confirm({epoch:'runtime',student:1000,teacher:0}).length,4000);
});
