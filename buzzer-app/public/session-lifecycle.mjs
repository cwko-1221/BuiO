// Match whiteboard classrooms: leaving the owner's page explicitly ends class.
// Do not use visibility/SSE disconnects, which also happen on ordinary tab switches.
export function watchTeacherSessionExit(getUser, getSession, browser = window) {
  let queuedId;
  const end = () => {
    const session = getSession();
    if (getUser()?.role !== 'teacher' || !session?.id || session.phase === 'ended' || queuedId === session.id) return;
    const url = `/api/buzzer/sessions/${encodeURIComponent(session.id)}/actions`;
    const body = JSON.stringify({ action: 'end' });
    try {
      if (browser.navigator?.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) {
        queuedId = session.id;
        return;
      }
    } catch { /* Beacon may be unavailable; try an unload-safe fetch instead. */ }
    try {
      void browser.fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
      queuedId = session.id;
    } catch { /* Closing the page must not throw or prevent navigation. */ }
  };
  browser.addEventListener('beforeunload', end);
  browser.addEventListener('pagehide', end);
  return () => {
    browser.removeEventListener('beforeunload', end);
    browser.removeEventListener('pagehide', end);
  };
}
