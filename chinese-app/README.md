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
   AZURE_PRONUNCIATION_PASS_SCORE=75
   AZURE_PRONUNCIATION_RETRY_SCORE=55

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
- The server marks recordings that are too short, too quiet, clipped, or too noisy as
  `inconclusive`; these recordings do not count as incorrect attempts.
- Valid recordings use Azure Speech scripted Pronunciation Assessment with locale `zh-HK`
  and the assignment text as the reference text.
- `AccuracyScore` determines `pass`, `retry`, or `inconclusive`. The transcript is stored
  only for teacher context and does not determine the score.
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
