-- ─────────────────────────────────────────────────────────────────────────────
-- Audit run-2 (2026-09-16): budget-currency durability + exchange-rate freshness.
--
-- 1. users.budget_currency: the CRITICAL budget-currency rule in AGENTS.md
--    assumed this column existed; production never got the migration, so the
--    only durable store was auth metadata + a per-device AsyncStorage mirror.
--    One stale metadata sync and a stored INR budget re-reads as AED (26× error).
--    Add the column and backfill it from the de-facto stores, most-trusted first.
-- 2. users.cycle_end_day: same divergence class — metadata held 29 while the
--    DB row held null. Backfill validated values so DB is the single truth.
-- 3. exchange_rates: a one-time backfill (Sep 9) wrote a FUTURE-dated INR row
--    (2026-09-18) carrying Sep 9's rate — the deprecated frankfurter.app
--    endpoint echoed its latest quote for the future date. Nearest-on/before
--    lookups would silently price anything from Sep 18 on with stale data.
--    Delete future-dated rows; the writer scripts now refuse them.
-- 4. Rate warming: the audit-1 client upsert was removed and the replacement
--    pg_cron job was never scheduled, so the table has been frozen since
--    Sep 9. Schedule the established pg_net → Edge Function pattern (same as
--    the Nepali gold fetch) to store yesterday's ECB fixing daily.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Budget currency column ------------------------------------------------------------
alter table public.users
  add column if not exists budget_currency text;

alter table public.users
  drop constraint if exists users_budget_currency_check;

alter table public.users
  add constraint users_budget_currency_check
  check (budget_currency is null or (budget_currency COLLATE "C") ~ '^[A-Z]{3}$');

-- Backfill: validated auth metadata → latest non-null settings-history value →
-- display currency of users who actually hold a budget. Only fills NULLs.
update public.users u
set budget_currency = m.meta_ccy
from (
  select
    au.id,
    case
      when (au.raw_user_meta_data ->> 'budget_currency') collate "C" ~ '^[A-Za-z]{3}$'
        then upper(au.raw_user_meta_data ->> 'budget_currency')
    end as meta_ccy
  from auth.users au
) m
where m.id = u.id
  and u.budget_currency is null
  and m.meta_ccy is not null;

update public.users u
set budget_currency = h.budget_currency
from (
  select distinct on (h0.user_id) h0.user_id, h0.budget_currency
  from public.user_settings_history h0
  where h0.budget_currency is not null
  order by h0.user_id, h0.effective_from desc
) h
where h.user_id = u.id
  and u.budget_currency is null;

update public.users
set budget_currency = preferred_currency
where budget_currency is null
  and monthly_budget is not null
  and monthly_budget > 0;

-- 2. Cycle end day: recover validated metadata values the DB never received ----------
update public.users u
set cycle_end_day = m.meta_end
from (
  select
    au.id,
    case
      when (au.raw_user_meta_data ->> 'cycle_end_day') collate "C" ~ '^[0-9]{1,2}$'
        then (au.raw_user_meta_data ->> 'cycle_end_day')::int
    end as meta_end
  from auth.users au
) m
where m.id = u.id
  and u.cycle_end_day is null
  and m.meta_end >= 1
  and m.meta_end <= 31;

-- 3. Purge impossible future-dated rate rows -------------------------------------------
delete from public.exchange_rates
where date > current_date;

-- 4. Daily rate warming (pg_net → fetch-exchange-rates Edge Function) -------------------
-- ECB/Frankfurter's "latest" fixes at ~16:00 CET (14:00–15:00 UTC); run at 16:30 UTC
-- so the day's fixing is always available. Idempotent function → safe to retry.
create extension if not exists pg_net;

create or replace function public.trigger_fetch_exchange_rates()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  job_id bigint;
begin
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'spendflow_project_url')
           || '/functions/v1/fetch-exchange-rates',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'spendflow_service_role_key'),
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 20000
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function public.trigger_fetch_exchange_rates() from public, anon, authenticated;

select cron.schedule(
  'spendflow-exchange-rates-daily',
  '30 16 * * *',
  $$select public.trigger_fetch_exchange_rates();$$
);
