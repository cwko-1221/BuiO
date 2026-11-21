'use strict';

const { isIsoDate, todayHongKong } = require('./domain');

const TERMS = Object.freeze(['T1', 'T2', 'T3']);
const MAX_BASE_COINS = 1000;

function shiftDate(date, days) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

function publicSettings(settings) {
  return { activeTerm: settings?.activeTerm || 'T1', terms: settings?.terms || {} };
}

function validateSettings(input, academicYear) {
  const { activeTerm, baseCoins } = input || {};
  if (!TERMS.includes(activeTerm)) throw new Error('請選擇現行學段。');
  if (!Number.isInteger(baseCoins) || baseCoins < 1 || baseCoins > MAX_BASE_COINS) {
    throw new Error(`基礎金幣必須是 1 至 ${MAX_BASE_COINS} 的整數。`);
  }
  const startYear = Number(academicYear.slice(0, 4));
  const terms = {};
  let previousEnd = '';
  for (const term of TERMS) {
    const { dateFrom, dateTo } = input.terms?.[term] || {};
    if (!isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom > dateTo
      || dateFrom < `${startYear}-09-01` || dateTo > `${startYear + 1}-08-31`) {
      throw new Error(`請為 ${term} 設定有效的學年內日期範圍。`);
    }
    if (previousEnd >= dateFrom) throw new Error('T1、T2、T3 的日期必須依序排列，日期不可重疊。');
    terms[term] = { dateFrom, dateTo };
    previousEnd = dateTo;
  }
  return { activeTerm, terms, baseCoins };
}

function updateSchedule(previous, settings, day) {
  const { activeTerm, baseCoins } = settings;
  const entry = { effectiveFrom: day, term: activeTerm, baseCoins, ...settings.terms[activeTerm] };
  const schedule = (previous?.schedule || []).filter(row => row.effectiveFrom < day);
  const last = schedule.at(-1);
  if (!last || last.term !== entry.term || last.baseCoins !== baseCoins
    || last.dateFrom !== entry.dateFrom || last.dateTo !== entry.dateTo) schedule.push(entry);
  return { ...settings, schedule };
}

function rewardDays(settings, today = todayHongKong()) {
  const schedule = settings?.schedule || [];
  const days = [];
  for (const [index, entry] of schedule.entries()) {
    const from = [entry.dateFrom, entry.effectiveFrom].sort().at(-1);
    const until = [shiftDate(entry.dateTo, 1), schedule[index + 1]?.effectiveFrom || today, today].sort()[0];
    for (let date = from; date < until; date = shiftDate(date, 1)) {
      days.push({ date, term: entry.term, baseCoins: entry.baseCoins });
    }
  }
  return days;
}

module.exports = { TERMS, MAX_BASE_COINS, publicSettings, validateSettings, updateSchedule, rewardDays, shiftDate };
