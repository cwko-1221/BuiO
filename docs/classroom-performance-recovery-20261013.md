# Classroom loading and battle performance — 13 October 2026

Reported workload: approximately 25 students using iPads. Tower defense can wait
indefinitely; pet battles lag; other pages sometimes need a manual reload.

## Evidence and scope

- Production logged pet replay verification timeouts around 10:59–11:00 HKT.
- Sampled afternoon requests sometimes spent 1–3 seconds overall although their
  recorded SQL execution was much shorter. Pool waits also appeared. Those
  samples do not establish one cause for every classroom slowdown.
- Five-minute Render samples peaked near 0.061 CPU cores against a 0.15 quota,
  and about 268 MB memory against 512 MB. These averages cannot rule out brief
  contention. Cumulative PostgreSQL statistics are not lesson-specific counts.
- The shared fetch wrapper stopped its deadline after headers, leaving a stalled
  JSON body unbounded. This affects multiple modules.
- The battle server repeatedly sent identical online rosters, reliably queued
  disposable display frames, and emitted intermediate snapshots during catch-up.
- Replay workers started their five-second timer before loading their modules,
  accepted a queue smaller than the reported class, and repeated pending work
  when a client retried the same run.

## Changes

1. Same-origin API JSON deadlines now cover the complete body. Truncated reads
   can recover; caller cancellation stops retries. Foreground reads allow 15
   seconds per attempt, background polls 8 seconds, and ordinary writes 60
   seconds. Existing streaming consumers retain control of their connections.
   General writes are never automatically replayed.
2. A small allowlist of simultaneous bootstrap/identity reads shares one
   download. Completed results are not cached; writes clear pending batches.
3. Online rosters emit only when their contents change. The authoritative
   simulation remains at 60 Hz; display updates target 20 Hz, send only the
   latest snapshot, and drop under transport backpressure. Invitations, phase
   changes and settlement results retain reliable delivery.
4. Replay verification defaults to one worker, reserving CPU for HTTP and live
   battles. Worker startup has its own 20-second deadline; execution allows 15
   seconds; 32 waiting jobs have a 120-second queue deadline. Failed workers are
   replaced. The same student/run/digest shares its pending verification.
5. Only the existing idempotent adventure finish endpoint retries transient
   settlement failures, with the same log/key and a bounded attempt/time budget.
   Rejected logs and authorization failures do not retry.
6. Pet/tower asset loaders use four parallel downloads, a 20-second timeout and
   one file retry. Tower defense keeps simulation frozen until all required
   textures exist; missing textures can retry without replacing the simulation
   or creating another question-bank session. Recovery uses the loading panel.

No database migration or paid hosting change is included.

## Validation

- `npm run check:classroom-performance`: six verifier/settlement fault tests;
  25 real Socket.IO clients and 12 simultaneous authoritative matches.
  Unchanged-roster packets over 2.2 seconds: **0**. Display frames in 1.2 seconds:
  **24 per player**. Injected transport congestion: **0 queued display frames**;
  latest frames resumed and the final result arrived reliably.
- Loading browser tests in Chrome and WebKit cover stalled/truncated bodies,
  cancellation, fresh identity reads, background timeouts, offline recovery,
  input retention, write safety and loading animation lifecycle.
- Tower startup/full gameplay tests in Chrome and WebKit cover 30 simultaneous
  session creations, blocked audio, lost acknowledgements, duplicate starts,
  missing assets, reconnect, questions, all maps, touch layouts and victory.
- Pet PvP browser tests cover payment, combat, multitouch, reload recovery,
  surrender and asset-failure refunds. At 1024×768 with Chrome CPU throttled 4×,
  a five-second sample measured **60 FPS**, frame p95 **16.8 ms**, scene draw p95
  **2.5 ms**, and **0 frames over 100 ms**. Screenshots were inspected.
- Adventure replay/rewards, PvP/ranking, access/egress, school upgrade, TypeScript
  compilation, production build and static checks passed.

These are local fixtures and browser simulations, not measurements of physical
iPads or a 25-browser classroom on the production Free instance. Real classroom
latency and packet loss still need to be observed after deployment. Render Free
also sleeps after inactivity; code changes cannot remove its cold-start policy.
