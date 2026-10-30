// Installed at document start by the native iOS host. This does not modify
// requests, authentication, gameplay, input timing or authoritative results.
(function () {
  'use strict';
  if (window.BuiOMobile) return;
  Object.defineProperty(window, 'BuiOMobile', { value: Object.freeze({
    platform: 'ios', mode: 'online-compatibility-pilot', version: '0.1.1',
    viewport: 'native-safe-area'
  }), writable: false });
  const mobileCSS = /* BUIO_MOBILE_CSS */ '';
  const setupLayout = () => {
    if (!document.documentElement || !document.head) return false;
    const root = document.documentElement;
    root.setAttribute('data-buio-app', 'ios');
    root.setAttribute('data-buio-page', /^\/(?:index\.html)?$/.test(location.pathname) ? 'hub' : 'module');
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
  document.addEventListener('DOMContentLoaded', () => {
    setupLayout();
    layoutObserver.disconnect();
  }, { once: true });
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
