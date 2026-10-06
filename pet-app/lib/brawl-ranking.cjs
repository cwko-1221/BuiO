'use strict';

const TIERS = Object.freeze([
  { id: 'unranked', names: { 'zh-HK': '沒有級別', 'en-US': 'Unranked' }, winsToPromote: 5, dailyCoins: 0 },
  { id: 'bronze', names: { 'zh-HK': '銅', 'en-US': 'Bronze' }, winsToPromote: 10, dailyCoins: 100 },
  { id: 'silver', names: { 'zh-HK': '銀', 'en-US': 'Silver' }, winsToPromote: 20, dailyCoins: 300 },
  { id: 'gold', names: { 'zh-HK': '金', 'en-US': 'Gold' }, winsToPromote: 40, dailyCoins: 500 },
  { id: 'diamond', names: { 'zh-HK': '鑽', 'en-US': 'Diamond' }, winsToPromote: null, dailyCoins: 1000 },
]);
const hkDay = (at = Date.now()) => new Date(Number(at) + 8 * 3600000).toISOString().slice(0, 10);
const initial = studentId => ({ studentId, tier: 0, tierWins: 0, wins: 0, losses: 0, draws: 0, games: 0, rewardDay: '', rewardPaid: 0 });
function publicRank(profile) {
  const p = profile || initial('');
  return { ...p, tierId: TIERS[p.tier].id, dailyCoins: TIERS[p.tier].dailyCoins,
    winsToPromote: TIERS[p.tier].winsToPromote, nextTierId: TIERS[p.tier + 1]?.id || null,
    winRate: p.games ? Math.round(p.wins / p.games * 1000) / 10 : 0 };
}
function record(profile, winner, at = Date.now()) {
  profile.games++;
  if (winner === true) {
    profile.wins++; profile.tierWins++;
    if (TIERS[profile.tier].winsToPromote && profile.tierWins >= TIERS[profile.tier].winsToPromote) {
      profile.tier++; profile.tierWins = 0; profile.promotedAt = new Date(at).toISOString();
    }
  } else if (winner === false) profile.losses++;
  else profile.draws++;
  profile.updatedAt = new Date(at).toISOString();
}
// Settle before a promotion, then again afterwards: the second payment is only
// the difference up to the new tier's daily allowance, even on the same HK day.
function rewardPlan(profile, at = Date.now()) {
  const day = hkDay(at), daily = TIERS[profile.tier].dailyCoins;
  if (!daily || (profile.rewardDay && day < profile.rewardDay)) return null;
  const days = profile.rewardDay ? Math.round((Date.parse(day) - Date.parse(profile.rewardDay)) / 86400000) : 1;
  const amount = days === 0 ? Math.max(0, daily - profile.rewardPaid) : days * daily;
  if (!amount) return null;
  const fromDay = days > 0 && profile.rewardDay ? new Date(Date.parse(profile.rewardDay) + 86400000).toISOString().slice(0, 10) : day;
  return { amount, days, fromDay, toDay: day, dailyCoins: daily, tierId: TIERS[profile.tier].id,
    key: `brawl-rank-daily:${day}:${daily}` };
}
function markPaid(profile, plan) { profile.rewardDay = plan.toDay; profile.rewardPaid = plan.dailyCoins; }
function compare(left, right) {
  return right.tier - left.tier || right.tierWins - left.tierWins || right.wins - left.wins
    || right.winRate - left.winRate || right.games - left.games
    || left.name.localeCompare(right.name, 'zh-HK') || left.studentId.localeCompare(right.studentId);
}
module.exports = { TIERS, hkDay, initial, publicRank, record, rewardPlan, markPaid, compare };
