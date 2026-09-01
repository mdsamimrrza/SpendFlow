-- Append-only settings history so past reports can be reconstructed with the
-- budget and paycheck-cycle values that were actually active at the time.
-- The live columns on public.users / public.categories stay the source of
-- truth for "now"; every change appends a row here with the date it took
-- effect. No update policy on purpose — rows are never edited.

create table public.user_settings_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  effective_from date not null,
  monthly_budget numeric,
  cycle_start_day integer not null default 1
    check (cycle_start_day >= 1 and cycle_start_day <= 31),
  cycle_end_day integer
    check (cycle_end_day is null or (cycle_end_day >= 1 and cycle_end_day <= 31)),
  created_at timestamptz not null default now()
);

create index user_settings_history_user_from_idx
  on public.user_settings_history(user_id, effective_from);

create table public.category_budget_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  effective_from date not null,
  budget_monthly numeric,
  created_at timestamptz not null default now()
);

create index category_budget_history_cat_from_idx
  on public.category_budget_history(category_id, effective_from);

create index category_budget_history_user_from_idx
  on public.category_budget_history(user_id, effective_from);

alter table public.user_settings_history enable row level security;
alter table public.category_budget_history enable row level security;

create policy "user settings history select own"
  on public.user_settings_history for select using (auth.uid() = user_id);
create policy "user settings history insert own"
  on public.user_settings_history for insert with check (auth.uid() = user_id);
create policy "user settings history delete own"
  on public.user_settings_history for delete using (auth.uid() = user_id);

create policy "category budget history select own"
  on public.category_budget_history for select using (auth.uid() = user_id);
create policy "category budget history insert own"
  on public.category_budget_history for insert with check (auth.uid() = user_id);
create policy "category budget history delete own"
  on public.category_budget_history for delete using (auth.uid() = user_id);
