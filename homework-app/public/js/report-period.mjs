const DAY = 86400000;

export function weekEnd(dateFrom, week) {
  const start = Date.parse(`${dateFrom}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isInteger(Number(week)) || week < 1 || week > 53) return '';
  return new Date(start + (Number(week) - 1) * 7 * DAY).toISOString().slice(0, 10);
}

export function defaultWeekPeriod(academicYear, today) {
  const start = new Date(`${academicYear.slice(0, 4)}-09-01T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (5 - start.getUTCDay() + 7) % 7);
  const dateFrom = start.toISOString().slice(0, 10);
  const week = Math.min(53, Math.max(1, Math.floor((Date.parse(`${today}T00:00:00Z`) - start.getTime()) / (7 * DAY)) + 1));
  return { dateFrom, dateTo: weekEnd(dateFrom, week), week: String(week), mode: 'week' };
}
