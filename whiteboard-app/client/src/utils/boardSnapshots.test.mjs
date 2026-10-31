import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoardSnapshots } from './boardSnapshots.mjs';

// Deterministic deadlines: classroom load in another process must not change
// the ordering being tested. The sustained load harness still uses real time.
const clock = t => { t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 }); return ms => { t.mock.timers.tick(ms); t.mock.timers.tick(0); }; };

test('gesture ends publish the final state promptly without sending more than four settled checkpoints a second',t=>{
    const advance=clock(t),sent=[];let value=0;
    const queue=createBoardSnapshots({build:()=>({value}),send:(data,ack)=>{sent.push(data.value);ack({success:true});}});t.after(()=>queue.close());queue.connected();
    queue.changed();advance(0);
    for(let i=1;i<=10;i++){value=i;queue.changed();queue.settled();advance(20);}
    assert.equal(sent.length,1);advance(50);assert.deepEqual(sent,[0,10]);
    assert.equal(queue.pending(),false);
});

test('short strokes share checkpoints, with only one whole board awaiting acknowledgement', t => {
    const advance = clock(t);
    const sent = [];
    let value = 0;
    const queue = createBoardSnapshots({
        intervalMs: 30, ackTimeoutMs: 500,
        build: () => ({ value }),
        send: (board, ack) => sent.push({ board, ack }),
    });
    t.after(() => queue.close());
    queue.connected(); queue.changed();
    advance(10);
    for (value = 1; value <= 100; value++) queue.changed();
    advance(45);
    assert.equal(sent.length, 1, 'slow links must not accumulate whole-board packets');
    sent[0].ack({ success: true });
    advance(15);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board.value, 101, 'encode the current board when sent, not the first stroke');
    sent[1].ack({ success: true });
    assert.equal(queue.pending(), false);
});

test('offline edits survive a lost acknowledgement and wait for confirmed room membership', t => {
    const advance = clock(t);
    const sent = [];
    let value = 'first';
    const queue = createBoardSnapshots({ intervalMs: 10, ackTimeoutMs: 100, build: () => value, send: (board, ack) => sent.push({ board, ack }) });
    t.after(() => queue.close());
    queue.connected(); queue.changed(); advance(5);
    queue.disconnected();
    value = 'offline-latest'; queue.changed();
    sent[0].ack({ success: true });
    advance(20);
    assert.equal(queue.pending(), true);
    assert.equal(sent.length, 1);
    queue.connected(); advance(10);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board, 'offline-latest');
    sent[1].ack({ success: true });
    assert.equal(queue.pending(), false);
});

test('lost acknowledgements retry the latest checkpoint, and teacher clear cancels pending work', t => {
    const advance = clock(t);
    const sent = [];
    let value = 1;
    const queue = createBoardSnapshots({ intervalMs: 20, ackTimeoutMs: 35, build: () => value, send: (board, ack) => sent.push({ board, ack }) });
    t.after(() => queue.close());
    queue.connected(); queue.changed(); advance(10);
    value = 2; queue.changed(); advance(45);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board, 2);
    queue.reset();
    sent[1].ack({ success: false });
    advance(50);
    assert.equal(sent.length, 2, 'an obsolete checkpoint must not resurrect a cleared board');
    assert.equal(queue.pending(), false);
});
