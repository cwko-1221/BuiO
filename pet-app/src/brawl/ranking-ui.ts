import './ranking.css';
import type { Locale } from '../types';
import type { RankedOverview } from './ranking-types';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const names = [['沒有級別', 'Unranked'], ['銅', 'Bronze'], ['銀', 'Silver'], ['金', 'Gold'], ['鑽', 'Diamond']];
const ids = ['unranked', 'bronze', 'silver', 'gold', 'diamond'];
export const rankName = (tier: number, locale: Locale) => names[tier]?.[locale === 'zh-HK' ? 0 : 1] || '—';
export const rankBadge = (tier: number, locale: Locale) => `<span class="rank-badge rank-${ids[tier] || 'unranked'}"><i aria-hidden="true">${tier === 4 ? '◇' : tier ? '◆' : '○'}</i>${esc(rankName(tier, locale))}</span>`;
export function rankSummary(data: RankedOverview | undefined, locale: Locale) {
  const zh = locale === 'zh-HK', t = (z: string, e: string) => zh ? z : e;
  if (!data) return `<section class="rank-summary rank-error"><h2>${t('排名資料暫未載入', 'Rankings could not load')}</h2><button data-brawl="rank-refresh">${t('重新載入排名', 'Reload rankings')}</button></section>`;
  const p = data.self, next = data.tiers[p.tier + 1];
  const progress = p.winsToPromote ? `${p.tierWins} / ${p.winsToPromote}` : t('最高級別', 'Highest tier');
  return `<section class="rank-summary" aria-label="${t('我的排名', 'My ranking')}">
    <div class="rank-summary-head"><div><p class="brawl-eyebrow">RANKED ARENA</p><h2>${t('一步一步，登上巔峰', 'Every win takes you higher')}</h2></div>${rankBadge(p.tier, locale)}</div>
    <div class="rank-stats"><span><b>${data.position ? `#${data.position}` : '—'}</b><small>${t('全校排名', 'School rank')}</small></span><span><b>${p.wins}</b><small>${t('排名勝場', 'Ranked wins')}</small></span><span><b>${p.games}</b><small>${t('遊玩場次', 'Matches played')}</small></span><span><b>${p.games ? `${p.winRate}%` : '—'}</b><small>${t('勝率', 'Win rate')}</small></span></div>
    <div class="rank-progress-head"><b>${next ? t(`再勝 ${p.winsToPromote! - p.tierWins} 場，升到${next.names['zh-HK']}`, `${p.winsToPromote! - p.tierWins} more wins to ${next.names['en-US']}`) : t('鑽級挑戰繼續！', 'Keep competing in Diamond!')}</b><span>${progress}</span></div>
    ${p.winsToPromote ? `<div class="rank-progress" role="progressbar" aria-label="${t('晉級勝場進度', 'Promotion progress')}" aria-valuemin="0" aria-valuemax="${p.winsToPromote}" aria-valuenow="${p.tierWins}"><i style="width:${p.tierWins / p.winsToPromote * 100}%"></i></div>` : ''}
    <div class="rank-benefit"><span aria-hidden="true">🪙</span><div><b>${p.dailyCoins ? t(`每日自動獲得 ${p.dailyCoins} 金幣`, `${p.dailyCoins} automatic coins daily`) : t('升到銅級，開始領取每日金幣', 'Reach Bronze to unlock daily coins')}</b><small>${p.dailyCoins ? p.rewardDay === data.day && p.rewardPaid >= p.dailyCoins ? t('今日已自動入帳 · 離線期間也會補發', 'Today’s coins are credited · offline days are included') : t('每日按香港時間自動入帳', 'Credited daily using Hong Kong time') : t('只計排名對戰勝場 · 輸掉不會清零', 'Only ranked wins count · losses do not reset progress')}</small></div></div>
    <div class="rank-summary-actions"><button data-brawl="mode" data-id="leaderboard">${t('全校排行榜 →', 'School leaderboard →')}</button><button data-brawl="rank-refresh">${t('更新排名', 'Refresh')}</button></div>
  </section>`;
}
export function rankLeaderboard(data: RankedOverview | undefined, locale: Locale) {
  const zh = locale === 'zh-HK', t = (z: string, e: string) => zh ? z : e;
  return `${rankSummary(data, locale)}<section class="rank-board"><div class="rank-board-head"><div><p class="brawl-eyebrow">SCHOOL LEADERBOARD</p><h2>${t('全校排行榜', 'School leaderboard')}</h2><p>${t('按級別、該級別勝場、總勝場及勝率排列；只計排名對戰。', 'Ordered by tier, wins in that tier, total wins and win rate. Ranked matches only.')}</p></div><button data-brawl="mode" data-id="ranked">${t('參加排名對戰', 'Play ranked')}</button></div>
    ${data ? `<div class="rank-table-scroll" tabindex="0" aria-label="${t('全校排名表，可橫向捲動', 'School rankings, scroll horizontally')}" role="region"><table class="rank-table"><thead><tr>${[t('名次', 'Rank'), t('同學', 'Student'), t('級別', 'Tier'), t('勝場', 'Wins'), t('勝率', 'Win rate'), t('遊玩場次', 'Played')].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${data.leaderboard.map(row => `<tr class="${row.studentId === data.self.studentId ? 'rank-self' : ''}" data-rank-student="${esc(row.studentId)}"><td><b>${row.position <= 3 ? ['🥇', '🥈', '🥉'][row.position - 1] : row.position}</b></td><th scope="row"><b>${esc(row.name)}${row.studentId === data.self.studentId ? ` <small class="rank-you">${t('你', 'You')}</small>` : ''}</b><small>${esc(row.className)}</small></th><td>${rankBadge(row.tier, locale)}</td><td>${row.wins}</td><td>${row.games ? `${row.winRate}%` : '—'}</td><td>${row.games}</td></tr>`).join('')}</tbody></table></div><p class="rank-board-note">${t('勝率＝勝場 ÷ 遊玩場次；平局計入場次，取消或退款的場次不計。', 'Win rate = wins ÷ matches played. Draws count as played; cancelled or refunded matches do not.')}</p>` : ''}
  </section><section class="rank-roadmap" aria-label="${t('級別及獎勵', 'Tiers and rewards')}">${data?.tiers.map((tier, index) => `<article>${rankBadge(index, locale)}<b>${tier.dailyCoins ? `🪙 ${tier.dailyCoins} / ${t('日', 'day')}` : t('尚未有每日獎勵', 'No daily coins yet')}</b><small>${tier.winsToPromote ? t(`此級別勝出 ${tier.winsToPromote} 場可晉級`, `${tier.winsToPromote} wins here to promote`) : t('最高級別', 'Highest tier')}</small></article>`).join('') || ''}</section>`;
}
