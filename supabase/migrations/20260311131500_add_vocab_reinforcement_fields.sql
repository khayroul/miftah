alter table public.vocab_progress
  add column if not exists needs_reinforcement boolean not null default false,
  add column if not exists mistake_streak integer not null default 0,
  add column if not exists last_incorrect_at timestamptz;

create index if not exists vocab_progress_user_reinforcement_due_idx
  on public.vocab_progress (user_id, needs_reinforcement desc, due asc);
