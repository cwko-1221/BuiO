// Load before the game and its network dependencies: slow startup must not leave
// the student page without gesture protection. Hold controls still use pointers.
(function () {
  'use strict';
  const options = { capture: true, passive: false };
  const touches = new Map();
  let multiple = false;
  let lastTap = null;
  const stop = event => { if (event.cancelable) event.preventDefault(); };
  const control = target => target?.closest?.('button,a[href],input,select,textarea');

  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) {
    document.addEventListener(type, stop, options);
  }
  document.addEventListener('touchstart', event => {
    if (event.touches.length > 1) { multiple = true; lastTap = null; stop(event); }
    for (const touch of event.changedTouches) {
      touches.set(touch.identifier, { x: touch.clientX, y: touch.clientY,
        time: performance.now(), target: event.target, moved: false });
    }
  }, options);
  document.addEventListener('touchmove', event => {
    for (const touch of event.changedTouches) {
      const start = touches.get(touch.identifier);
      if (start && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 12) start.moved = true;
    }
    if (event.touches.length > 1 || event.target?.closest?.('#gameScreen')) stop(event);
  }, options);
  document.addEventListener('touchend', event => {
    const now = performance.now();
    for (const touch of event.changedTouches) {
      const start = touches.get(touch.identifier);
      touches.delete(touch.identifier);
      if (!start || start.moved || multiple || now - start.time > 700) continue;
      const target = control(start.target) || start.target;
      const repeated = lastTap && now - lastTap.time <= 500
        && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) <= 64;
      if (repeated) {
        stop(event);
        // A modal can replace the target between taps. Preserve a deliberate tap
        // on the new button while refusing Safari's native zoom/synthetic click.
        if (target !== lastTap.target && target?.isConnected && control(target) === target
          && !target.matches(':disabled') && typeof target.click === 'function') target.click();
      }
      // Keep the latest tap, including a refused one, so triple/repeated tapping
      // never opens another unguarded pair. Canvas and jump controls count too.
      lastTap = { time: now, x: touch.clientX, y: touch.clientY, target };
    }
    if (multiple) stop(event);
    if (!event.touches.length) multiple = false;
  }, options);
  document.addEventListener('touchcancel', () => { touches.clear(); multiple = false; lastTap = null; }, options);
  window.addEventListener('blur', () => { touches.clear(); multiple = false; lastTap = null; });
  window.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) stop(event); }, options);
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && (['+', '=', '-', '_', '0'].includes(event.key)
      || ['NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(event.code))) stop(event);
  }, options);
  window.BuiGameTouchGuard = true;
})();
