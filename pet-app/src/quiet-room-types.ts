export interface QuietSession {
  id: string;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  durationSeconds: number;
  threshold: number;
  reward: number;
  penalty: number;
  remainingMs: number;
  remainingReward: number;
  breaches: number;
  targetLabel: string;
  count: number;
  payout: null | { amount: number; count: number; total: number; batchId: string };
}
export interface QuietSettings {
  scope: 'class' | 'group'; className: string; groupField: string; groupName: string;
  durationSeconds: number; threshold: number; reward: number; penalty: number;
}
