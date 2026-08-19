# 粵語學習 (chinese-app)

A BuiO module ported from the standalone `Chinese/` Next.js project. Now runs
inside the same Express server, shares BuiO's session/user table, and is reachable at `/chinese`.

## Layout

```
chinese-app/
├── db/schema.sql              SQL for ncs_classes / ncs_class_students /
│                              ncs_assignments / ncs_assignment_items /
│                              ncs_attempts / ncs_attempt_items
├── lib/
│   ├── google.js              Google Cloud TTS helper
│   ├── pronunciation.js       Azure zh-HK Pronunciation Assessment helper
│   ├── audioQuality.js        PCM WAV validation + classroom noise quality gate
│   └── storage.js             Supabase Storage upload helper
├── repositories/
│   ├── classes.repo.js
│   ├── assignments.repo.js
│   └── attempts.repo.js
├── routes/
│   ├── teacher.js             /api/chinese/teacher/* (requireTeacher)
│   ├── student.js             /api/chinese/student/*  (requireAuth)
│   └── media.js               /api/chinese/tts | /pronunciation | /upload
└── public/
    ├── css/style.css
    ├── js/common.js
    ├── index.html             routes student → /chinese/student, teacher → /chinese/teacher
    ├── teacher.html           class + assignment management, attempt review
    ├── student.html           assignment list
    └── practice.html          handwriting + TTS + pronunciation assessment flow
```

## Setup

1. Run `chinese-app/db/schema.sql` against your Postgres database (or Supabase SQL editor).
   The tables reference the existing `public.users(studentid)` BuiO table, so a single
   login covers both modules — students/teachers do **not** need a second account.

2. Add the following to `.env` at the BuiO root:

   ```env
   # Google Cloud TTS. Paste the entire service-account JSON on one line.
   GOOGLE_CREDENTIALS_JSON={"type":"service_account",...}
   # Or, for local dev only, you can point at a JSON file:
   # GOOGLE_APPLICATION_CREDENTIALS=C:/Users/kochu/Documents/BuiO/gcp-key.json

   # Azure Speech — required for real Cantonese pronunciation assessment.
   AZURE_SPEECH_KEY=your-speech-resource-key
   AZURE_SPEECH_REGION=eastasia

   # Optional calibration thresholds (defaults shown).
   # 70% and above passes. Nothing sits between pass and retry.
   AZURE_PRONUNCIATION_PASS_SCORE=70
   AZURE_PRONUNCIATION_RETRY_SCORE=70
   # A confident reading below this current-item Jyutping score is clearly different.
   AZURE_CONTENT_WRONG_SCORE=65
   # zh-HK does not return the identity of the phoneme actually spoken. Avoid false 100s.
   AZURE_PRONUNCIATION_MAX_SCORE=98
   # How much of the score comes from whichever of the two evidence signals is lower.
   AZURE_PRONUNCIATION_LOWER_SIGNAL_WEIGHT=0.7
   # How a syllable divides. Tone multiplies the sounds rather than sitting beside them.
   AZURE_PRONUNCIATION_ONSET_WEIGHT=0.25
   AZURE_PRONUNCIATION_FINAL_WEIGHT=0.35
   AZURE_PRONUNCIATION_TONE_WEIGHT=0.4
   # How hard the weakest third of the phonemes pulls the score down.
   AZURE_PRONUNCIATION_LOWER_BAND_WEIGHT=0.15
   # Miscue detection scores classroom noise as an inserted word. Leave it off.
   AZURE_PRONUNCIATION_ENABLE_MISCUE=0
   # F0 allows one concurrent real-time Speech request. Raise this only after moving to S0.
   AZURE_SPEECH_MAX_CONCURRENT=1
   # A student queued behind a full slot gives up here instead of hanging.
   AZURE_SPEECH_QUEUE_TIMEOUT_MS=25000
   # Classroom noise is scored, not rejected. Set to 1 to restore the old hard gate.
   CHINESE_AUDIO_NOISE_GATE=0

   # Supabase Storage (for student recording uploads — optional).
   # Re-uses the same creds the project already uses.
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
   ```

   - Missing Google creds → `/api/chinese/tts` returns `501` and the front-end falls back
     to browser `speechSynthesis`.
   - Missing Azure Speech creds → `/api/chinese/pronunciation` returns `501` and the
     front-end falls back to self-assessment buttons. It never falls back to transcript
     similarity because that is not a pronunciation score.
   - Missing Supabase Storage creds → recording uploads are skipped silently
     (pronunciation assessment still runs).

3. Existing databases must apply
   `chinese-app/db/migrations/20260811_pronunciation_assessment.sql` once. New databases
   get the same columns from `schema.sql`.

4. Start the BuiO server (`npm run dev`). The portal tile under "粵語學習" links to `/chinese`.

## Pronunciation assessment

- Student audio is captured as mono PCM, resampled to 16 kHz, and sent as lossless WAV.
- The lossless WAV is used only for Azure assessment. A separate `MediaRecorder` copy is
  archived to Supabase at a 24 kbps target bitrate (Opus/WebM where supported, AAC/MP4 on
  iPad Safari). Archiving runs in parallel and doesn't block the score from appearing.
- The server marks recordings that are too short, too quiet, or clipped as
  `inconclusive`; these recordings do not count as incorrect attempts. Background noise
  is **not** one of those reasons — a noisy recording is still scored (see below) and only
  carries a `warning: 'noisy'` metric for the teacher.
- The server fetches exactly the current `assignmentId + itemId`. The current item's Chinese
  text is the only `ReferenceText` sent to Azure scripted Pronunciation Assessment; the question
  bank and other assignment items are never included in that assessment.
- **Two Azure calls, and the second one is not optional.** Scripted pronunciation
  assessment force-aligns the audio to the reference text and reports that reference text
  back as the recognised text, so it cannot say what was actually spoken. Folding the two
  calls into one was tried and reverted: 海豚, 開豚 and Hi豚 all came back as 海豚 and all
  scored 98. What was said has to come from a recognition that has never seen the question.
- The two calls run **together** when `AZURE_SPEECH_MAX_CONCURRENT` is 2 or more, so the
  student waits for one round trip rather than two. On F0, which allows a single concurrent
  request, they stay sequential and a clearly wrong answer still skips the assessment call.
- Azure `zh-HK` returns an accuracy score for each expected phoneme, but doesn't return the
  identity of the phoneme actually spoken. The reference-free recognition supplies that
  missing evidence and is converted to Jyutping.
- Expected and heard Jyutping are aligned syllable by syllable. Onset (25%) and final (35%)
  make up the sounds, and **tone (40%) multiplies them rather than sitting beside them**.
  Tone only means something on the right syllable: Cantonese has six tones and they collide
  constantly, so 你好 read for 企鵝 must not be rewarded for sharing both tones with it —
  scored side by side that pair got 66, and as a multiplier it gets the 44 it deserves.
  `海豚 hoi2 tyun4` read as `開豚 hoi1 tyun4` scores 80 for this evidence, and as
  `凱豚 hoi5 tyun4` scores 90, because tone 5 is a near neighbour of tone 2.
- **Every dictionary reading of a character counts as correct.** 你 is `nei5` or `lei5`
  and 好 is `hou2` or `hou3`; scoring against a single canonical reading failed children
  who chose the other valid one. A teacher's own Jyutping stays authoritative and is simply
  accepted alongside the dictionary's alternatives.
- **Classroom noise is trimmed, not punished.** The scorer finds the stretch of heard
  syllables that best matches the question and scores only that stretch, so 你好 spoken
  inside `旱上料刷你好料刺尹料` is scored as 你好. A window shorter than the question is
  still normalised against the full question, so 你好 read as just 你 scores 50, not 100 —
  skipping a syllable is a real deduction, and the child is told the answer was unfinished
  rather than wrong. Azure miscue detection is off for the same reason: it scores the
  neighbours as inserted words.
- The displayed percentage weights whichever of the two signals is **lower** at 70% and the
  higher at 30%, with a default automatic ceiling of 98. A reading is only as good as its
  weakest evidence, but not hostage to it: the outright minimum let one noisy signal fail an
  accurate reading, while an even blend let a confident forced alignment carry a word the
  recogniser never heard. Full-text, word, and completeness aggregates remain diagnostic
  only. Google STT is not used.
- **70% and above passes.** There is no band between pass and retry: anything below the
  pass mark is a retry with an explanation of what the scorer heard. `inconclusive` is now
  reserved for recordings that produced no usable evidence at all.
- Practice and assessment scores, status, provider, and audio-quality metrics are stored
  on each attempt item for auditing and later threshold calibration.

## How the portal integration works

- Auth: requests pass through BuiO's existing `cookie-session` middleware.
  Teachers (`role = 'teacher'`) hit the teacher dashboard; everyone else lands on the
  student dashboard. The math-app middleware `requireAuth` / `requireTeacher` is reused
  unchanged.
- DB: all repository calls go through `math-app/db/database.js` `getPool()`. If
  `SUPABASE_DB_URL` is unset (json mode), the Chinese module's API returns `503`.
- Front-end: vanilla JS, no build step. `hanzi-writer` is loaded from jsDelivr CDN.
  Hanzi stroke data is fetched on demand from `cdn.jsdelivr.net/npm/hanzi-writer-data@2`.

## Notes vs. the original Next.js project

- `ncs_users` table is **gone** — we use `public.users(studentid TEXT)` from BuiO.
  All FKs are text (BuiO student IDs like `S001`, `T001`) instead of UUIDs.
- The `initial_password` field on `ncs_class_students` is removed.
- React + framer-motion + lucide → vanilla JS + CSS transitions.
- API routes are CommonJS Express handlers instead of Next.js route handlers.
