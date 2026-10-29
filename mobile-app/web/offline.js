(function () {
  'use strict';
  const button = document.getElementById('retry');
  const status = document.getElementById('status');
  let checking = false;
  function backend() {
    const url = new URL(window.BuiOAppSettings.backendUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Invalid platform address');
    }
    return url.origin;
  }
  async function check() {
    if (checking) return;
    if (navigator.onLine === false) { status.textContent = '裝置目前未連接網絡'; return; }
    checking = true;
    status.textContent = '裝置已連接網絡，正在確認平台…';
    try {
      // Reachability only. No credentials, student data, DB query or writes.
      // A cross-origin opaque response proves only that a response arrived.
      await fetch(backend() + '/health/live', {
        mode: 'no-cors', credentials: 'omit', cache: 'no-store',
        signal: AbortSignal.timeout(8000)
      });
      status.textContent = '已收到平台回應，請按「重新連接」';
    } catch { status.textContent = '平台暫時未有回應，請稍後再試'; }
    finally { checking = false; }
  }
  button.addEventListener('click', () => {
    // Do not gate navigation on a fetch: native error pages can have a
    // restricted/opaque origin even though top-level navigation succeeds.
    try { button.disabled = true; status.textContent = '正在重新連接…'; location.assign(backend() + '/'); }
    catch { button.disabled = false; status.textContent = '連線設定未完成，請聯絡老師'; }
  });
  window.addEventListener('online', check);
  window.addEventListener('offline', () => { status.textContent = '裝置目前未連接網絡'; });
  void check();
})();
