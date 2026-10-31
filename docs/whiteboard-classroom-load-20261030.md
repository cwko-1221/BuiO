# Whiteboard classroom disconnects — 30 October 2026

Follow-up: [invalidation-based rendering, incremental checkpoints and durable recovery](whiteboard-performance-recovery-20261030.md) supersede the memory-only recovery limitation described in this original incident record.

Reported workload: about 28 students on iPad Safari, with roughly half losing
their whiteboard connection during the lesson.

## Production evidence

Read-only inspection of Ko / Buiosch (`srv-da1ecevlk1mc739rns5g`), running commit
`b3df0c22e806e2dd77d8df15983150e7d500161d`:

- 10:19:27 HKT: `server_failed`, HTTP health check timed out after five seconds.
  The runtime log confirms an automatic instance restart.
- 10:19:51 HKT: `server_available`.
- CPU samples at 10:17 and 10:19 reached the reported 0.15 CPU quota. Memory
  before restart was 328,421,380 / 536,870,900 bytes (about 61%). No OOM reason
  or deployment was recorded in the incident window.
- Whiteboard teacher transport errors appeared at 10:18:12 and 10:19:16.
- The bandwidth screenshot is an hourly aggregate, not an instantaneous
  measurement of the failure. It does not identify individual Socket.IO events.

These facts establish an overloaded/unresponsive instance and restart. The
whiteboard workload and code identify avoidable amplification, but no production
CPU profile is available to attribute every CPU cycle or disconnect to one event.

## Changes

- Send student live drawing and individual clears to the teacher only. Student
  clients do not render their classmates' drawing events. At 28 students this
  reduces each live point's recipients from 28 to one (96.4% fewer deliveries).
- Send teachers the PNG and shapes they render, omitting the editable stroke
  history and base image they never use. Preserve the full editable checkpoint
  for returning students. Disable repeated WebSocket compression on these PNG
  checkpoint deliveries and the small, teacher-only live point messages.
- Coalesce student checkpoints at 1.5-second intervals, with at most one waiting
  for server acknowledgement. Lost acknowledgements retry the latest board.
  Disconnects do not accumulate obsolete draw packets or full PNG snapshots.
- Wait for room membership before sending a pending checkpoint. Preserve local
  unconfirmed/offline edits instead of replacing them with an older saved board.
  Teacher clear cancels queued work so an obsolete backup cannot restore it.
- In the teacher view, replay newer live points after asynchronous PNG decoding;
  a clear invalidates pending image loads. Draw each new line segment once
  instead of repeatedly stroking a growing path.
- Remove the teacher page's immediate end-class beacons. After detecting any
  teacher disconnect, the server retains the classroom for two minutes. Reload
  or transport reconnect cancels expiry and retains the same room, worksheet,
  student boards, lock and buzzer state; without a returning teacher it expires.
  Explicit End Class remains immediate. The two-minute clock starts when the
  server detects the lost connection, so a silent network loss can add heartbeat
  detection time. Switching tabs alone does not end a connected classroom.
- This uses server-side connection state because browser close/reload events
  cannot reliably distinguish intent. Windows WebKit testing confirmed that
  closing a tab may send no page-exit beacon. See [MDN pagehide usage notes](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event#usage_notes).

## Verification

- `node --test whiteboard-app/server/socket.test.js`: 16 tests, including 28 real
  Socket.IO writers, all 3,360 live points delivered to the teacher, no live points
  sent to classmates, and restoration of all 14 simulated disconnected boards.
  Authentication, classroom visibility, teacher reconnect, locks and buzzer state
  regressions also pass.
- `node --test whiteboard-app/client/src/utils/boardSnapshots.test.mjs`: coalescing,
  one checkpoint in flight, lost acknowledgement, offline edits and clear races.
- `npm --prefix whiteboard-app/client run build` succeeds.
- `node scripts/test-whiteboard-classroom-live.mjs`: real compiled teacher/student
  UI in Chrome and Windows WebKit; coalesced writing, lost acknowledgement,
  offline writing/reconnect, delayed PNG decode versus live ink/clear, and 27
  additional Socket.IO peers beside the browser student. Evidence and screenshots
  are generated in ignored `tmp/whiteboard-classroom/`.
  Teacher transport loss and an actual delayed browser reload keep all 28
  students in the same room; closing the teacher tab without returning expires
  it. The browser fixture injects a four-second reconnect grace for speed, while the
  server tests separately verify the production 120-second default.

These tests use local isolated identities and no production database. They do not
reproduce Render's 0.15 CPU quota, school Wi-Fi, a full lesson's duration or 28
physical iPads. Room snapshots remain in server memory; a process restart still
requires the teacher to reopen the classroom. This patch reduces avoidable load
and preserves edits across transport reconnects, not across server restarts.

No database migration, hosting-plan change or production deployment is included.
