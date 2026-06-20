-- NCS Cantonese Lab — schema for BuiO integration.
-- Foreign-keys into the existing BuiO `users` table (text studentid),
-- so a single login covers the math module and this Chinese module.

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

create table if not exists public.ncs_classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null references public.users(studentid) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (teacher_id, name)
);

create table if not exists public.ncs_class_students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.ncs_classes(id) on delete cascade,
  student_id text not null references public.users(studentid) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists public.ncs_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.ncs_classes(id) on delete cascade,
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
  order_index integer not null check (order_index between 1 and 5),
  unique (assignment_id, order_index)
);

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
  assessment_transcript text,
  assessment_correct boolean not null default false,
  assessment_recording_url text,
  created_at timestamptz not null default now(),
  unique (attempt_id, assignment_item_id)
);

create index if not exists ncs_attempts_student_idx on public.ncs_attempts(student_id);
create index if not exists ncs_attempt_items_attempt_idx on public.ncs_attempt_items(attempt_id);
create index if not exists ncs_assignment_items_assignment_idx on public.ncs_assignment_items(assignment_id);
create index if not exists ncs_class_students_class_idx on public.ncs_class_students(class_id);

-- Supabase Storage bucket for recordings (run only on the Supabase project, harmless elsewhere).
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('recordings', 'recordings', true)
  on conflict (id) do nothing;
exception
  when undefined_table then null;
end $$;
