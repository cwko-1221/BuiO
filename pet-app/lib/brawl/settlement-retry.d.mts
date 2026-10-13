export function retrySettlement<T>(send: () => Promise<T>, options?: {
  attempts?: number; maxElapsedMs?: number; now?: () => number; wait?: (ms: number) => Promise<void>;
}): Promise<T>;
