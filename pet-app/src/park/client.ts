import type { ParkFrame, ParkJoin, ParkPeer, ParkResult } from './types';
import type { GameInput } from '../../lib/park-games.mjs';
interface Socket {
  connected: boolean; on(event: string, listener: (payload: any) => void): void;
  volatile: { emit(event: string, body: unknown): void };
  emit(event: string, body: unknown, callback?: (result: any) => void): void; disconnect(): void;
}
let loading: Promise<void> | undefined;
async function loadSocket() {
  if ((window as any).io) return;
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/socket.io/socket.io.js'; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { loading = undefined; script.remove(); reject(new Error('未能連接樂園，請重試。')); };
    document.head.append(script);
  });
  return loading;
}
export class ParkClient extends EventTarget {
  private socket?: Socket;
  private abort = new AbortController();
  private heartbeat?: number;
  private closed = false;
  private joining = false;
  private mask = 0;
  locked = false;
  connected = false;
  ready = false;
  peers: ParkPeer[] = [];
  frames = new Map<string, ParkFrame>();
  selfId = '';
  private event(type: string, detail?: unknown) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  async start() {
    await loadSocket(); if (this.closed) return;
    this.socket = (window as any).io('/pet-park', { withCredentials: true, transports: ['websocket', 'polling'] });
    this.socket!.on('connect', () => { this.connected = true; this.ready = false; this.event('connection'); void this.join(); });
    this.socket!.on('disconnect', () => { this.connected = false; this.ready = false; this.frames.clear(); this.event('connection'); });
    this.socket!.on('connect_error', error => {
      this.connected = false; this.ready = false;
      if (error?.data?.access) window.dispatchEvent(new CustomEvent('pet:access', { detail: error.data.access }));
      this.event('error', error.message || '未能連接樂園。'); this.event('connection');
    });
    this.socket!.on('park:roster', ({ peers }: { peers: ParkPeer[] }) => { this.peers = peers; this.event('roster'); });
    this.socket!.on('park:frame', ({ peers }: { peers: ParkFrame[] }) => { this.frames = new Map(peers.map(p => [p.id, p])); this.event('frame'); });
    this.socket!.on('park:effect', detail => this.event('effect', detail));
    this.socket!.on('park:social', detail => this.event('social', detail));
    this.socket!.on('park:garden', detail => this.event('garden', detail));
    this.socket!.on('park:game:frame', detail => this.event('game:frame', detail));
    this.socket!.on('park:game:cancelled', detail => this.event('game:cancelled', detail));
    this.socket!.on('park:notice', ({ message }) => this.event('error', message));
    this.socket!.on('park:access', detail => window.dispatchEvent(new CustomEvent('pet:access', { detail })));
    const signal = this.abort.signal;
    document.addEventListener('visibilitychange', () => {
      this.input(0); if (this.ready) void this.presence().catch(() => {});
    }, { signal });
    window.addEventListener('blur', () => this.input(0), { signal });
    window.addEventListener('pagehide', () => this.destroy(), { signal });
    this.heartbeat = window.setInterval(() => { if (this.ready) void this.presence().catch(error => this.event('error', error.message)); }, 4000);
  }
  private async join() {
    if (this.joining || this.closed || this.locked) return; this.joining = true;
    try {
      const result = await this.request<ParkJoin>('park:join', {});
      if (this.closed) return; this.ready = true; this.selfId = result.self.id; this.peers = result.peers;
      this.frames.set(result.self.id, result.self); this.event('join', result); this.event('connection');
      await this.presence();
    } catch (error) { this.event('error', (error as Error).message); }
    finally { this.joining = false; }
  }
  request<T = ParkResult>(event: string, body: unknown): Promise<T> {
    if (!this.socket?.connected || this.closed || this.locked) return Promise.reject(new Error(this.locked ? '樂園暫時未開放。' : '正在重新連線，請稍候。'));
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('連線較慢，請重試；已完成的獎勵會保留。')), 12000);
      this.socket!.emit(event, body, result => {
        clearTimeout(timeout);
        if (result?.access) window.dispatchEvent(new CustomEvent('pet:access', { detail: result.access }));
        if (!result?.success) reject(Object.assign(new Error(result?.message || '未能完成操作。'), { status: result?.status })); else resolve(result);
      });
    });
  }
  async presence() {
    const result = await this.request<{ day: string }>('park:presence', { active: !document.hidden && !this.locked });
    this.event('day', result.day);
  }
  move(x: number, y: number) { return this.request<{ destination: { x: number; y: number }; path: { x: number; y: number }[] }>('park:move', { x, y }); }
  input(mask: number, repeat = false) {
    if (!this.ready || !this.socket?.connected || this.locked) return;
    if (mask === this.mask && !repeat) return; this.mask = mask;
    this.socket.emit('park:input', { mask });
  }
  stop() { this.mask = 0; if (this.ready && this.socket?.connected && !this.locked) this.socket.emit('park:input', { mask: 0, stop: true }); }
  gameInput(session: string, input: GameInput) {
    if (!this.ready || !this.socket?.connected || this.closed || this.locked) return;
    // Replaceable samples never wait for acknowledgements or accumulate offline.
    // Monotonic action counters in every sample keep short taps from being lost.
    this.socket.volatile.emit('park:game:input', { session, ...input });
  }
  async setLocked(locked: boolean) {
    if (locked) this.input(0); this.locked = locked;
    if (locked) { this.ready = false; this.socket?.disconnect(); this.event('connection'); }
  }
  destroy() {
    if (this.closed) return; this.input(0); this.closed = true; this.ready = false;
    clearInterval(this.heartbeat); this.abort.abort(); this.socket?.disconnect();
  }
}
