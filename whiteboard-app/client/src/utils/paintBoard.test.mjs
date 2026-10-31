import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { decodeStrokes, paintStrokes } from './paintBoard.js';
const { packStrokes, pointCount } = createRequire(import.meta.url)('../../../server/board-vectors');
test('compact checkpoints preserve pen/eraser geometry and render the same operations', () => {
    const strokes = [{ color: '#123456', size: 2, points: [{ x: .1, y: .2 }, { x: .7, y: .8 }] },
        { isEraser: true, size: 20, points: [{ x: .4, y: .3 }] }];
    const packed = packStrokes(strokes);
    assert.equal(pointCount(packed), 3);
    assert.deepEqual(decodeStrokes(packed), strokes);
    assert.equal(JSON.stringify(packed).includes('"x"'), false);
    const operations = source => {
        const result = [];
        const ctx = new Proxy({}, { get: (_, name) => (...args) => result.push([name,...args]),
            set: (_, name, value) => { result.push([name,value]); return true; } });
        paintStrokes(ctx,source,800,600); return result;
    };
    assert.deepEqual(operations(packed),operations(strokes));
});
