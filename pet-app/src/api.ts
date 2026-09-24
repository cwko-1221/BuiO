import type { Bootstrap, Identity, RoomPlacement, TeacherGrantNotification } from './types';

// The shared runtime is loaded blocking in <head>, before this bundle runs.
const t = (key: string) => (window as any).BuiI18n.t(key) as string;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ success: false, message: t('pet.badResponse') }));
  if (!response.ok || data.success === false) throw new Error(data.message || t('pet.actionFailed'));
  return data as T;
}

export const api = {
  identity: async () => (await request<{ student: Identity }>('/api/auth/me')).student,
  bootstrap: () => request<Bootstrap & { success: true }>('/api/pet/bootstrap'),
  hatch: (key: string) => request<any>('/api/pet/starter-egg/hatch', { method: 'POST', headers: { 'Idempotency-Key': key }, body: '{}' }),
  buyEgg: (body: { kind: 'random' | 'direct'; speciesId?: string }, key: string) => request<any>('/api/pet/eggs/purchase', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
  playCoinPusher: (key: string) => request<any>('/api/pet/coin-pusher/play', { method: 'POST', headers: { 'Idempotency-Key': key }, body: '{}' }),
  payoutCoinPusher: (body: { playId: string; eventId: string; amount: number }, key: string) => request<{ earned: number; balance: number; remainingPayout: number; collection?: { returnedCoins: number } }>('/api/pet/coin-pusher/payout', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
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
  grantPreview: (body: any) => request<any>('/api/pet/teacher/grants/preview', { method: 'POST', body: JSON.stringify(body) }),
  grantCommit: (body: any, key: string) => request<any>('/api/pet/teacher/grants/commit', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(body) }),
};
