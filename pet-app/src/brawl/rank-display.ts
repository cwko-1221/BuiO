import './rank-badge.css';
import type { Locale } from '../types';
import type { RankedTerms } from './ranking-types';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const names = [['沒有級別', 'Unranked'], ['銅', 'Bronze'], ['銀', 'Silver'], ['金', 'Gold'], ['鑽', 'Diamond']];
const ids = ['unranked', 'bronze', 'silver', 'gold', 'diamond'];
export const rankName = (tier: number, locale: Locale) => names[tier]?.[locale === 'zh-HK' ? 0 : 1] || '—';
export const rankBadge = (tier: number, locale: Locale) => `<span class="rank-badge rank-${ids[tier] || 'unranked'}"><i aria-hidden="true">${tier === 4 ? '◇' : tier ? '◆' : '○'}</i>${esc(rankName(tier, locale))}</span>`;
export const rankTermsText = (terms: RankedTerms, index: number, locale: Locale) => locale === 'zh-HK' ? `勝 +${terms.winPoints[index]}／負 −${terms.winPoints[1 - index]} 分 · 每人 ${terms.fee} 金幣` : `Win +${terms.winPoints[index]} / lose −${terms.winPoints[1 - index]} points · ${terms.fee} coins each`;
