create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  avatar_url text,
  preferred_currency text not null default 'NPR',
  theme_preference text not null default 'system' check (theme_preference in ('light', 'dark', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_custom boolean not null default false,
  budget_monthly numeric,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric not null check (amount > 0),
  currency text not null default 'NPR',
  description text,
  payment_method text not null default 'Cash' check (payment_method in ('Cash','Card','UPI','Other')),
  frequency text not null check (frequency in ('daily','weekly','monthly','custom')),
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric not null check (amount > 0),
  currency text not null default 'NPR',
  description text,
  date date not null,
  time time,
  payment_method text not null default 'Cash' check (payment_method in ('Cash','Card','UPI','Other')),
  notes text,
  receipt_image_url text,
  is_recurring boolean not null default false,
  recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  is_synced boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_user_id_idx on public.categories(user_id);
create index recurring_rules_user_id_idx on public.recurring_rules(user_id);
create index recurring_rules_next_due_idx on public.recurring_rules(user_id, next_due_date) where is_active = true;
create index expenses_user_date_idx on public.expenses(user_id, date);
create index expenses_category_id_idx on public.expenses(category_id);
create index expenses_user_deleted_idx on public.expenses(user_id, deleted_at);

create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger recurring_rules_set_updated_at before update on public.recurring_rules for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at before update on public.expenses for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.expenses enable row level security;

create policy "users select own row" on public.users for select using (auth.uid() = id);
create policy "users insert own row" on public.users for insert with check (auth.uid() = id);
create policy "users update own row" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "users delete own row" on public.users for delete using (auth.uid() = id);

create policy "categories select own rows" on public.categories for select using (auth.uid() = user_id);
create policy "categories insert own rows" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories update own rows" on public.categories for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories delete own rows" on public.categories for delete using (auth.uid() = user_id);

create policy "recurring rules select own rows" on public.recurring_rules for select using (auth.uid() = user_id);
create policy "recurring rules insert own rows" on public.recurring_rules for insert with check (auth.uid() = user_id);
create policy "recurring rules update own rows" on public.recurring_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring rules delete own rows" on public.recurring_rules for delete using (auth.uid() = user_id);

create policy "expenses select own rows" on public.expenses for select using (auth.uid() = user_id);
create policy "expenses insert own rows" on public.expenses for insert with check (auth.uid() = user_id);
create policy "expenses update own rows" on public.expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses delete own rows" on public.expenses for delete using (auth.uid() = user_id);
