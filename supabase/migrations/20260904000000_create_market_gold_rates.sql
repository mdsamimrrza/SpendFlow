-- ─────────────────────────────────────────────────────────────────────────────
-- Central authoritative daily bullion rates (FENEGOSIDA / Nepal).
-- One row per (rate_date, country_code) — the single source of truth the
-- scheduled Edge Function writes and every app instance reads.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.market_gold_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  country_code text not null default 'NP',
  currency_code text not null default 'NPR',

  -- NPR per unit, exactly as published by the market authority
  fine_gold_per_tola numeric not null,
  fine_gold_per_10g numeric,
  tejabi_gold_per_tola numeric,
  tejabi_gold_per_10g numeric,
  silver_per_tola numeric,
  silver_per_10g numeric,

  -- Transparency metadata: declared market authority vs. actual fetch source
  source text not null default 'FENEGOSIDA',
  source_url text,
  fetch_source text not null,
  market_authority text not null default 'FENEGOSIDA',

  fetched_at timestamptz not null default now(),
  published_at timestamptz,
  status text not null default 'verified',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Database-level idempotency: retries / duplicate scheduler runs can never
  -- create a second authoritative record for the same market day.
  constraint market_gold_rates_unique_day unique (rate_date, country_code)
);

create index market_gold_rates_country_date_idx
  on public.market_gold_rates (country_code, rate_date desc);

create trigger market_gold_rates_set_updated_at
  before update on public.market_gold_rates
  for each row execute function public.set_updated_at();

alter table public.market_gold_rates enable row level security;

-- App clients (authenticated) read-only; all writes happen server-side
-- via the scheduled Edge Function using the service role key.
create policy "market gold rates readable by authenticated"
  on public.market_gold_rates for select
  using (auth.role() = 'authenticated');
