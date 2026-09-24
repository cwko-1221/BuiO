const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('the forward-timing chime is distinct, soft, and silenced by the arcade mute', async (t) => {
  const originals = new Map(['AudioContext', 'document', 'localStorage', 'window'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]));
  const restoreGlobal = (key) => {
    const descriptor = originals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  };
  const frequencies = [];
  const fakeWindow = {
    nextTimerId: 0,
    timers: new Map(),
    setTimeout(callback, delay) {
      const id = ++this.nextTimerId;
      this.timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { this.timers.delete(id); },
  };
  const fakeDocument = {
    hidden: false,
    listeners: new Map(),
    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) ?? new Set();
      listeners.add(listener);
      this.listeners.set(name, listeners);
    },
    dispatch(name) { for (const listener of this.listeners.get(name) ?? []) listener(); },
  };
  class FakeAudioParam {
    value = 0;
    ramps = [];
    constructor(onSet = () => undefined) { this.onSet = onSet; }
    setValueAtTime(value) { this.value = value; this.onSet(value); this.ramps.push(value); }
    exponentialRampToValueAtTime(value) { this.value = value; this.ramps.push(value); }
  }
  class FakeGainNode {
    gain = new FakeAudioParam();
    connect(destination) { return destination; }
  }
  class FakeOscillator {
    frequency = new FakeAudioParam((value) => frequencies.push(value));
    type = 'sine';
    connect(destination) { return destination; }
    start() {}
    stop() {}
  }
  class FakeAudioContext {
    currentTime = 0;
    state = 'running';
    destination = {};
    gains = [];
    listeners = new Map();
    addEventListener(name, listener) {
      const listeners = this.listeners.get(name) ?? new Set();
      listeners.add(listener);
      this.listeners.set(name, listeners);
    }
    dispatch(name) { for (const listener of this.listeners.get(name) ?? []) listener(); }
    async resume() { this.state = 'running'; this.dispatch('statechange'); }
    createGain() {
      const gain = new FakeGainNode();
      this.gains.push(gain);
      return gain;
    }
    createOscillator() { return new FakeOscillator(); }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, writable: true, value: FakeAudioContext });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: () => null, setItem: () => undefined },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true, writable: true,
    value: fakeWindow,
  });
  t.after(() => { for (const key of originals.keys()) restoreGlobal(key); });

  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  t.after(() => vite.close());
  const { AudioEngine } = await vite.ssrLoadModule('/src/audio.ts');
  const audio = new AudioEngine();
  audio.noise = () => undefined;
  await audio.unlock();
  assert.equal(fakeWindow.timers.size, 1, 'the unlocked arcade should schedule exactly one next music beat');

  frequencies.length = 0;
  const before = audio.context.gains.length;
  audio.sfx('arcadeTiming', 3);
  assert.deepEqual(frequencies, [1175, 1568], 'a forward landing should play its own two-note chime');
  const timingEnvelopes = audio.context.gains.slice(before);
  assert.equal(timingEnvelopes.length, 2, 'the timing cue should use two short voices, not a large chord');
  assert.ok(timingEnvelopes.every((node) => node.gain.ramps.includes(.045)),
    'the timing chime should stay softer than the regular payout sound');

  fakeDocument.hidden = true;
  fakeDocument.dispatch('visibilitychange');
  assert.equal(fakeWindow.timers.size, 0, 'backgrounding the app must stop the recurring music timer');
  assert.equal(audio.master.gain.value, 0, 'all audio should fade out while the app is hidden');
  const backgroundFrequencyCount = frequencies.length;
  audio.sfx('arcadeTiming', 3);
  assert.equal(frequencies.length, backgroundFrequencyCount, 'backgrounded pages must not schedule game sound effects');

  fakeDocument.hidden = false;
  fakeDocument.dispatch('visibilitychange');
  assert.equal(fakeWindow.timers.size, 1, 'returning to a visible, running context should resume one music timer');
  assert.equal(audio.master.gain.value, .85, 'foreground audio should restore the user-selected master level');

  audio.setEnabled(false);
  assert.equal(fakeWindow.timers.size, 0, 'muting should stop scheduling music rather than only hiding its output');
  assert.equal(audio.master.gain.value, 0, 'muting should silence the master bus');
  const mutedFrequencyCount = frequencies.length;
  audio.sfx('arcadeTiming', 3);
  assert.equal(frequencies.length, mutedFrequencyCount, 'mute must silence the forward-timing cue too');

  audio.setEnabled(true);
  assert.equal(fakeWindow.timers.size, 1, 'unmuting should restart one music timer');
  audio.setLevels(0, .58);
  assert.equal(fakeWindow.timers.size, 0, 'zero music volume should stop scheduling music while preserving SFX');
  const musicDisabledFrequencyCount = frequencies.length;
  audio.sfx('arcadeTiming', 3);
  assert.equal(frequencies.length, musicDisabledFrequencyCount + 2, 'turning music off must leave enabled sound effects available');

  audio.setLevels(.36, .58);
  assert.equal(fakeWindow.timers.size, 1, 'restoring music volume should restart the timer while audio is running');
  audio.context.state = 'suspended';
  audio.context.dispatch('statechange');
  assert.equal(fakeWindow.timers.size, 0, 'a browser-suspended AudioContext must not accumulate background beats');
  await audio.unlock();
  assert.equal(fakeWindow.timers.size, 1, 'the next user gesture should resume audio and its single music timer');
});
