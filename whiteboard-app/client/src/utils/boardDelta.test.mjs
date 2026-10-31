import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoardDelta } from './boardDelta.mjs';
const stroke = i => ({ color: '#111827', size: 2, points: [{ x: i / 100, y: .2 }, { x: .4, y: .5 }] });

test('growing boards send only the mutable tail; lost acknowledgements do not omit ink', () => {
    const codec = createBoardDelta(); codec.generation('class-one');
    const strokes = Array.from({ length: 100 }, (_, i) => stroke(i));
    const state = { strokes, shapes: [], baseImageData: null };
    const first = codec.build(state); assert.equal(first.replace, true);
    codec.result(first, { success: true });
    strokes[99].points.push({ x: .8, y: .7 }); strokes.push(stroke(101));
    const delta = codec.build(state);
    assert.equal(delta.start, 99); assert.equal(delta.strokes.length, 2);
    assert.ok(JSON.stringify(delta).length < JSON.stringify(first).length / 10);
    strokes.push(stroke(102));
    const retry = codec.build(state); assert.equal(retry.start, 99); assert.equal(retry.strokes.length, 3);
    codec.result(retry, { success: true }); codec.result(delta, { success: true });
    assert.equal(codec.build(state).start, 101, 'late ack cannot move the baseline backwards');
});

test('teacher clear, raster replacement and restart reject obsolete acknowledgements', () => {
    const codec = createBoardDelta(); codec.generation('before-clear');
    const state = { strokes: [stroke(1)], shapes: [], baseImageData: null };
    const old = codec.build(state); codec.generation('after-clear');
    codec.result(old, { success: true });
    const next = codec.build({ ...state, strokes: [] });
    assert.equal(next.boardGeneration, 'after-clear'); assert.equal(next.replace, true);
    codec.result(next, { success: true });
    assert.equal(codec.build({ ...state, baseImageData: 'data:image/png;base64,new' }).replace, true);
    codec.result(codec.build(state), { success: false, needsReset: true, boardGeneration: 'restart' });
    assert.equal(codec.build(state).boardGeneration, 'restart');
    assert.equal(codec.build(state).replace, true);
});

test('simultaneous teacher and student ink repairs an earlier growing stroke', () => {
    const codec = createBoardDelta(); codec.generation('same-board');
    const state = { strokes: [stroke(1), stroke(2), stroke(3)], shapes: [], baseImageData: null };
    const first = codec.build(state); codec.result(first, { success: true });
    state.strokes[0].points.push({ x: .9, y: .8 });
    state.strokes[2].points.push({ x: .6, y: .3 });
    const update = codec.build(state);
    assert.equal(update.start, 0, 'earlier teacher stroke must not be omitted');
    assert.equal(update.strokes[0].points.length, 3);
    assert.equal(update.strokes[2].points.length, 3);
});

test('a cold server checkpoint cannot replace newer acknowledged local ink', () => {
    const codec = createBoardDelta(); codec.generation('same-board');
    const state = { strokes: [stroke(1)], shapes: [], baseImageData: null };
    const first = codec.build(state); codec.result(first, { success: true });
    state.strokes.push(stroke(2));
    const latest = codec.build(state); codec.result(latest, { success: true });
    codec.reset(); // Transport reconnect keeps the last server acknowledgement.
    assert.equal(codec.isOlder(first), true);
    assert.equal(codec.isOlder(latest), false);
    codec.generation('teacher-cleared');
    assert.equal(codec.isOlder(first), false, 'a new authoritative generation supersedes local ink');
});
