export type RankTierId = 'unranked' | 'bronze' | 'silver' | 'gold' | 'diamond';
export interface RankTier { id: RankTierId; names: { 'zh-HK': string; 'en-US': string }; winsToPromote: number | null; dailyCoins: number }
export interface RankProfile {
  studentId: string; tier: number; tierId: RankTierId; tierWins: number; wins: number; losses: number;
  draws: number; games: number; winRate: number; dailyCoins: number; winsToPromote: number | null;
  nextTierId: RankTierId | null; rewardDay: string; rewardPaid: number;
}
export interface RankResult extends RankProfile { beforeTier: number; promoted: boolean; promotionCoins: number }
export interface RankedOverview { academicYear: string; day: string; tiers: RankTier[]; self: RankProfile; position: number | null;
  leaderboard: (RankProfile & { name: string; className: string; position: number })[] }
