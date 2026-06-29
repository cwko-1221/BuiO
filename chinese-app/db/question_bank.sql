-- Question bank for the Chinese module.
-- Teachers can pick a category and have N random items inserted into a new
-- assignment without typing each word manually. Each item stores an emoji
-- so the practice page can show a visual without us hand-uploading images;
-- the runtime turns the emoji into a CDN PNG URL.

create extension if not exists "pgcrypto";

create table if not exists public.ncs_question_bank (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  traditional_text text not null,
  english_meaning text not null,
  emoji text,
  created_at timestamptz not null default now(),
  unique (category, traditional_text)
);

create index if not exists ncs_question_bank_category_idx
  on public.ncs_question_bank(category);

-- --------------------------------------------------------------------------
-- 日常用語 — 50 entries
-- --------------------------------------------------------------------------
insert into public.ncs_question_bank (category, traditional_text, english_meaning, emoji) values
  ('日常用語', '你', 'you',           '👤'),
  ('日常用語', '我', 'I / me',        '🙋'),
  ('日常用語', '他', 'he / him',      '👨'),
  ('日常用語', '她', 'she / her',     '👩'),
  ('日常用語', '是', 'yes / to be',   '✅'),
  ('日常用語', '不', 'no / not',      '❌'),
  ('日常用語', '好', 'good',          '👍'),
  ('日常用語', '大', 'big',           '🐘'),
  ('日常用語', '小', 'small',         '🐭'),
  ('日常用語', '多', 'many',          '📦'),
  ('日常用語', '少', 'few',           '🔹'),
  ('日常用語', '早', 'early',         '🌅'),
  ('日常用語', '晚', 'night / late',  '🌙'),
  ('日常用語', '上', 'up / above',    '⬆️'),
  ('日常用語', '下', 'down / below',  '⬇️'),
  ('日常用語', '來', 'come',          '🚶'),
  ('日常用語', '去', 'go',            '🚶‍♂️'),
  ('日常用語', '吃', 'eat',           '🍽️'),
  ('日常用語', '喝', 'drink',         '🥤'),
  ('日常用語', '看', 'see / look',    '👀'),
  ('日常用語', '聽', 'hear / listen', '👂'),
  ('日常用語', '說', 'say / speak',   '💬'),
  ('日常用語', '讀', 'read',          '📖'),
  ('日常用語', '寫', 'write',         '✏️'),
  ('日常用語', '走', 'walk',          '🚶'),
  ('日常用語', '跑', 'run',           '🏃'),
  ('日常用語', '跳', 'jump',          '🤸'),
  ('日常用語', '笑', 'laugh / smile', '😄'),
  ('日常用語', '哭', 'cry',           '😢'),
  ('日常用語', '玩', 'play',          '🎮'),
  ('日常用語', '睡', 'sleep',         '😴'),
  ('日常用語', '想', 'think / want',  '💭'),
  ('日常用語', '愛', 'love',          '💕'),
  ('日常用語', '家', 'home',          '🏠'),
  ('日常用語', '人', 'person',        '🧑'),
  ('日常用語', '學', 'study',         '📚'),
  ('日常用語', '校', 'school',        '🏫'),
  ('日常用語', '書', 'book',          '📖'),
  ('日常用語', '筆', 'pen',           '🖊️'),
  ('日常用語', '紙', 'paper',         '📄'),
  ('日常用語', '字', 'character',     '🔤'),
  ('日常用語', '朋友', 'friend',      '🤝'),
  ('日常用語', '老師', 'teacher',     '👨‍🏫'),
  ('日常用語', '學生', 'student',     '🎓'),
  ('日常用語', '爸爸', 'dad',         '👨'),
  ('日常用語', '媽媽', 'mom',         '👩'),
  ('日常用語', '哥哥', 'older brother','👦'),
  ('日常用語', '姐姐', 'older sister', '👧'),
  ('日常用語', '早安', 'good morning', '🌅'),
  ('日常用語', '晚安', 'good night',   '🌙')
on conflict (category, traditional_text) do nothing;
