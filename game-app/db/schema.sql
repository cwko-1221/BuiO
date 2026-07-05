-- BuiO Game module ("Don't Look Down" style climbing quiz game) schema.
-- Question sets are teacher-owned and game-specific; the live game state
-- itself lives in memory on the socket server, only the question content
-- is persisted here.

create extension if not exists "pgcrypto";

create table if not exists public.game_question_sets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by text not null references public.users(studentid) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.game_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.game_question_sets(id) on delete cascade,
  question text not null,
  choices jsonb not null,               -- array of 2-4 answer strings
  correct_index integer not null check (correct_index between 0 and 3),
  order_index integer not null default 0
);

create index if not exists game_questions_set_idx on public.game_questions(set_id);
create index if not exists game_question_sets_creator_idx on public.game_question_sets(created_by);
