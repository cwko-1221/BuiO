// Installed at document start by the native iOS host. This does not modify
// requests, authentication, gameplay, input timing or authoritative results.
(function () {
  'use strict';
  if (window.BuiOMobile) return;
  Object.defineProperty(window, 'BuiOMobile', { value: Object.freeze({
    platform: 'ios', mode: 'online-compatibility-pilot', version: '0.2.0',
    viewport: 'edge-to-edge'
  }), writable: false });
  const mobileCSS = /* BUIO_MOBILE_CSS */ '';
  const setupLayout = () => {
    if (!document.documentElement || !document.head) return false;
    const root = document.documentElement;
    root.setAttribute('data-buio-app', 'ios');
    root.setAttribute('data-buio-page', /^\/(?:index\.html)?$/.test(location.pathname) ? 'hub' : 'module');
    const section = location.pathname.split('/')[1].replace(/\.html$/, '');
    root.setAttribute('data-buio-module', ['math', 'login', 'quiz', 'dashboard', 'teacher-topics', 'tag-picker'].includes(section) ? 'math' : section);
    // Keep text zoom available; remove old scale caps on learning pages. The
    // native frame already excludes the notch and home indicator on all sides.
    let viewports = [...document.querySelectorAll('meta[name="viewport"]')];
    if (!viewports.length) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.append(viewport);
      viewports = [viewport];
    }
    const content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    for (const viewport of viewports) if (viewport.content !== content) viewport.content = content;
    if (!document.getElementById('buio-mobile-layout')) {
      const style = document.createElement('style');
      style.id = 'buio-mobile-layout';
      style.textContent = mobileCSS;
      document.head.append(style);
    }
    return true;
  };
  // At document start <head> may not exist yet. Watch only the initial parse;
  // do not observe the changing game DOM for the lifetime of a match.
  const layoutObserver = new MutationObserver(setupLayout);
  layoutObserver.observe(document, { childList: true, subtree: true });
  setupLayout();
  const formSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea';
  const fitFormField = field => {
    if (field?.matches(formSelector) && matchMedia('(max-width: 1100px)').matches &&
        parseFloat(getComputedStyle(field).fontSize) < 16) {
      field.style.setProperty('font-size', '16px', 'important');
    }
  };
  const finishLayout = () => {
    setupLayout();
    const style = document.getElementById('buio-mobile-layout');
    // Preserve each module's authored spacing while adding system safe areas.
    // Read once after its stylesheets load, before enabling document insets.
    style.disabled = true;
    const bodyStyle = getComputedStyle(document.body);
    for (const edge of ['Top', 'Right', 'Bottom', 'Left']) {
      document.documentElement.style.setProperty('--buio-body-pad-' + edge.toLowerCase(), bodyStyle['padding' + edge]);
    }
    style.disabled = false;
    document.querySelectorAll(formSelector).forEach(fitFormField);
    layoutObserver.disconnect();
    updatePresentation();
    const shell = document.querySelector('.pet-shell');
    if (shell) new MutationObserver(updatePresentation).observe(shell, { attributes: true, attributeFilter: ['data-screen'] });
  };
  let lastPresentation = '';
  function updatePresentation() {
    if (!document.body) return;
    const root = document.documentElement;
    const module = root.getAttribute('data-buio-module');
    const petScreen = document.querySelector('.pet-shell')?.getAttribute('data-screen') || '';
    const fullscreen = ['pet', 'science-lab', 'whiteboard'].includes(module) ||
      Boolean(document.querySelector('#gameCanvas, #game-container, #gameContainer'));
    root.setAttribute('data-buio-layout', fullscreen ? 'fullscreen' : 'document');
    const palette = {
      pet: '#f3e7d6', 'science-lab': '#082f3d', math: '#0b0e1a',
      games: '#0d1023', game: '#111827', 'tower-defense': '#101b30'
    };
    const background = palette[module] || '#f6f8fb';
    const immersive = module === 'science-lab' || (module === 'pet' && ['park', 'coin-pusher'].includes(petScreen));
    root.setAttribute('data-buio-immersive', String(immersive));
    const message = { immersive, background, lightStatus: ['math', 'games', 'game', 'tower-defense', 'science-lab'].includes(module) };
    const serialized = JSON.stringify(message);
    if (serialized !== lastPresentation) {
      window.webkit?.messageHandlers?.buioLayout?.postMessage(message);
      lastPresentation = serialized;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', finishLayout, { once: true });
  else finishLayout();
  // Dynamic forms need the same minimum before iOS focuses the field. Larger
  // authored text (for example the maths answer box) keeps its original size.
  document.addEventListener('pointerdown', event => fitFormField(event.target.closest?.(formSelector)), true);
  document.addEventListener('focusin', event => fitFormField(event.target), true);
  addEventListener('pageshow', updatePresentation);
  addEventListener('popstate', updatePresentation);
  let notice;
  const refresh = () => {
    if (!document.body) return;
    if (navigator.onLine !== false) { notice?.remove(); notice = undefined; return; }
    if (notice) return;
    notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = '網絡已中斷，正在等待重新連線';
    // A transient network notice, not a fixed app toolbar over game controls.
    notice.style.cssText = 'position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;padding:12px 16px;border-radius:10px;background:#273f3c;color:white;font:14px -apple-system,sans-serif;text-align:center;pointer-events:none;box-shadow:0 3px 16px #0002';
    document.body.append(notice);
  };
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
})();
