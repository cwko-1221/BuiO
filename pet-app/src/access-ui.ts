export const escapeAccessHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const accessLockIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>`;
export const lessonPeriods = [
  { number: 1, start: '08:45', end: '09:15' },
  { number: 2, start: '09:15', end: '09:45' },
  { number: 3, start: '10:00', end: '10:30' },
  { number: 4, start: '10:30', end: '11:00' },
  { number: 5, start: '11:00', end: '11:30' },
  { number: 6, start: '11:45', end: '12:15' },
  { number: 7, start: '12:15', end: '12:45' },
  { number: 8, start: '13:35', end: '14:05' },
  { number: 9, start: '14:05', end: '14:35' },
] as const;
export function hkTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Hong_Kong', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
export const hkInputTime = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16);
export const hkInputIso = (value: string) => new Date(`${value}:00+08:00`).toISOString();
