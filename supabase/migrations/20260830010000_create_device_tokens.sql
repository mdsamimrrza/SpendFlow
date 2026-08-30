-- Device push tokens: one row per device a user is signed in on.
-- Used to send cross-device push notifications when expenses/incomes are added.

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

drop policy if exists "Users can manage own device tokens" on public.device_tokens;
create policy "Users can manage own device tokens"
  on public.device_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
