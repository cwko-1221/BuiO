# Tower Defense startup recovery — 2026-10-13

The reported incident was around 2026-10-12 11:15 Hong Kong time. Students had
selected their maps but stayed at “Syncing the question bank…” after the teacher
started the classroom.

The old `startCampaign` awaited `audio.unlock()` before requesting `/session`.
If an AudioContext resume promise remained pending, no question-session request
was sent. A teacher's socket event supplies no new student gesture. Web Audio's
[resume algorithm](https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-resume)
allows pending promises while a context is not allowed to start. The climbing
game already starts independently of its audio unlock.

The old client also had no request deadline, left the student launch button
disabled on failure, and did not rejoin after a socket reconnect. A map-selection
acknowledgement arriving after reconnect could overwrite the restored choice.

## Change

- Deployment, quiz opening and mute controls do not await audio. Student gestures
  still try to unlock it. Music starts when audio is running; suspended audio does
  not accumulate scheduled notes. Phaser's unused audio system is disabled because
  CrystalAudio supplies the game's music and effects.
- Requests have a 10-second deadline covering headers and body. Session creation
  retries once with a short jittered delay; permanent authorization/state failures
  are not retried. Retry-After is respected, with long waits left to manual retry.
- A start request ID is scoped to account and classroom. Lost-response retries
  return the existing question session without resetting questions or rewards.
  Legacy clients without a request ID continue to work. Keys expire with sessions.
- Failed deployment provides an enabled Retry deployment button. Concurrent or
  repeated start events do not replace an in-flight or running campaign.
- Reconnect rejoins the classroom, restores the chosen map and obtains the current
  server phase. A running campaign is preserved. Old map responses are ignored;
  classroom end/close cancels deployment.

## Production evidence

Read-only Render checks used the user-confirmed Ko workspace and Buiosch service
`srv-da1ecevlk1mc739rns5g`. The deployed version at the reported time was `4c29ce05`,
live since 2026-10-12 10:00:24 Hong Kong time. Auto-deploy is off.

The 11:15:18 room-list request returned 200 in 1ms with zero SQL queries. No
Tower Defense application error was returned for 10:45–11:45; no service event
was returned for 10:45–11:30. Request logs were unavailable, and successful app
request logs are sampled. Consequently, absence of a logged `/session` POST does
not prove that every affected iPad stopped before that request. No device console
recording exists to identify the exact cause of each student's incident.

## Validation

`node scripts/test-tower-defense-start.mjs --baseline` serves the previous client
and simulates a never-resolving audio resume. Both Chromium and WebKit reproduce
the disabled syncing button with zero session requests.

`npm run check:tower-defense-start -- --full` passes 15 scenarios, including
30 simultaneous local students, duplicated session requests, denied/pending
audio, lost responses, temporary failures, manual retry, missing a start event,
and reconnect without restarting a running campaign. The complete existing
browser playtest also passes: teacher/student launch, quiz rewards, three maps,
tower controls, audio, waves, layout and victory. `npm run check` passes.

The fixture uses the real classroom server and question router behind strict
local stubs. It does not load school credentials, connect to production databases
or change local student data. Screenshots and reports are in
`tmp/tower-defense-start-20261013`. Desktop WebKit uses a simulated pending audio
context; it is not a recording from physical iPad Safari.
