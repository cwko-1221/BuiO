alter table public.ncs_attempt_items add column if not exists speech_pronunciation_score numeric(5,2);
alter table public.ncs_attempt_items add column if not exists speech_pronunciation_status text;
alter table public.ncs_attempt_items add column if not exists speech_audio_quality jsonb;
alter table public.ncs_attempt_items add column if not exists speech_pronunciation_provider text;
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_score numeric(5,2);
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_status text;
alter table public.ncs_attempt_items add column if not exists assessment_audio_quality jsonb;
alter table public.ncs_attempt_items add column if not exists assessment_pronunciation_provider text;
