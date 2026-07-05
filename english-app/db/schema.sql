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

create table if not exists public.eng_question_bank (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  word text not null,
  hint text,
  emoji text,
  image_url text,
  created_at timestamptz not null default now(),
  unique (category, word),
  check (word = lower(word)),
  check (word ~ '^[a-z]{2,12}$')
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
create index if not exists eng_question_bank_category_idx on public.eng_question_bank(category);

insert into public.eng_question_bank (category, word, hint, emoji) values
  ('Animals', 'cat', '貓', '🐱'),
  ('Animals', 'dog', '狗', '🐶'),
  ('Animals', 'bird', '鳥', '🐦'),
  ('Animals', 'fish', '魚', '🐟'),
  ('Animals', 'horse', '馬', '🐴'),
  ('Animals', 'rabbit', '兔', '🐰'),
  ('Animals', 'tiger', '老虎', '🐯'),
  ('Animals', 'lion', '獅子', '🦁'),
  ('Food', 'apple', '蘋果', '🍎'),
  ('Food', 'bread', '麵包', '🍞'),
  ('Food', 'cake', '蛋糕', '🍰'),
  ('Food', 'rice', '飯', '🍚'),
  ('Food', 'milk', '牛奶', '🥛'),
  ('Food', 'egg', '蛋', '🥚'),
  ('Food', 'corn', '粟米', '🌽'),
  ('Food', 'grape', '提子', '🍇'),
  ('Home', 'bed', '床', '🛏️'),
  ('Home', 'door', '門', '🚪'),
  ('Home', 'lamp', '燈', '💡'),
  ('Home', 'chair', '椅子', '🪑'),
  ('Home', 'table', '桌子', null),
  ('Home', 'clock', '時鐘', '🕒'),
  ('Home', 'book', '書', '📘'),
  ('School', 'pen', '筆', '🖊️'),
  ('School', 'ruler', '尺', '📏'),
  ('School', 'paper', '紙', '📄'),
  ('School', 'desk', '書桌', null),
  ('School', 'class', '課室', '🏫'),
  ('School', 'music', '音樂', '🎵'),
  ('School', 'paint', '畫畫', '🎨')
on conflict (category, word) do nothing;
