create extension if not exists pgcrypto;

create table if not exists public.practice_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text not null,
  type text not null check (type in ('Project', 'LeetCode')),
  minutes integer not null check (minutes > 0),
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists practice_entries_user_date_idx
  on public.practice_entries (user_id, date desc, created_at desc);

alter table public.practice_entries enable row level security;

create policy "Users can read their own practice entries"
  on public.practice_entries
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own practice entries"
  on public.practice_entries
  for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own practice entries"
  on public.practice_entries
  for delete
  using (auth.uid() = user_id);
