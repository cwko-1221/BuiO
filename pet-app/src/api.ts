import type { Bootstrap, Identity, RoomPlacement, TeacherGrantNotification } from './types';
import type { BrawlCatalog, BrawlProgress, BrawlRun, BrawlReceipt } from './brawl/types';
import type { InputFrame } from '../lib/brawl/simulation.mjs';
import type { ArcadePrize, ArcadePrizeKind } from './game/ArcadePrizes';
import type { QuietSession, QuietSettings } from './quiet-room-types';
import type { PetAccessStatus, PetAccessSettings, PetAccessUpdate } from './access-types';

// The shared runtime is loaded blocking in <head>, before this bundle runs.
const t = (key: string) => (window as any).BuiI18n.t(key) as string;

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfterMs = 0, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ success: false, message: t('pet.badResponse') }));
  if (!response.ok || data.success === false) {
    if (data.code === 'PET_APP_LOCKED' && data.access) window.dispatchEvent(new CustomEvent('pet:access', { detail: data.access }));
    const retryAfter = response.headers.get('Retry-After');
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    const retryAfterMs = retryAfter ? Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
    throw new ApiError(data.message || t('pet.actionFailed'), response.ok ? 502 : response.status,
      Number.isFinite(retryAfterMs) ? retryAfterMs : 0, response.headers.get('X-Request-ID') || data.requestId || undefined);
  }
  return data as T;
}

async function arcadeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try { return await request<T>(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

async function quietRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);
  try { return await request<T>(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

export const api = {
  brawlRanking: () => request<import('./brawl/ranking-types').RankedOverview>('/api/pet/brawl/ranking'),
  petAccess: () => quietRequest<{ access: PetAccessStatus }>('/api/pet/access'),
  teacherAccess: () => request<PetAccessSettings>('/api/pet/teacher/access'),
  updatePetAccess: (body: PetAccessUpdate) => request<PetAccessSettings>('/api/pet/teacher/access', { method: 'POST', body: JSON.stringify(body) }),
  cancelPetAccess: (id: string) => request<PetAccessSettings>(`/api/pet/teacher/access/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: '{}' }),
  brawlCatalog: () => request<BrawlCatalog>('/api/pet/brawl/catalog'),
  brawlAccess: (body: {petId:string;fighterId:string;mode:string}) => request<{allowed:boolean}>('/api/pet/brawl/access', {method:'POST',body:JSON.stringify(body)}),
  brawlProgress: () => request<BrawlProgress>('/api/pet/brawl/progress'),
  brawlStart: (body: { petId: string; stageId: string; difficulty: string }, key: string) => arcadeRequest<{ run: BrawlRun }>('/api/pet/brawl/runs', { method:'POST', headers:{'Idempotency-Key':key}, body:JSON.stringify(body) }),
  brawlFinish: (id: string, body: {version:string;inputs:InputFrame[];endTick:number}, key: string) => arcadeRequest<{ receipt: BrawlReceipt }>(`/api/pet/brawl/runs/${encodeURIComponent(id)}/finish`, {method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify(body)}),
  brawlAbandon: (id: string) => request<{ run: BrawlRun }>(`/api/pet/brawl/runs/${encodeURIComponent(id)}/abandon`, {method:'POST',body:'{}'}),
  identity: async () => (await request<{ student: Identity }>('/api/auth/me')).student,
  bootstrap: () => request<Bootstrap & { success: true }>('/api/pet/bootstrap'),
  hatch: (key: string) => request<any>('/api/pet/starter-egg/hatch', { method: 'POST', headers: { 'Idempotency-Key': key }, body: '{}' }),
  buyEgg: (body: { kind: 'random' | 'direct'; speciesId?: string }, key: string) => request<any>('/api/pet/eggs/purchase', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
  playCoinPusher: (key: string) => arcadeRequest<any>('/api/pet/coin-pusher/play', { method: 'POST', headers: { 'Idempotency-Key': key }, body: '{}' }),
  arcadePrizes: () => request<{ prizes: ArcadePrize[]; dropsUntilRestock: number }>('/api/pet/coin-pusher/prizes', { method: 'POST', body: '{}' }),
  claimArcadePrize: (prizeId: string) => arcadeRequest<{ prizeId: string; kind: ArcadePrizeKind; earned: number; balance: number; replayed?: boolean }>(`/api/pet/coin-pusher/prizes/${encodeURIComponent(prizeId)}/claim`, { method: 'POST', body: '{}' }),
  redeemArcadePrize: (prizeId: string, itemId: string) => request<{ itemId: string }>(`/api/pet/coin-pusher/prizes/${encodeURIComponent(prizeId)}/redeem`, { method: 'POST', body: JSON.stringify({ itemId }) }),
  // amount counts caught physical coins; earned is the server-priced wallet credit.
  payoutCoinPusher: (body: { playId: string; eventId: string; amount: number }, key: string) => arcadeRequest<{ earned: number; balance: number; remainingPayout: number; collection?: { returnedCoins: number } }>('/api/pet/coin-pusher/payout', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
  activatePet: (petId: string) => request<any>(`/api/pet/pets/${encodeURIComponent(petId)}/activate`, { method: 'POST', body: '{}' }),
  feed: (petId: string, foodId: string, key: string) => request<any>(`/api/pet/pets/${encodeURIComponent(petId)}/feed`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ foodId }) }),
  setOutfit: (petId: string, wearableIds: string[]) => request<any>(`/api/pet/pets/${encodeURIComponent(petId)}/outfit`, { method: 'PUT', body: JSON.stringify({ wearableIds }) }),
  purchase: (body: { itemId: string; quantity?: number; petId?: string | null }, key: string) => request<any>('/api/pet/shop/purchase', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
  saveRoom: (body: { themeId: string; visibility: string; placements: RoomPlacement[] }) => request<any>('/api/pet/room', { method: 'PUT', body: JSON.stringify(body) }),
  classRooms: () => request<any>('/api/pet/rooms/class'),
  room: (studentId: string) => request<any>(`/api/pet/rooms/${encodeURIComponent(studentId)}`),
  react: (studentId: string, reaction: string) => request<any>(`/api/pet/rooms/${encodeURIComponent(studentId)}/reactions`, { method: 'POST', body: JSON.stringify({ reaction }) }),
  grantNotifications: () => request<{ success: true; grants: TeacherGrantNotification[] }>('/api/pet/grant-notifications'),
  acknowledgeGrantNotifications: (transactionIds: string[]) => request<{ success: true; count: number }>('/api/pet/grant-notifications/acknowledge', { method: 'POST', body: JSON.stringify({ transactionIds }) }),
  teacherRoster: () => request<any>('/api/pet/teacher/roster'),
  coinPusherSettings: () => request<import('./types').CoinPusherSettings>('/api/pet/teacher/coin-pusher/settings'),
  saveCoinPusherSettings: (rewardPerCoin: number) => request<import('./types').CoinPusherSettings>('/api/pet/teacher/coin-pusher/settings', { method: 'PUT', body: JSON.stringify({ rewardPerCoin }) }),
  quietCurrent: () => quietRequest<{ session: QuietSession | null }>('/api/pet/teacher/quiet-room'),
  quietStart: (body: QuietSettings, key: string) => quietRequest<{ session: QuietSession }>('/api/pet/teacher/quiet-room', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
  quietUpdate: (id: string, action: string, eventId?: string) => quietRequest<{ session: QuietSession }>(`/api/pet/teacher/quiet-room/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action, eventId }) }),
  grantPreview: (body: any) => request<any>('/api/pet/teacher/grants/preview', { method: 'POST', body: JSON.stringify(body) }),
  grantCommit: (body: any, key: string) => request<any>('/api/pet/teacher/grants/commit', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
};
