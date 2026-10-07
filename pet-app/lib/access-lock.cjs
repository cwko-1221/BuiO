'use strict';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const LESSON_PERIODS = Object.freeze([
  Object.freeze({ number: 1, start: '08:45', end: '09:15' }),
  Object.freeze({ number: 2, start: '09:15', end: '09:45' }),
  Object.freeze({ number: 3, start: '10:00', end: '10:30' }),
  Object.freeze({ number: 4, start: '10:30', end: '11:00' }),
  Object.freeze({ number: 5, start: '11:00', end: '11:30' }),
  Object.freeze({ number: 6, start: '11:45', end: '12:15' }),
  Object.freeze({ number: 7, start: '12:15', end: '12:45' }),
  Object.freeze({ number: 8, start: '13:35', end: '14:05' }),
  Object.freeze({ number: 9, start: '14:05', end: '14:35' }),
]);
const LESSON_PERIOD_NUMBERS = new Set(LESSON_PERIODS.map(period => period.number));
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label}須包含時區。`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) fail(`${label}無效。`);
  return new Date(ms).toISOString();
}

function lessonPeriods(value) {
  if (!Array.isArray(value) || !value.length || value.some(period => !Number.isInteger(period) || !LESSON_PERIOD_NUMBERS.has(period))) fail('請選擇第 1 至第 9 節。');
  return [...new Set(value)].sort((a, b) => a - b);
}

function validate(body, knownClasses, now = Date.now()) {
  if (!Array.isArray(body?.classes) || !body.classes.length || body.classes.some(c => typeof c !== 'string' || !knownClasses.includes(c))) fail('請選擇本學年的有效班級。');
  const classes = [...new Set(body.classes)];
  if (!['lock', 'lesson', 'schedule', 'unlock'].includes(body.action)) fail('無效的鎖定操作。');
  if (body.action === 'unlock') return { action: 'unlock', classes };
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > 240)) fail('提示訊息最多 240 字。');
  if (body.action === 'lesson') return {
    action: 'lesson', classes, periods: lessonPeriods(body.periods),
    startsAt: new Date(now).toISOString(), endsAt: null, note: (body.note || '').trim(),
  };
  const startsAt = body.action === 'schedule' ? timestamp(body.startsAt, '開始時間') : new Date(now).toISOString();
  const endsAt = body.endsAt == null || body.endsAt === '' ? null : timestamp(body.endsAt, '結束時間');
  if (body.action === 'schedule' && Date.parse(startsAt) < now - 60000) fail('預約開始時間不能早於現在。');
  if (body.action === 'schedule' && !endsAt) fail('預約鎖定需要結束時間。');
  if (endsAt && Date.parse(endsAt) <= Math.max(now, Date.parse(startsAt))) fail('結束時間須在開始時間及現在之後。');
  return { action: body.action, classes, startsAt, endsAt, note: (body.note || '').trim() };
}

const HK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Hong_Kong', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});
const WEEKDAY_INDEX = Object.freeze({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 });

function hkParts(now) {
  const values = Object.fromEntries(HK_FORMATTER.formatToParts(new Date(now)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return {
    weekday: WEEKDAY_INDEX[values.weekday], year: Number(values.year), month: Number(values.month), day: Number(values.day),
  };
}

function localDate(parts, dayOffset = 0) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

// Hong Kong has no daylight-saving changes, so a local timetable boundary is
// converted to an instant with the fixed UTC+8 offset.
function timetableBoundary(date, value) {
  const [hour, minute] = value.split(':').map(Number);
  return Date.UTC(date.year, date.month - 1, date.day, hour - 8, minute);
}

function lessonBlocks(periods, date) {
  const selected = [...new Set(periods || [])]
    .map(number => LESSON_PERIODS.find(period => period.number === number))
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
  const blocks = [];
  for (const period of selected) {
    const current = { start: timetableBoundary(date, period.start), end: timetableBoundary(date, period.end) };
    const previous = blocks[blocks.length - 1];
    if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else blocks.push(current);
  }
  return blocks;
}

// Merge ordinary intervals and the weekday timetable. Lesson rules are
// recurring: Monday–Friday the selected periods lock automatically, while all
// other times remain open. The client polls nextChangeAt, so a class reopens at
// the exact period end without teacher intervention.
function statusFor(rules, academicYear, className, now = Date.now()) {
  const applicable = rules.filter(r => r.academicYear === academicYear && r.classes.includes(className) && (!r.endsAt || Date.parse(r.endsAt) > now));
  const intervals = [];
  for (const rule of applicable) {
    const startsAt = Date.parse(rule.startsAt);
    const endsAt = rule.endsAt ? Date.parse(rule.endsAt) : Infinity;
    if (!Number.isFinite(startsAt) || endsAt <= startsAt) continue;
    if (rule.kind !== 'lesson') {
      intervals.push({ start: startsAt, end: endsAt, rule });
      continue;
    }
    if (!Array.isArray(rule.periods) || !rule.periods.length) continue;
    const parts = hkParts(now);
    for (let offset = 0; offset <= 7; offset += 1) {
      const date = localDate(parts, offset);
      const weekday = ((parts.weekday + offset) % 7 + 7) % 7;
      if (weekday === 0 || weekday === 6) continue;
      for (const block of lessonBlocks(rule.periods, date)) {
        const start = Math.max(startsAt, block.start), end = Math.min(endsAt, block.end);
        if (end > start && end > now) intervals.push({ start, end, rule });
      }
    }
  }
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  let activeGroup = null, next = null;
  for (const interval of intervals) {
    if (interval.start <= now && now < interval.end) {
      if (!activeGroup) activeGroup = { start: interval.start, end: interval.end, rules: [interval.rule] };
      else { activeGroup.end = Math.max(activeGroup.end, interval.end); activeGroup.rules.push(interval.rule); }
      continue;
    }
    if (activeGroup && interval.start <= activeGroup.end) {
      activeGroup.end = Math.max(activeGroup.end, interval.end); activeGroup.rules.push(interval.rule);
    } else if (interval.start > now && next === null) next = interval.start;
  }
  const active = activeGroup?.rules || [];
  const end = activeGroup?.end ?? null;
  const change = activeGroup ? end : next;
  const latest = active.slice().sort((a, b) => Date.parse(b.createdAt || b.startsAt) - Date.parse(a.createdAt || a.startsAt))[0];
  return {
    academicYear, className, locked: active.length > 0, note: latest?.note || '',
    endsAt: end !== null && Number.isFinite(end) ? new Date(end).toISOString() : null,
    nextChangeAt: Number.isFinite(change) ? new Date(change).toISOString() : null, serverNow: now,
  };
}

module.exports = { LESSON_PERIODS, validate, statusFor };
