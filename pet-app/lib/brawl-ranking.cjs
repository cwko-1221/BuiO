'use strict';

const TIERS = Object.freeze([
  { id: 'unranked', names: { 'zh-HK': '沒有級別', 'en-US': 'Unranked' }, pointsToPromote: 25, dailyCoins: 0 },
  { id: 'bronze', names: { 'zh-HK': '銅', 'en-US': 'Bronze' }, pointsToPromote: 50, dailyCoins: 100 },
  { id: 'silver', names: { 'zh-HK': '銀', 'en-US': 'Silver' }, pointsToPromote: 100, dailyCoins: 300 },
  { id: 'gold', names: { 'zh-HK': '金', 'en-US': 'Gold' }, pointsToPromote: 200, dailyCoins: 500 },
  { id: 'diamond', names: { 'zh-HK': '鑽', 'en-US': 'Diamond' }, pointsToPromote: null, dailyCoins: 1000 },
]);
const hkDay = (at = Date.now()) => new Date(Number(at) + 8 * 3600000).toISOString().slice(0, 10);
const initial = studentId => ({ studentId, schemaVersion: 2, tier: 0, points: 0, tierWins: 0, wins: 0, losses: 0, draws: 0, games: 0, rewardDay: '', rewardPaid: 0 });
function migrate(profile) {
  if (profile.schemaVersion !== 2) {
    profile.points = Number.isFinite(profile.points) ? Math.max(0, Math.floor(profile.points)) : Math.max(0, profile.tierWins || 0) * 5;
    profile.schemaVersion = 2;
  }
  return profile;
}
// Points are determined by the winner's tier relative to the opponent's tier.
// Underdogs gain two points per tier gap; favorites gain one fewer per tier gap.
function terms(firstTier, secondTier) {
  if (![firstTier, secondTier].every(tier => Number.isInteger(tier) && tier >= 0 && tier < TIERS.length)) throw new Error('Invalid ranking tiers');
  const gap = Math.abs(firstTier - secondTier);
  return { tiers: [firstTier, secondTier], gap, fee: 500 - gap * 100,
    winPoints: [firstTier <= secondTier ? 5 + gap * 2 : 5 - gap, secondTier <= firstTier ? 5 + gap * 2 : 5 - gap] };
}
function publicRank(profile) {
  const p = migrate({ ...(profile || initial('')) });
  return { ...p, tierId: TIERS[p.tier].id, dailyCoins: TIERS[p.tier].dailyCoins,
    pointsToPromote: TIERS[p.tier].pointsToPromote, nextTierId: TIERS[p.tier + 1]?.id || null,
    winRate: p.games ? Math.round(p.wins / p.games * 1000) / 10 : 0 };
}
function record(profile, winner, pointsDelta = winner === true ? 5 : winner === false ? -5 : 0, at = Date.now()) {
  migrate(profile);
  profile.games++;
  profile.points = Math.max(0, profile.points + pointsDelta);
  if (winner === true) {
    profile.wins++; profile.tierWins++;
    if (TIERS[profile.tier].pointsToPromote && profile.points >= TIERS[profile.tier].pointsToPromote) {
      profile.tier++; profile.points = 0; profile.tierWins = 0; profile.promotedAt = new Date(at).toISOString();
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
  return right.tier - left.tier || right.points - left.points || right.wins - left.wins
    || right.winRate - left.winRate || right.games - left.games
    || left.name.localeCompare(right.name, 'zh-HK') || left.studentId.localeCompare(right.studentId);
}
module.exports = { TIERS, hkDay, initial, migrate, terms, publicRank, record, rewardPlan, markPaid, compare };
