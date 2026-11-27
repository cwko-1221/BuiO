# Live Quiz

The third game in `/games`, using the existing four-choice question banks and question images.

- `/quiz-mode/host`: teacher projector and controls.
- `/quiz-mode`: student question, image and A/B/C/D options view.
- Explicit development mode only: `/quiz-mode/host/preview` and `/quiz-mode/preview`.
- Socket.IO namespace `/quiz`. Account identity and teacher permissions come from the platform session, not event payloads. Preview identities are unavailable in production.

Each round runs a 3-second preparation countdown followed by a teacher-selected 5-120-second answer window. Everyone answering, timeout, or teacher reveal closes the question. Teachers then show the option distribution, inspect names behind a bar, show **all** student scores, and advance. Unanswered and wrong answers earn zero.

Correct answers earn up to 1,000 points: responses under 500ms earn 1,000; otherwise `round(1000 * (1 - elapsed / duration / 2))`. This follows [Kahoot's speed scoring](https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work). Time, correctness, answer deduplication, scoring and question deadlines are server-authoritative. Correctness, earned points, and voter details are withheld until reveal. Student payloads include the active round's question text, optional image, and option text while withholding `correctIndex` until reveal.

Equal scores sort by correct count, total correct-answer time, then join order. Both teacher and student reconnects restore the current round. A host has two minutes to reconnect; a room expires after two hours. Room state is in memory, like the existing game classrooms, and does not survive server restarts. Results can be downloaded as UTF-8 CSV before closing the room.

Run `node scripts/test-quiz-mode.mjs` and `node scripts/test-quiz-mode-live.mjs`. The live test starts an isolated fixture server and does not change the real database or any student's results.

The teacher's Audio menu controls original synthesized lobby/question music, sound effects and volume. Student music is off by default. Browser audio is unlocked by a pointer or keyboard gesture; hidden/offline screens pause playback. Stage transitions, growing result bars, score counting and bounded celebration effects respect reduced-motion preferences. Teachers can switch between answer statistics and the original question/image without losing the selected voter list.

Every question uses the existing server-timed three-second preparation period for a fullscreen four-colour curtain and countdown on both teacher and student screens. Question content stays hidden and controls are inert until `opensAt`; the transition does not shorten answer time. Reduced motion keeps the same countdown without the moving curtains, and reconnecting after the question opens skips the intro.

Teachers may optionally enable Pet Paradise coin rewards in the game hub or direct quiz setup, from 1 to 1,000 coins per correct answer (default amount 10, rewards off by default). The server awards authenticated student accounts after each question using the existing transactional pet-wallet grant API and a unique round idempotency key. Preview rooms only simulate rewards and never write wallets. Failed deliveries are shown to the teacher with a retry action; advancing or closing the room is blocked while rewards remain unsettled. Rewards use the existing wallet schema, without a new migration.

Image questions use a compact heading and answer layout on both teacher and student screens to leave room for an uncropped image while keeping the question and all four option buttons visible at normal browser zoom.

Reward checks: `node scripts/test-quiz-rewards-live.mjs` uses an isolated in-memory JSON store, and `node --test scripts/test-quiz-rewards-postgres.cjs` checks real PostgreSQL transaction semantics using PGlite. Neither test touches real student wallets.
