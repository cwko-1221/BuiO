export type DeviceTier = 'phone' | 'tablet' | 'desktop';

export function detectDeviceTier(): DeviceTier {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|Android.*Mobile|Mobile Safari/i.test(ua)) return 'phone';
  const touch = matchMedia('(pointer: coarse)').matches
    || matchMedia('(any-pointer: coarse)').matches
    || navigator.maxTouchPoints > 0;
  const shortScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999);
  const shortView = Math.min(window.innerWidth || 9999, window.innerHeight || 9999);
  const shortSide = Math.min(shortScreen, shortView);
  if (touch && shortSide < 600) return 'phone';
  if (touch || /iPad|Android/i.test(ua)) return 'tablet';
  return 'desktop';
}
