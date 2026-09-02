-- Historical exchange-rate tracking: expenses/recurring rules snapshot the
-- USD rate at their own transaction date so old records never re-convert at
-- today's rate. exchange_rates is shared reference data (not user-owned).

create table public.exchange_rates (
  currency text not null,
  date date not null,
  rate_to_usd numeric(14,8) not null,
  fetched_at timestamptz not null default now(),
  primary key (currency, date)
);

create index exchange_rates_currency_date_idx on public.exchange_rates(currency, date);

alter table public.expenses
  add column if not exists exchange_rate_to_usd numeric(14,8),
  add column if not exists base_currency text default 'USD';

alter table public.recurring_rules
  add column if not exists exchange_rate_to_usd numeric(14,8),
  add column if not exists base_currency text default 'USD';

alter table public.exchange_rates enable row level security;

create policy "exchange rates readable by authenticated"
  on public.exchange_rates for select to authenticated using (true);

create policy "exchange rates insertable by authenticated"
  on public.exchange_rates for insert to authenticated with check (true);

create policy "exchange rates updatable by authenticated"
  on public.exchange_rates for update to authenticated using (true) with check (true);

grant select, insert, update on public.exchange_rates to authenticated;
