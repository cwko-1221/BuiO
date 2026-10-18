# Quiz feedback and navigation latency — 18 October 2026

The user reported roughly ten seconds waiting after an answer, and very slow
Home navigation. The screenshots were captured at 18:22 and 18:24 HKT, before
the subsequent pet access recovery deployment.

## Findings

1. The shared maths CSS imported Inter and Noto Sans TC through a Google Fonts
   stylesheet. This is a render-blocking CSS dependency. In the real browser
   fixture, the document arrived in about 4–7 ms and its server handler took
   1–1.5 ms, but DOM initialization took 7.2–11.3 seconds before this was removed.
   A controlled comparison delaying the external stylesheet by two seconds
   reproduced the dependency: the old CSS took 2,087 ms to initialize, while
   the fixed CSS took 37 ms and made no external font request.
2. The portal waited for identity, homework permissions, then homework records
   before rendering. The latter two requests do not depend on one another or
   need to delay access to other modules. A failed homework request could add
   the shared read retry budget to opening Home.
3. Every question waited for an HTTP POST to `/api/quiz/grade` before displaying
   feedback. This endpoint is a pure read of the signed quiz session and does
   not query PostgreSQL. Its generic write timeout was up to sixty seconds.
   Browser/server network probes found routine small-response waits around
   0.4–0.8 seconds and additional serialized module-loading round trips.
4. The statistics page also loaded Chart.js synchronously from an external CDN.
   Its availability could delay the page parser and navigation controls.

The available Render samples did not establish sustained CPU or memory
exhaustion. Cumulative Supabase statistics showed small maths queries, not a
ten-second grading query. These samples cannot rule out brief contention or
identify every individual production failure. Existing request timing started
after JSON body parsing and did not cover document navigation, leaving a gap
between the browser report and application logs.

## Changes

- Remove the external font import and use system fonts with Traditional Chinese
  fallbacks. All maths pages share this CSS.
- Render the portal after authenticated identity is confirmed. Fetch homework
  permissions and records concurrently in the background, indicate unconfirmed
  records honestly, ignore replies belonging to a previous account, and avoid
  replacing settings/admin forms when background work finishes.
- Preload the portal's existing ES module dependencies concurrently instead of
  discovering them over several network round trips. No completed identity or
  API responses are cached.
- Add an authenticated `/math-quiz` Socket.IO namespace for read-only server
  feedback. It uses the signed session's questions, requires the quiz identity,
  limits requests per connection, and never persists marks or rewards. The
  grading implementation is shared with HTTP; no client prediction is added.
- Connect after questions arrive without delaying entry. If the optional client
  library or persistent transport is unavailable, retain HTTP grading. A missing
  acknowledgement falls back after 1.2 seconds. Only the pure feedback request
  may retry once after a 2.5-second attempt deadline. Losing both paths keeps
  the answer and allows the user to retry; it never invents feedback.
- Keep final submission and its idempotent outbox unchanged. It regrades the
  complete set on the server and persists it exactly once in the transaction.
- Serve the existing Chart.js version, 4.4.7, locally with pinned vendor caching
  and build-time compression. Load it asynchronously, so counters, text and Home
  navigation work while charts load. Fetch tier metadata and tag statistics
  concurrently. The chart loader has a bounded wait and local manual recovery.
- Measure request time before body parsing, include main document requests in
  slow/sampled logs, and publish a non-sensitive `Server-Timing: app;dur=...`
  header. Logs still omit bodies, cookies and query parameters.

## Validation

- `npm run check`: passed.
- `npm run check:loading`: all 17 loading, cancellation and write-safety checks
  passed. Optional chart/socket scripts use their own fallback instead of a
  redundant global recovery prompt; essential script errors retain recovery.
- `node scripts/test-school-upgrade-live.mjs`: passed 30/60 student isolated
  fixture flows, lost-response replay, offline retention, account isolation and
  recording recovery. These are not production classroom capacity measurements.
- `npm run check:quiz-navigation`: eleven check groups passed without page
  errors, including stalled homework, account switching, HTTP and socket faults,
  late acknowledgements, preserved input, malformed socket payloads, forged grade
  fields, exact fraction/decimal grading, a missing socket client library,
  final submission once, external font independence, and delayed local charts.
- The corrected local browser fixture measured Home usable in about 0.16 s
  while homework requests were held; authoritative feedback plus the existing
  550 ms animation in about 0.63 s; statistics usable in about 0.12 s while its
  chart download was held. These are fixture results, not Render latency claims.
- Before/after screenshots of the portal, quiz and statistics were inspected.
- Build-time text compression completed successfully, including local Chart.js.

Local evidence: `tmp/quiz-navigation-qa/`, `tmp/quiz-network-probe/`, and
`tmp/quiz-font-baseline.css`. No database schema or hosting-plan change is needed.
