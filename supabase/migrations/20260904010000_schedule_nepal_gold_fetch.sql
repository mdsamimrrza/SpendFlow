-- ─────────────────────────────────────────────────────────────────────────────
-- Server-side daily schedule for the Nepal gold rate fetch.
--
-- Nepal Standard Time is UTC+05:45 year-round (no DST), so the NPT wall-clock
-- schedule maps to fixed UTC times:
--   11:00 NPT → 05:15 UTC   (primary attempt)
--   11:15 NPT → 05:30 UTC   (retry)
--   11:30 NPT → 05:45 UTC   (retry)
--   12:00 NPT → 06:15 UTC   (final retry)
--
-- Every invocation is idempotent: once today's verified row exists the
-- function exits, so later slots after a successful fetch are no-ops.
--
-- ONE-TIME SETUP (Dashboard → SQL editor, replace the two placeholders):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'spendflow_project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'spendflow_service_role_key');
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create or replace function public.trigger_fetch_nepal_gold_rate()
returns bigint
language plpgsql
security definer
as $$
declare
  job_id bigint;
begin
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'spendflow_project_url')
           || '/functions/v1/fetch-nepal-gold-rate',
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

-- Main attempt: 11:00 AM NPT, every day (Saturday runs exit harmlessly because
-- the source keeps Friday's fix and the function rejects stale publications).
select cron.schedule(
  'spendflow-nepal-gold-1100am-npt',
  '15 5 * * *',
  $$select public.trigger_fetch_nepal_gold_rate();$$
);

-- Delayed-publication retries.
select cron.schedule(
  'spendflow-nepal-gold-1115am-npt',
  '30 5 * * *',
  $$select public.trigger_fetch_nepal_gold_rate();$$
);

select cron.schedule(
  'spendflow-nepal-gold-1130am-npt',
  '45 5 * * *',
  $$select public.trigger_fetch_nepal_gold_rate();$$
);

select cron.schedule(
  'spendflow-nepal-gold-1200pm-npt',
  '15 6 * * *',
  $$select public.trigger_fetch_nepal_gold_rate();$$
);
