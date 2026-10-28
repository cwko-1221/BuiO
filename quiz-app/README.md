# Live Quiz

The third game in `/games`, using the existing four-choice question banks and question images.

- `/quiz-mode/host`: teacher projector and controls.
- `/quiz-mode`: student A/B/C/D controller.
- Explicit development mode only: `/quiz-mode/host/preview` and `/quiz-mode/preview`.
- Socket.IO namespace `/quiz`. Account identity and teacher permissions come from the platform session, not event payloads. Preview identities are unavailable in production.

Each round runs a 3-second preparation countdown followed by a teacher-selected 5-120-second answer window. Everyone answering, timeout, or teacher reveal closes the question. Teachers then show the option distribution, inspect names behind a bar, show **all** student scores, and advance. Unanswered and wrong answers earn zero.

Correct answers earn up to 1,000 points: responses under 500ms earn 1,000; otherwise `round(1000 * (1 - elapsed / duration / 2))`. This follows [Kahoot's speed scoring](https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work). Time, correctness, answer deduplication, scoring and question deadlines are server-authoritative. Correctness and earned points are withheld until reveal. Student payloads never contain question text, pictures or option text.

Equal scores sort by correct count, total correct-answer time, then join order. Both teacher and student reconnects restore the current round. A host has two minutes to reconnect; a room expires after two hours. Room state is in memory, like the existing game classrooms, and does not survive server restarts. Results can be downloaded as UTF-8 CSV before closing the room.

Run `node scripts/test-quiz-mode.mjs` and `node scripts/test-quiz-mode-live.mjs`. The live test starts an isolated fixture server and does not change the real database or any student's results.

The teacher's Audio menu controls original synthesized lobby/question music, sound effects and volume. Student music is off by default. Browser audio is unlocked by a pointer or keyboard gesture; hidden/offline screens pause playback. Stage transitions, growing result bars, score counting and bounded celebration effects respect reduced-motion preferences. Teachers can switch between answer statistics and the original question/image without losing the selected voter list.
