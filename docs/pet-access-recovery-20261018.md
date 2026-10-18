# Pet access reconnect recovery — 2026-10-18

## Problem

An already running game displayed “暫未能確認樂園狀態” whenever a background
`/api/pet/access` request failed or reached its five-second deadline. The access
guard made the app inert and paused gameplay on every error. Returning to the
tab also blocked the game before receiving an updated status. An older failed
request could replace a more recent teacher unlock received over the socket.

This explains the disruptive overlay; it does not establish whether the
individual production request failed because of the network, host or database.

## Change

- Keep a recent, server-confirmed open permission during transient status errors
  and refresh it in the background. Returning to a recently verified tab does
  not pause gameplay to perform the check.
- Expire that permission independently of retry backoff after at most 30 seconds
  from the request start, or at the next known scheduled lock, whichever is
  sooner. Use monotonic elapsed time and the server's relative schedule time.
- Keep first entry blocked until confirmed. Apply actual teacher locks and HTTP
  authentication rejection immediately. A socket unlock cannot bypass an HTTP
  authentication rejection; a successful authenticated status check is required.
- Ignore both stale successes and stale failures after newer access events.
- Retain the existing server authorization, polling cadence, scheduled locks,
  battle cancellation/refunds and authoritative combat behavior. No prediction
  or simulated network responses are added to the game.

## Verification

- `npm --prefix pet-app exec -- tsc --noEmit -p pet-app/tsconfig.json`: passed.
- `npm run build:pet`: passed, including four production artifact checks.
- `node --test pet-app/tests/access-lock.test.js`: five tests passed.
- `node scripts/test-pet-access-live.mjs`: 15 browser check groups passed with
  no page errors. Added faults cover repeated HTTP 503 responses, a real
  five-second request timeout, foreground refresh, initial entry failure,
  permission expiry, a scheduled boundary during failures, a stale failed
  request after unlock, and immediate HTTP 401 blocking. Existing teacher,
  schedule, class isolation, saved-game and paid duel refund checks also passed.
- The extended browser suite against the preceding production bundle reproduced
  the reported overlay at the repeated-failure assertion. The same scenario
  passes with the new bundle; screenshots were visually inspected.

The browser suite uses isolated local fixtures, not production student accounts.
It does not claim physical iPad or live PostgreSQL fault-injection coverage.
Local evidence is in `tmp/access-recovery/`; the failing baseline is in
`tmp/access-recovery-baseline/`.
