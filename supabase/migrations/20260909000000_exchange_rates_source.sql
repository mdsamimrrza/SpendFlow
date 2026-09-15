-- Description: Adds rate provenance to exchange_rates. Rows existing before
-- this migration were written by the seed/backfill process with no source
-- recorded, so they are labeled 'backfill'. New rows from trusted server-side
-- processes should set the provider name explicitly ('exchangerate_host',
-- 'open_er_api', 'exchangerate_api', 'static_fallback', ...). The column is
-- nullable-additive: existing SELECTs in the client don't reference it, and
-- the (currency, date) key + rate_to_usd values are untouched — purely
-- auditability ("which provider supplied this rate"), no display impact.

alter table public.exchange_rates
  add column if not exists source text;

update public.exchange_rates
  set source = 'backfill'
  where source is null;
