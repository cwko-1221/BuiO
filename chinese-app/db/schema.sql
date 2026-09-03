-- NCS Cantonese Lab — schema for BuiO integration.
-- Assignments target a (classname, chinese_group) pair directly — for example
-- ('P1', 'A組'). No separate class table; students see assignments whose
-- target matches their own users.classname + users.chinesegroup.

create extension if not exists "pgcrypto";

do $$
begin
  create type public.ncs_assignment_status as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.ncs_attempt_status as enum ('in_progress', 'completed');
exception
  when duplicate_object then null;
end $$;

-- If you previously ran the older schema (with ncs_classes/ncs_class_students),
-- run these DROPs first so the assignment column rename below succeeds:
--   drop table if exists public.ncs_attempt_items cascade;
--   drop table if exists public.ncs_attempts cascade;
--   drop table if exists public.ncs_assignment_items cascade;
--   drop table if exists public.ncs_assignments cascade;
--   drop table if exists public.ncs_class_students cascade;
--   drop table if exists public.ncs_classes cascade;

create table if not exists public.ncs_assignments (
  id uuid primary key default gen_random_uuid(),
  target_classname text not null,
  target_group text not null,
  title text not null,
  status public.ncs_assignment_status not null default 'published',
  created_by text not null references public.users(studentid) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ncs_assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ncs_assignments(id) on delete cascade,
  traditional_text text not null,
  jyutping text not null,
  english_meaning text not null,
  image_url text,
  order_index integer not null check (order_index between 1 and 5),
  unique (assignment_id, order_index)
);

-- For existing installs:
alter table public.ncs_assignment_items add column if not exists image_url text;

create table if not exists public.ncs_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.ncs_assignments(id) on delete cascade,
  student_id text not null references public.users(studentid) on delete cascade,
  status public.ncs_attempt_status not null default 'in_progress',
  score integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (assignment_id, student_id)
);

create table if not exists public.ncs_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.ncs_attempts(id) on delete cascade,
  assignment_item_id uuid not null references public.ncs_assignment_items(id) on delete cascade,
  handwriting_correct boolean not null default false,
  speech_transcript text,
  speech_correct boolean not null default false,
  speech_recording_url text,
  speech_pronunciation_score numeric(5,2),
  speech_pronunciation_status text,
  speech_audio_quality jsonb,
  speech_pronunciation_provider text,
  assessment_transcript text,
  assessment_correct boolean not null default false,
  assessment_recording_url text,
  assessment_pronunciation_score numeric(5,2),
  assessment_pronunciation_status text,
  assessment_audio_quality jsonb,
  assessment_pronunciation_provider text,
  created_at timestamptz not null default now(),
  unique (attempt_id, assignment_item_id)
);

-- Safe upgrade path for databases created before pronunciation assessment.
alter table public.ncs_attempt_items add column if not exists speech_pronunciation_score numeric(5,2);
alter table public.ncs_attempt_items add column if not exists speech_pronunciation_status text;
alter table public.ncs_attempt_items add column if not exists speech_audio_quality jsonb;
alter table public.ncs_attempt_items add column if not exists speech_pronunciation_provider text;
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_score numeric(5,2);
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_status text;
alter table public.ncs_attempt_items add column if not exists assessment_audio_quality jsonb;
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_provider text;

create index if not exists ncs_attempts_student_idx on public.ncs_attempts(student_id);
create index if not exists ncs_attempt_items_attempt_idx on public.ncs_attempt_items(attempt_id);
create index if not exists ncs_assignment_items_assignment_idx on public.ncs_assignment_items(assignment_id);
create index if not exists ncs_assignments_target_idx on public.ncs_assignments(target_classname, target_group);

-- Supabase Storage bucket for recordings.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('recordings', 'recordings', true)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
end $$;
