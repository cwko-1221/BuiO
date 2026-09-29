'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { createServer } = require('vite');

test('cabinet locks native browser gestures without consuming game inputs and restores them on exit', async t => {
  const vite = await createServer({ root: path.resolve(__dirname, '..'), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  t.after(() => vite.close());
  const { lockCoinPusherBrowserInteractions } = await vite.ssrLoadModule('/src/game/CoinPusherBrowserInteractions.ts');
  const previousDocument = global.document, previousWindow = global.window;
  t.after(() => { global.document = previousDocument; global.window = previousWindow; });
  const classes = new Set();
  let content = 'width=device-width, initial-scale=2, maximum-scale=4, viewport-fit=cover';
  const original = content;
  const viewport = {
    getAttribute: () => content,
    setAttribute: (_key, value) => { content = value; },
    removeAttribute: () => { content = null; },
    set content(value) { content = value; },
  };
  const doc = new EventTarget();
  doc.documentElement = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) } };
  doc.querySelector = () => viewport;
  global.document = doc;
  let selectionClears = 0;
  const selection = { rangeCount: 1, removeAllRanges() { this.rangeCount = 0; selectionClears++; } };
  global.window = { getSelection: () => selection };
  const dispatch = (type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    doc.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const release = lockCoinPusherBrowserInteractions();
  assert.equal(classes.has('coin-pusher-input-locked'), true);
  assert.equal(content, 'width=device-width, viewport-fit=cover, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no');
  assert.equal(selectionClears, 1);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) assert.equal(dispatch(type), true, type);
  for (const type of ['touchstart', 'touchmove']) {
    assert.equal(dispatch(type, { touches: [{}, {}] }), true, 'pinch is blocked');
    assert.equal(dispatch(type, { touches: [{}] }), false, 'single finger swipe/scroll is preserved');
  }
  assert.equal(dispatch('wheel', { ctrlKey: true }), true);
  assert.equal(dispatch('wheel', { metaKey: true }), true);
  assert.equal(dispatch('wheel'), false, 'normal dialog scrolling is preserved');
  for (const key of ['+', '=', '-', '0']) for (const modifier of ['ctrlKey', 'metaKey']) assert.equal(dispatch('keydown', { key, [modifier]: true }), true);
  assert.equal(dispatch('keydown', { code: 'NumpadAdd', ctrlKey: true }), true);
  for (const key of [' ', 'ArrowLeft', 'ArrowRight', 'Escape', 'Tab', '+']) assert.equal(dispatch('keydown', { key }), false, 'game and focus keys still work');
  assert.equal(dispatch('keydown', { key: 'c', ctrlKey: true }), false);
  let propagated = false;
  doc.addEventListener('wheel', () => { propagated = true; }, { once: true });
  dispatch('wheel', { ctrlKey: true });
  assert.equal(propagated, true, 'handlers do not stop application events');
  selection.rangeCount = 1;
  dispatch('selectionchange');
  assert.equal(selectionClears, 2);
  release();
  release();
  assert.equal(content, original, 'exact viewport restored, including safe areas');
  assert.equal(classes.has('coin-pusher-input-locked'), false);
  for (const type of ['gesturestart', 'dblclick', 'contextmenu', 'selectstart', 'dragstart']) assert.equal(dispatch(type), false, 'exit removes listeners');
  assert.equal(dispatch('touchmove', { touches: [{}, {}] }), false);
  assert.equal(dispatch('keydown', { key: '+', ctrlKey: true }), false);
  assert.equal(dispatch('wheel', { ctrlKey: true }), false);
  selection.rangeCount = 1;
  dispatch('selectionchange');
  assert.equal(selectionClears, 2, 'bedroom text can be selected');

  content = null;
  const releaseAgain = lockCoinPusherBrowserInteractions();
  releaseAgain();
  assert.equal(content, null, 'missing content attribute stays absent');
  doc.querySelector = () => null;
  const releaseWithoutMeta = lockCoinPusherBrowserInteractions();
  releaseWithoutMeta();
  assert.equal(classes.size, 0, 'no viewport meta is required to clean up');
});
