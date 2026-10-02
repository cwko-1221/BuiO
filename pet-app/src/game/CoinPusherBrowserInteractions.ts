import { lockGameBrowserInteractions } from './GameBrowserInteractions';

/** Lock native zoom/selection only while the cabinet (including its HUD/dialogs) is open. */
export function lockCoinPusherBrowserInteractions(): () => void {
  return lockGameBrowserInteractions('coin-pusher-input-locked');
}
