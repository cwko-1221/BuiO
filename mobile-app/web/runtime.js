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
  let nativeInsets;
  const applyInsets = insets => {
    nativeInsets = insets;
    if (!document.documentElement) return;
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const value = Number(insets[edge]);
      if (Number.isFinite(value) && value >= 0) document.documentElement.style.setProperty('--buio-safe-' + edge, value + 'px');
    }
  };
  Object.defineProperty(window, 'BuiOApplyInsets', { value: applyInsets });
  const setupLayout = () => {
    if (!document.documentElement || !document.head) return false;
    const root = document.documentElement;
    root.setAttribute('data-buio-app', 'ios');
    if (nativeInsets) applyInsets(nativeInsets);
    root.setAttribute('data-buio-page', /^\/(?:index\.html)?$/.test(location.pathname) ? 'hub' : 'module');
    const section = location.pathname.split('/')[1].replace(/\.html$/, '');
    root.setAttribute('data-buio-module', ['math', 'login', 'quiz', 'dashboard', 'teacher-topics', 'tag-picker'].includes(section) ? 'math' : section);
    // Keep text zoom available; remove old scale caps on learning pages.
    // Backgrounds cover the glass; controls use the CSS system-safe insets.
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
  const processedSheets = new WeakSet();
  const rewriteSafeAreas = sheet => {
    if (!sheet || processedSheets.has(sheet)) return;
    try {
      const visit = rules => {
        for (const rule of rules) {
          if (rule.cssRules) visit(rule.cssRules);
          if (!rule.style) continue;
          const value = rule.style.cssText;
          if (!value.includes('env(safe-area-inset-')) continue;
          // Pending-substitution shorthands can return empty longhand values
          // in WebKit. Rewrite the declaration block, preserving our own env
          // defaults so they never become self-referencing CSS variables.
          const defaults = ['top', 'right', 'bottom', 'left'].map(edge => {
            const property = '--buio-safe-' + edge;
            return [property, rule.style.getPropertyValue(property), rule.style.getPropertyPriority(property)];
          });
          rule.style.cssText = value.replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,\s*([^)]*))?\)/g,
            (_, edge, fallback) => 'var(--buio-safe-' + edge + ',' + (fallback || '0px') + ')');
          for (const [property, original, priority] of defaults) if (original) rule.style.setProperty(property, original, priority);
        }
      };
      visit(sheet.cssRules); processedSheets.add(sheet);
    } catch { /* Cross-origin sheets keep their normal browser behavior. */ }
  };
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
    [...document.styleSheets].forEach(rewriteSafeAreas);
    const insetValues = {};
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      insetValues[edge] = document.documentElement.style.getPropertyValue('--buio-safe-' + edge);
      document.documentElement.style.setProperty('--buio-safe-' + edge, '0px');
    }
    style.disabled = true;
    const bodyStyle = getComputedStyle(document.body);
    for (const edge of ['Top', 'Right', 'Bottom', 'Left']) {
      document.documentElement.style.setProperty('--buio-body-pad-' + edge.toLowerCase(), bodyStyle['padding' + edge]);
    }
    style.disabled = false;
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      if (insetValues[edge]) document.documentElement.style.setProperty('--buio-safe-' + edge, insetValues[edge]);
      else document.documentElement.style.removeProperty('--buio-safe-' + edge);
    }
    document.querySelectorAll(formSelector).forEach(fitFormField);
    layoutObserver.disconnect();
    new MutationObserver(records => {
      for (const record of records) {
        const nodes = [record.target, ...record.addedNodes];
        for (const node of nodes) {
          if (node.tagName === 'STYLE') { processedSheets.delete(node.sheet); rewriteSafeAreas(node.sheet); }
          if (node.tagName === 'LINK' && node.rel === 'stylesheet') {
            rewriteSafeAreas(node.sheet);
            node.addEventListener('load', () => rewriteSafeAreas(node.sheet), { once: true });
          }
        }
      }
    }).observe(document.head, { childList: true, subtree: true });
    updatePresentation();
    if (document.documentElement.getAttribute('data-buio-module') === 'pet') {
      const attach = () => {
        const shell = document.querySelector('.pet-shell');
        if (shell) {
          new MutationObserver(updatePresentation).observe(shell, { attributes: true, attributeFilter: ['data-screen', 'class'] });
          setupPetNavigation(shell);
          updatePresentation();
        }
        return Boolean(shell || document.querySelector('.teacher-shell'));
      };
      if (!attach()) {
        const bootObserver = new MutationObserver(() => { if (attach()) bootObserver.disconnect(); });
        bootObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
  };
  function setupPetNavigation(shell) {
    const nav = shell.querySelector('.pet-nav');
    if (!nav || nav.querySelector('[data-buio-more]')) return;
    const secondary = [...nav.querySelectorAll('[data-tab]')].filter(button => !['home', 'park', 'collection', 'brawl'].includes(button.dataset.tab));
    for (const button of secondary) button.setAttribute('data-buio-secondary', '');
    const more = document.createElement('button');
    more.type = 'button'; more.setAttribute('data-buio-more', '');
    more.setAttribute('aria-haspopup', 'dialog');
    const english = document.documentElement.lang.startsWith('en');
    more.innerHTML = '<span aria-hidden="true" class="buio-more-icon">•••</span><span>' + (english ? 'More' : '更多') + '</span>';
    nav.append(more);
    const sheet = document.createElement('dialog');
    sheet.setAttribute('data-buio-sheet', '');
    sheet.setAttribute('aria-label', english ? 'More pet activities' : '更多寵物活動');
    shell.append(sheet);
    const backdrop = document.createElement('div');
    backdrop.className = 'buio-sheet-backdrop'; backdrop.hidden = true; shell.append(backdrop);
    const close = () => {
      if (sheet.close) sheet.close(); else sheet.removeAttribute('open');
      backdrop.hidden = true; more.focus();
    };
    backdrop.addEventListener('click', close);
    more.addEventListener('click', event => {
      event.stopPropagation();
      sheet.replaceChildren();
      const heading = document.createElement('h2'); heading.textContent = english ? 'More activities' : '更多活動'; sheet.append(heading);
      const closeButton = document.createElement('button');
      closeButton.type = 'button'; closeButton.className = 'buio-sheet-close'; closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', english ? 'Close' : '關閉'); closeButton.addEventListener('click', close); sheet.append(closeButton);
      const items = document.createElement('div'); items.className = 'buio-sheet-items';
      for (const button of secondary) { const item = button.cloneNode(true); item.removeAttribute('data-buio-secondary'); items.append(item); }
      sheet.append(items);
      if (sheet.showModal) sheet.showModal(); else { sheet.setAttribute('open', ''); backdrop.hidden = false; }
    });
    sheet.addEventListener('click', event => {
      if (event.target.closest('[data-tab]')) { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); backdrop.hidden = true; }
      if (event.target === sheet) {
        const box = sheet.getBoundingClientRect();
        if (event.clientY < box.top || event.clientX < box.left || event.clientX > box.right) close();
      }
    });
  }
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
    const battle = Boolean(document.querySelector('.pet-shell.brawl-active'));
    const gameCanvas = Boolean(document.querySelector('#rotateNotice, #gameCanvas'));
    const immersive = module === 'science-lab' || gameCanvas || battle || (module === 'pet' && ['park', 'coin-pusher'].includes(petScreen));
    root.setAttribute('data-buio-immersive', String(immersive));
    const landscape = module === 'science-lab' || battle || gameCanvas;
    const message = { immersive, landscape, background, lightStatus: ['math', 'games', 'game', 'tower-defense', 'science-lab'].includes(module) };
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
