import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoardSnapshots } from './boardSnapshots.mjs';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('short strokes share checkpoints, with only one whole board awaiting acknowledgement', async t => {
    const sent = [];
    let value = 0;
    const queue = createBoardSnapshots({
        intervalMs: 30, ackTimeoutMs: 500,
        build: () => ({ value }),
        send: (board, ack) => sent.push({ board, ack }),
    });
    t.after(() => queue.close());
    queue.connected(); queue.changed();
    await wait(10);
    for (value = 1; value <= 100; value++) queue.changed();
    await wait(45);
    assert.equal(sent.length, 1, 'slow links must not accumulate whole-board packets');
    sent[0].ack({ success: true });
    await wait(15);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board.value, 101, 'encode the current board when sent, not the first stroke');
    sent[1].ack({ success: true });
    assert.equal(queue.pending(), false);
});

test('offline edits survive a lost acknowledgement and wait for confirmed room membership', async t => {
    const sent = [];
    let value = 'first';
    const queue = createBoardSnapshots({ intervalMs: 10, ackTimeoutMs: 100, build: () => value, send: (board, ack) => sent.push({ board, ack }) });
    t.after(() => queue.close());
    queue.connected(); queue.changed(); await wait(5);
    queue.disconnected();
    value = 'offline-latest'; queue.changed();
    sent[0].ack({ success: true });
    await wait(20);
    assert.equal(queue.pending(), true);
    assert.equal(sent.length, 1);
    queue.connected(); await wait(10);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board, 'offline-latest');
    sent[1].ack({ success: true });
    assert.equal(queue.pending(), false);
});

test('lost acknowledgements retry the latest checkpoint, and teacher clear cancels pending work', async t => {
    const sent = [];
    let value = 1;
    const queue = createBoardSnapshots({ intervalMs: 20, ackTimeoutMs: 35, build: () => value, send: (board, ack) => sent.push({ board, ack }) });
    t.after(() => queue.close());
    queue.connected(); queue.changed(); await wait(10);
    value = 2; queue.changed(); await wait(45);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].board, 2);
    queue.reset();
    sent[1].ack({ success: false });
    await wait(50);
    assert.equal(sent.length, 2, 'an obsolete checkpoint must not resurrect a cleared board');
    assert.equal(queue.pending(), false);
});
