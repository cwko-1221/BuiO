import type { CoinPusherModelSnapshot } from './CoinPusherModel';

export interface StoredCoinPusherPlay {
  playId: string;
  remaining: number;
}

export interface StoredCoinPusherPayout {
  playId: string;
  amount: number;
  eventId: string;
  requestKey: string;
}

export interface StoredCoinPusherDrop {
  requestKey: string;
  worldX: number;
  applied: boolean;
  result?: { playId: string; payoutCap: number };
}

export interface CoinPusherSession {
  version: 1;
  studentId: string;
  updatedAt: number;
  model: CoinPusherModelSnapshot;
  plays: StoredCoinPusherPlay[];
  payoutSequence: number;
  pendingPayouts: StoredCoinPusherPayout[];
  bestTimingStreak?: number;
  pendingDrop?: StoredCoinPusherDrop;
}

const DATABASE_NAME = 'buio-pet-coin-pusher';
const DATABASE_VERSION = 1;
const SESSION_STORE = 'studentSessions';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Persistent arcade storage is unavailable'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: 'studentId' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open persistent arcade storage'));
    request.onblocked = () => reject(new Error('Persistent arcade storage is busy in another tab'));
  }).catch((error) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
}

function isSession(value: unknown, studentId: string): value is CoinPusherSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<CoinPusherSession>;
  return session.version === 1
    && session.studentId === studentId
    && Number.isFinite(session.updatedAt)
    && !!session.model
    && Array.isArray(session.plays)
    && Array.isArray(session.pendingPayouts)
    && Number.isSafeInteger(session.payoutSequence)
    && session.payoutSequence! >= 0;
}

export async function loadCoinPusherSession(studentId: string): Promise<CoinPusherSession | undefined> {
  const database = await openDatabase();
  return new Promise<CoinPusherSession | undefined>((resolve, reject) => {
    const transaction = database.transaction(SESSION_STORE, 'readonly');
    const request = transaction.objectStore(SESSION_STORE).get(studentId);
    request.onsuccess = () => {
      const session = request.result;
      if (session === undefined) return resolve(undefined);
      if (!isSession(session, studentId)) return reject(new Error('Saved coin-pusher session is invalid'));
      resolve(session);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not read saved coin-pusher session'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read saved coin-pusher session'));
  });
}

export async function saveCoinPusherSession(session: CoinPusherSession): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    transaction.objectStore(SESSION_STORE).put(session);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save coin-pusher session'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save coin-pusher session'));
  });
}

export async function clearCoinPusherSession(studentId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SESSION_STORE, 'readwrite');
    transaction.objectStore(SESSION_STORE).delete(studentId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not clear saved coin-pusher session'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not clear saved coin-pusher session'));
  });
}
