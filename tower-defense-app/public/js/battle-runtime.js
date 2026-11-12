// A scene is playable only after it renders a frame. The XHR deadline does not
// cover image decoding, renderer boot, or a context that never comes back.
export function mountBattle(simulation, makeScene, hooks = {}, { readyTimeoutMs = 30000, restoreTimeoutMs = 5000 } = {}) {
  let game, generation = 0, timer, recovery, stopped = false, failed = false;
  let pausedBeforeFailure = simulation.state.paused, suspended = false, disposers = [], retry;
  const report = (stage, detail) => hooks.diagnostic?.(stage, detail);
  function clearListeners() { clearTimeout(timer); for (const dispose of disposers.splice(0)) dispose(); }
  function fail(stage) {
    if (stopped || failed) return;
    failed = true; clearTimeout(timer);
    if (!suspended) pausedBeforeFailure = simulation.state.paused;
    suspended = true;
    simulation.togglePause(true); hooks.onUnavailable?.(); report(stage);
    const error = new Error('Battlefield preparation interrupted');
    if (retry) { retry.reject(error); retry = null; return; }
    recovery = window.BuiLoading?.recover(error, () => restart(), undefined, { automatic: true });
  }
  function boot(canvas = false) {
    const token = ++generation; failed = false;
    report('assets-start');
    timer = setTimeout(() => fail('render-timeout'), readyTimeoutMs);
    const scene = makeScene({
      onReady: readyScene => {
        const current = readyScene.game;
        current.events.once('postrender', () => {
          if (stopped || token !== generation || failed || current.renderer?.contextLost) return;
          clearTimeout(timer); simulation.togglePause(pausedBeforeFailure); suspended = false;
          report('first-frame'); hooks.onReady?.(readyScene);
          retry?.resolve(); retry = null; recovery?.(); recovery = null;
        });
      },
      onLoadFailed: () => fail('render-timeout'),
      onProgress: (progress, loader) => report('assets-progress', { progress: Math.round(progress * 100),
        inflight: loader.inflight?.size || 0, processing: loader.queue?.size || 0 }),
    });
    // Probe-time WebGL support does not guarantee that another context can be
    // created on an iPad with several open game tabs. A retry uses Canvas.
    try {
      game = new Phaser.Game({ type: canvas ? Phaser.CANVAS : Phaser.AUTO,
        parent: 'gameCanvas', width: 1280, height: 720, transparent: true,
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
        render: { antialias: true, roundPixels: false, pixelArt: false },
        scene: [scene], fps: { target: 60, min: 30 },
        loader: { maxParallelDownloads: 4, timeout: 10000, maxRetries: 1 },
      });
      const lost = () => {
        if (stopped || token !== generation || failed) return;
        pausedBeforeFailure = simulation.state.paused;
        suspended = true;
        simulation.togglePause(true); hooks.onUnavailable?.(); report('context-lost');
        recovery ||= window.BuiLoading?.recover(new Error('Graphics interrupted'), () => restart());
        clearTimeout(timer); timer = setTimeout(() => fail('render-timeout'), restoreTimeoutMs);
      };
      const restored = () => {
        if (stopped || token !== generation || failed) return;
        game.events.once('postrender', () => {
          if (stopped || token !== generation || failed || game.renderer?.contextLost) return;
          clearTimeout(timer); simulation.togglePause(pausedBeforeFailure); suspended = false;
          recovery?.(); recovery = null; report('context-restored'); hooks.onReady?.(scene);
        });
      };
      game.events.once('ready', () => {
        if (stopped || token !== generation) return;
        game.renderer.on('losewebgl', lost); game.renderer.on('restorewebgl', restored);
        disposers.push(() => { game?.renderer?.off('losewebgl', lost); game?.renderer?.off('restorewebgl', restored); });
      });
    } catch { fail('render-timeout'); }
  }
  function destroy() {
    clearListeners(); generation++;
    const old = game; game = null;
    if (!old) return Promise.resolve();
    for (const scene of old.scene?.scenes || []) for (const file of scene.load?.queue || []) {
      const image = file.data;
      if (image instanceof HTMLImageElement && image.src.startsWith('blob:')) {
        image.onload = null; image.onerror = null; URL.revokeObjectURL(image.src); image.src = '';
      }
    }
    old.canvas?.remove();
    return new Promise(resolve => {
      old.events.once('destroy', resolve); old.destroy(true);
      // A renderer that failed during boot has no frame loop to consume the
      // pending destroy flag. Complete Phaser's teardown in that case.
      if (!old.isRunning) old.runDestroy();
    });
  }
  function restart() {
    if (stopped) return Promise.reject(new DOMException('Game closed', 'AbortError'));
    if (retry) return retry.promise;
    report('retry-scene');
    const promise = new Promise((resolve, reject) => { retry = { resolve, reject }; });
    retry.promise = promise;
    void destroy().then(() => { if (!stopped) boot(true); });
    return promise;
  }
  boot();
  return { get game() { return game; }, restart, close() {
    stopped = true; recovery?.(); recovery = null;
    retry?.reject(new DOMException('Game closed', 'AbortError')); retry = null;
    void destroy();
  } };
}
