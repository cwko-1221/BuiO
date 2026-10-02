/** Lock native zoom/selection for an active game; release restores the page exactly. */
export function lockGameBrowserInteractions(className: string): () => void {
  const root = document.documentElement;
  const alreadyLocked = root.classList.contains(className);
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const previousViewport = viewport?.getAttribute('content');
  if (viewport) {
    const settings = (previousViewport ?? '').split(',').map(value => value.trim())
      .filter(value => value && !/^(?:initial-scale|minimum-scale|maximum-scale|user-scalable)\s*=/i.test(value));
    viewport.content = [...settings, 'initial-scale=1', 'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no'].join(', ');
  }
  root.classList.add(className);

  const clearSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount) selection.removeAllRanges();
  };
  clearSelection();
  const prevent = (event: Event) => { if (event.cancelable) event.preventDefault(); };
  const preventPinch = (event: Event) => {
    if ((event as TouchEvent).touches.length > 1) prevent(event);
  };
  const preventWheelZoom = (event: Event) => {
    const wheel = event as WheelEvent;
    if (wheel.ctrlKey || wheel.metaKey) prevent(event);
  };
  const preventKeyboardZoom = (event: Event) => {
    const key = event as KeyboardEvent;
    if ((key.ctrlKey || key.metaKey) && (
      ['+', '=', '-', '0'].includes(key.key)
      || ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(key.code)
    )) prevent(event);
  };
  const listeners: [string, EventListener][] = [
    ['gesturestart', prevent], ['gesturechange', prevent], ['gestureend', prevent],
    ['touchstart', preventPinch], ['touchmove', preventPinch],
    ['wheel', preventWheelZoom], ['keydown', preventKeyboardZoom],
    ['dblclick', prevent], ['contextmenu', prevent], ['selectstart', prevent], ['dragstart', prevent],
    ['selectionchange', clearSelection],
  ];
  // Capture browser defaults without stopping propagation: touch/keyboard/button
  // inputs still reach the game. Single-finger dialog scrolling stays available.
  for (const [type, handler] of listeners) document.addEventListener(type, handler, { capture: true, passive: false });

  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const [type, handler] of listeners) document.removeEventListener(type, handler, { capture: true });
    if (!alreadyLocked) root.classList.remove(className);
    if (viewport) {
      if (previousViewport === null) viewport.removeAttribute('content');
      else if (previousViewport !== undefined) viewport.setAttribute('content', previousViewport);
    }
  };
}
