'use strict';

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(`${label}須包含時區。`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) fail(`${label}無效。`);
  return new Date(ms).toISOString();
}

function validate(body, knownClasses, now = Date.now()) {
  if (!Array.isArray(body?.classes) || !body.classes.length || body.classes.some(c => typeof c !== 'string' || !knownClasses.includes(c))) fail('請選擇本學年的有效班級。');
  const classes = [...new Set(body.classes)];
  if (!['lock', 'schedule', 'unlock'].includes(body.action)) fail('無效的鎖定操作。');
  if (body.action === 'unlock') return { action: 'unlock', classes };
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > 240)) fail('提示訊息最多 240 字。');
  const startsAt = body.action === 'schedule' ? timestamp(body.startsAt, '開始時間') : new Date(now).toISOString();
  const endsAt = body.endsAt == null || body.endsAt === '' ? null : timestamp(body.endsAt, '結束時間');
  if (body.action === 'schedule' && Date.parse(startsAt) < now - 60000) fail('預約開始時間不能早於現在。');
  if (body.action === 'schedule' && !endsAt) fail('預約鎖定需要結束時間。');
  if (endsAt && Date.parse(endsAt) <= Math.max(now, Date.parse(startsAt))) fail('結束時間須在開始時間及現在之後。');
  return { action: body.action, classes, startsAt, endsAt, note: (body.note || '').trim() };
}

// Merge connected intervals so an overlapping reservation cannot promise an early unlock.
function statusFor(rules, academicYear, className, now = Date.now()) {
  const applicable = rules.filter(r => r.academicYear === academicYear && r.classes.includes(className) && (!r.endsAt || Date.parse(r.endsAt) > now));
  const active = applicable.filter(r => Date.parse(r.startsAt) <= now);
  let end = active.length ? Math.max(...active.map(r => r.endsAt ? Date.parse(r.endsAt) : Infinity)) : null;
  if (end !== null) {
    for (const r of [...applicable].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
      if (Date.parse(r.startsAt) <= end) end = Math.max(end, r.endsAt ? Date.parse(r.endsAt) : Infinity);
    }
  }
  const upcoming = applicable.map(r => Date.parse(r.startsAt)).filter(t => t > now);
  const change = end === null ? Math.min(...upcoming) : end;
  const latest = active.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return {
    academicYear, className, locked: active.length > 0, note: latest?.note || '',
    endsAt: end !== null && Number.isFinite(end) ? new Date(end).toISOString() : null,
    nextChangeAt: Number.isFinite(change) ? new Date(change).toISOString() : null, serverNow: now,
  };
}

module.exports = { validate, statusFor };
