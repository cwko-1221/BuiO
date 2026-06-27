-- BuiO English Spelling module schema.
-- Assignments target a (classname, chinese_group) pair the same way the
-- Chinese module does, so the dropdown is identical.

create extension if not exists "pgcrypto";

do $$
begin
  create type public.eng_assignment_status as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.eng_attempt_status as enum ('in_progress', 'completed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.eng_assignments (
  id uuid primary key default gen_random_uuid(),
  target_classname text not null,
  target_group text not null,
  title text not null,
  status public.eng_assignment_status not null default 'published',
  created_by text not null references public.users(studentid) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.eng_assignment_items (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.eng_assignments(id) on delete cascade,
  word text not null,                    -- target word, normalised lowercase
  hint text,                             -- optional Chinese / English hint
  image_url text,
  order_index integer not null check (order_index between 1 and 5),
  unique (assignment_id, order_index)
);

create table if not exists public.eng_attempts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.eng_assignments(id) on delete cascade,
  student_id text not null references public.users(studentid) on delete cascade,
  status public.eng_attempt_status not null default 'in_progress',
  score integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (assignment_id, student_id)
);

create table if not exists public.eng_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.eng_attempts(id) on delete cascade,
  assignment_item_id uuid not null references public.eng_assignment_items(id) on delete cascade,
  correct boolean not null default false,
  hearts_left integer not null default 3,
  attempts_used integer not null default 0,
  created_at timestamptz not null default now(),
  unique (attempt_id, assignment_item_id)
);

create index if not exists eng_attempts_student_idx on public.eng_attempts(student_id);
create index if not exists eng_attempt_items_attempt_idx on public.eng_attempt_items(attempt_id);
create index if not exists eng_assignment_items_assignment_idx on public.eng_assignment_items(assignment_id);
create index if not exists eng_assignments_target_idx on public.eng_assignments(target_classname, target_group);
